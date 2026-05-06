// src/runtime/types.ts
import type { BizRef, FactSet, ConfirmLevel, ApproverRole } from '@claude-code-best/industry-adapter'

export type UUID = string

// ─── 权限模式（原 bootstrap/state.ts permissionMode）────────────────────────

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'

// ─── 状态枚举 ─────────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'created'
  | 'active'
  | 'waiting_human'
  | 'closing'
  | 'closed'
  | 'failed'
  | 'expired'

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_confirm'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'timeout'
  | 'cancelled'

export type ToolCallStatus =
  | 'planned'
  | 'permission_checking'
  | 'waiting_confirm'
  | 'executing'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'timeout'
  | 'cancelled'

export type ConfirmStatus =
  | 'pending'
  | 'escalated'
  | 'approved'
  | 'rejected'
  | 'timeout'
  | 'cancelled'

// ─── 通用基础类型 ─────────────────────────────────────────────────────────────

export interface ApiError {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export interface TokenCounts {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface RunRef {
  type: 'session' | 'task' | 'tool_call' | 'workflow' | 'subagent'
  id: UUID
  traceId: UUID
}

// ─── ContextEnvelope 支持类型 ─────────────────────────────────────────────────

export interface MemoryRef {
  memoryId: UUID
  memoryType: 'preference' | 'fact' | 'procedure' | 'summary'
  scope: 'user' | 'tenant' | 'industry'
  summary: string
}

export interface ToolResultSummary {
  toolCallId: UUID
  toolName: string
  channel: 'common_tool' | 'biz_tool' | 'mcp_tool' | 'workflow_tool'
  status: ToolCallStatus
  outputSummary: string
  durationMs?: number
  turnId: UUID
}

/** priorToolResults 超过阈值时的压缩摘要（见 spec §14.2.4）*/
export interface CompactedSummary {
  type: 'compacted_summary'
  count: number
  rangeStartTurnId: UUID
  rangeEndTurnId: UUID
  summary: string
}

export interface PromptRef {
  templateKey: string
  version: string
  chunkIds?: string[]
}

export interface CostState {
  inputTokensTotal: number
  outputTokensTotal: number
  budgetInputTokens?: number
  budgetOutputTokens?: number
  budgetExceeded: boolean
}

export interface PlanStep {
  id: string
  description: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  toolName?: string
}

export interface PlanState {
  planId: UUID
  steps: PlanStep[]
  currentStepIndex: number
  createdAt: string
  updatedAt: string
}

// ─── TaskRun 和 ToolCallRecord ────────────────────────────────────────────────

export type TaskMode = 'fast' | 'agent' | 'workflow' | 'subagent'

export interface TaskRun {
  id: UUID
  sessionId: UUID
  traceId: UUID
  tenantId: string
  userId: string
  industryCode: string
  input: string
  mode: TaskMode
  status: TaskStatus
  startedAt?: string
  completedAt?: string
}

export interface ToolCallRecord {
  id: UUID
  taskId: UUID
  traceId: UUID
  name: string
  channel: 'common_tool' | 'biz_tool' | 'mcp_tool' | 'workflow_tool'
  status: ToolCallStatus
  input: unknown
  output?: unknown
  error?: ApiError
  durationMs?: number
}

// ─── ConfirmRequest ───────────────────────────────────────────────────────────

export interface ConfirmRequest {
  id: UUID
  sessionId: UUID
  taskId: UUID
  traceId: UUID
  operation: string
  confirmLevel: ConfirmLevel
  requiredApproverRole: ApproverRole
  bizRefs: Record<string, BizRef>
  factSet: FactSet
  ruleWarnings: string[]
  expiresAt: string
}

// Re-export from industry-adapter for callers that only import from runtime/types
export type { ConfirmLevel, ApproverRole, BizRef, FactSet } from '@claude-code-best/industry-adapter'
