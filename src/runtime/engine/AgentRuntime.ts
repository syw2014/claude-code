// src/runtime/engine/AgentRuntime.ts
import type { UUID, TaskMode, TaskStatus, TokenCounts } from '../types.js'
import type { NormalizedIntent } from '@claude-code-best/industry-adapter'
import type { SessionContext } from '../context/SessionContext.js'
import { checkPermission } from '../permission/PermissionGate.js'
import { CostMonitor } from './CostMonitor.js'
import { ErrorHandler } from './ErrorHandler.js'

export interface TaskDispatch {
  taskId: UUID
  sessionId: UUID
  traceId: UUID
  input: string
  mode: TaskMode
}

export interface RuntimeResult {
  taskId: UUID
  status: TaskStatus
  output?: string
  tokensUsed?: TokenCounts
  error?: string
}

/**
 * AgentRuntime orchestrates the task lifecycle.
 * Fast path: confidence ≥ 0.95 + fast pathType + all params present → skip LLM.
 * Slow path: full Claude turn loop via QueryRuntime.
 */
export class AgentRuntime {
  private costMonitor: CostMonitor
  private errorHandler: ErrorHandler

  constructor(
    private ctx: SessionContext,
    costConfig?: { budgetInputTokens?: number; budgetOutputTokens?: number }
  ) {
    this.costMonitor = new CostMonitor(costConfig)
    this.errorHandler = new ErrorHandler({ maxAttempts: 3 })
  }

  /**
   * Determine if the fast path applies for a given intent.
   * Fast path: confidence ≥ 0.95, pathType = 'fast', all requiredParams present in bizRefs.
   */
  shouldUseFastPath(intent: NormalizedIntent): boolean {
    if (intent.pathType !== 'fast') return false
    if (intent.confidence < 0.95) return false
    return intent.requiredParams.every(p => p in this.ctx.envelope.bizRefs)
  }

  /**
   * Run permission check for an operation.
   * Returns null if allowed, or a reason string if blocked.
   */
  checkOperationPermission(operation: string): { blocked: boolean; reason?: string; needsHuman?: boolean } {
    const ruleSet = this.ctx.ruleSet
    const ruleResult = ruleSet.check({
      tenantId: this.ctx.tenantId,
      industryCode: this.ctx.industryCode,
      ruleVersion: ruleSet.version,
      operation,
      userId: this.ctx.userId,
      userRole: 'user',
      bizRefs: this.ctx.envelope.bizRefs,
      factSet: this.ctx.envelope.factSet,
      context: {},
    })

    const decision = checkPermission({
      ctx: this.ctx,
      operation,
      permissionLevel: 'medium',
      ruleResult,
    })

    if (decision.verdict === 'block') {
      return { blocked: true, reason: decision.reason }
    }
    if (decision.verdict === 'require_human') {
      return { blocked: false, needsHuman: true }
    }
    return { blocked: false }
  }

  getCostMonitor(): CostMonitor {
    return this.costMonitor
  }

  getErrorHandler(): ErrorHandler {
    return this.errorHandler
  }
}
