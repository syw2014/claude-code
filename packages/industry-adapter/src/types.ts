// packages/industry-adapter/src/types.ts

// ─── 标量 ────────────────────────────────────────────────────────────────────

export type UUID = string

export type PermissionLevel = 'low' | 'medium' | 'high'

export type ConfirmLevel =
  | 'auto'
  | 'silent_confirm'
  | 'explicit_confirm'
  | 'supervisor_approval'

export type ApproverRole = 'user' | 'librarian' | 'supervisor' | 'admin'

// ─── 意图识别 ─────────────────────────────────────────────────────────────────

export interface NormalizedIntent {
  sceneCode: string
  actionCode: string
  confidence: number
  pathType: 'fast' | 'complex'
  requiredParams: string[]
  rawInput: string
}

export interface IntentTemplate {
  sceneCode: string
  pathType: 'fast' | 'complex'
  examples: string[]
  requiredParams: string[]
}

export interface ConfidenceScore {
  keywordMatch: number
  embeddingSimilarity: number
  structureMatch: number
  contextConsistency: number
}

// ─── 业务对象 ─────────────────────────────────────────────────────────────────

export interface BizRef {
  type: string
  id: string
  displayName?: string
  status?: string
  attrs: Record<string, unknown>
  constraints: string[]
  sourceSystem: string
  snapshotAt: string
}

export interface FactSet {
  facts: Record<string, unknown>
  sources: Array<{ key: string; source: string; confidence?: number }>
  builtAt: string
}

// ─── 规则引擎 ─────────────────────────────────────────────────────────────────

export interface RuleCheckInput {
  tenantId: string
  industryCode: string
  ruleVersion: string
  operation: string
  userId: string
  userRole: string
  bizRefs: Record<string, BizRef>
  factSet: FactSet
  context: Record<string, unknown>
}

export interface MatchedRule {
  ruleId: string
  severity: 'info' | 'warn' | 'block'
  reason: string
}

export interface RuleCheckResult {
  result: 'PASS' | 'WARN' | 'BLOCKED'
  ruleVersion: string
  matchedRules: MatchedRule[]
  warnings: string[]
  requiredConfirmLevel: ConfirmLevel
  requiredApproverRole?: ApproverRole
}

export interface RuleSet {
  version: string
  check(input: RuleCheckInput): RuleCheckResult
}

// ─── ContextEnvelope 绑定类型 ─────────────────────────────────────────────────

export interface RuleBinding {
  ruleId: string
  ruleVersion: string
  operation: string
  result: 'PASS' | 'WARN' | 'BLOCKED'
  reasons: string[]
}

export interface CapabilityBinding {
  channel: 'tool' | 'skill' | 'workflow' | 'subagent'
  capabilityName: string
  permissionLevel: PermissionLevel
  confirmLevel: ConfirmLevel
}

// ─── 能力对象 ─────────────────────────────────────────────────────────────────

export interface Skill {
  name: string
  description: string
  content: string
  industry: string
  requiresTools: string[]
  permissionLevel: PermissionLevel
}

export interface WorkflowStep {
  id: string
  tool: string
  params: Record<string, unknown>
  onError?: 'abort' | 'continue' | 'retry'
}

export interface Workflow {
  name: string
  description: string
  industry: string
  steps: WorkflowStep[]
}

// ─── Adapter 组件接口 ─────────────────────────────────────────────────────────

export interface SemanticMapper {
  map(
    input: string,
    tenantId: string,
    sessionHistory?: NormalizedIntent[]
  ): Promise<NormalizedIntent>
}

export interface BizRefBuilder {
  build(
    intent: NormalizedIntent,
    tenantId: string
  ): Promise<{ bizRefs: Record<string, BizRef>; factSet: FactSet }>
}

export interface CapabilityGateway {
  route(
    intent: NormalizedIntent,
    bizRefs: Record<string, BizRef>
  ): CapabilityBinding[]
}

// ─── IndustryAdapter ─────────────────────────────────────────────────────────

export interface IndustryAdapter {
  industryCode: string
  semanticMapper: SemanticMapper
  bizRefBuilder: BizRefBuilder
  capabilityGateway: CapabilityGateway
  getBizTools(): unknown[]
  getBizSkills(): Skill[]
  getBizWorkflows(): Workflow[]
  getRules(): RuleSet
}
