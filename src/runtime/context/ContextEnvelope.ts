import type {
  UUID,
  MemoryRef,
  ToolResultSummary,
  CompactedSummary,
  PromptRef,
  CostState,
  PlanState,
} from '../types.js'
import type {
  NormalizedIntent,
  BizRef,
  FactSet,
  RuleBinding,
  CapabilityBinding,
} from '@claude-code-best/industry-adapter'

export interface ContextEnvelope {
  schemaVersion: 1
  sessionId: UUID
  traceId: UUID
  taskId?: UUID
  tenantId: string
  userId: string
  industryCode: string
  turnId: UUID

  // 请求级业务数据
  currentIntent?: NormalizedIntent
  bizRefs: Record<string, BizRef>
  factSet: FactSet

  // 上下文绑定
  memoryRefs: MemoryRef[]
  ruleBindings: RuleBinding[]
  capabilityBindings: CapabilityBinding[]

  // 执行状态
  planState?: PlanState
  /** 工具结果历史，超过 20 条时压缩（见 spec §14.2.4）*/
  priorToolResults: Array<ToolResultSummary | CompactedSummary>

  // 资源引用
  promptRefs: PromptRef[]
  costState: CostState

  createdAt: string
  updatedAt: string
}

/** 创建空白 ContextEnvelope（用于新会话/新 turn 初始化）*/
export function createEnvelope(
  params: Pick<
    ContextEnvelope,
    'sessionId' | 'traceId' | 'tenantId' | 'userId' | 'industryCode' | 'turnId'
  > & { taskId?: UUID }
): ContextEnvelope {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    ...params,
    bizRefs: {},
    factSet: { facts: {}, sources: [], builtAt: now },
    memoryRefs: [],
    ruleBindings: [],
    capabilityBindings: [],
    priorToolResults: [],
    promptRefs: [],
    costState: {
      inputTokensTotal: 0,
      outputTokensTotal: 0,
      budgetExceeded: false,
    },
    createdAt: now,
    updatedAt: now,
  }
}

/** priorToolResults 超过阈值时压缩（原地修改 envelope.priorToolResults）*/
export function compactPriorToolResults(
  envelope: ContextEnvelope,
  maxEntries = 20
): void {
  const results = envelope.priorToolResults
  if (results.length <= maxEntries) return

  const overflow = results.slice(0, results.length - maxEntries)
  const kept = results.slice(results.length - maxEntries)

  const firstOverflow = overflow[0]
  const lastOverflow = overflow[overflow.length - 1]
  const rangeStartTurnId =
    firstOverflow && 'turnId' in firstOverflow ? firstOverflow.turnId : 'unknown'
  const rangeEndTurnId =
    lastOverflow && 'turnId' in lastOverflow ? lastOverflow.turnId : 'unknown'

  const compacted: CompactedSummary = {
    type: 'compacted_summary',
    count: overflow.length,
    rangeStartTurnId,
    rangeEndTurnId,
    summary: overflow
      .filter((r): r is ToolResultSummary => 'outputSummary' in r)
      .map(r => `[${r.toolName}] ${r.outputSummary.slice(0, 100)}`)
      .join(' | '),
  }

  envelope.priorToolResults = [compacted, ...kept]
  envelope.updatedAt = new Date().toISOString()
}
