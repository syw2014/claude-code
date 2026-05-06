import type { UUID } from 'src/runtime/types'
import type { NormalizedIntent } from '@claude-code-best/industry-adapter'

export const SSEEventType = {
  SESSION_READY: 'session_ready',
  TASK_QUEUED: 'task_queued',
  INTENT_DETECTED: 'intent_detected',
  CONTEXT_BUILT: 'context_built',
  PLAN_CREATED: 'plan_created',
  MESSAGE_DELTA: 'message_delta',
  TOOL_STARTED: 'tool_started',
  TOOL_COMPLETED: 'tool_completed',
  PERMISSION_REQUIRED: 'permission_required',
  PERMISSION_RESOLVED: 'permission_resolved',
  WARNING: 'warning',
  ERROR: 'error',
  DONE: 'done',
} as const

export type SSEEventType = typeof SSEEventType[keyof typeof SSEEventType]

// ─── 事件基础字段 ─────────────────────────────────────────────────────────────

interface SSEBase {
  traceId: UUID
  sequence: number
  sessionId: UUID
  taskId?: UUID
}

// ─── 具体事件类型 ─────────────────────────────────────────────────────────────

export interface SSESessionReady extends SSEBase {
  type: 'session_ready'
}

export interface SSETaskQueued extends SSEBase {
  type: 'task_queued'
  taskId: UUID
  mode: string
}

export interface SSEIntentDetected extends SSEBase {
  type: 'intent_detected'
  intent: NormalizedIntent
}

export interface SSEContextBuilt extends SSEBase {
  type: 'context_built'
  bizRefsCount: number
}

export interface SSEPlanCreated extends SSEBase {
  type: 'plan_created'
  stepCount: number
}

export interface SSEMessageDelta extends SSEBase {
  type: 'message_delta'
  delta: string
}

export interface SSEToolStarted extends SSEBase {
  type: 'tool_started'
  toolCallId: UUID
  toolName: string
  channel: string
}

export interface SSEToolCompleted extends SSEBase {
  type: 'tool_completed'
  toolCallId: UUID
  toolName: string
  status: 'succeeded' | 'failed'
  durationMs: number
}

export interface SSEPermissionRequired extends SSEBase {
  type: 'permission_required'
  confirmId: UUID
  operation: string
  confirmLevel: string
  requiredApproverRole: string
  ruleWarnings: string[]
  expiresAt: string
}

export interface SSEPermissionResolved extends SSEBase {
  type: 'permission_resolved'
  confirmId: UUID
  decision: 'approve' | 'reject' | 'timeout'
}

export interface SSEWarning extends SSEBase {
  type: 'warning'
  warningCode: string
  message: string
}

export interface SSEError extends SSEBase {
  type: 'error'
  errorCode: string
  message: string
  retryable: boolean
}

export interface SSEDone extends SSEBase {
  type: 'done'
  taskId: UUID
  taskStatus: string
  tokensUsed: number
}

export type SSEEvent =
  | SSESessionReady
  | SSETaskQueued
  | SSEIntentDetected
  | SSEContextBuilt
  | SSEPlanCreated
  | SSEMessageDelta
  | SSEToolStarted
  | SSEToolCompleted
  | SSEPermissionRequired
  | SSEPermissionResolved
  | SSEWarning
  | SSEError
  | SSEDone
