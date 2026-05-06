// src/server/schemas/api.ts
import type { UUID, TaskStatus, SessionStatus, PermissionMode, TaskMode } from 'src/runtime/types'
import type { NormalizedIntent } from '@claude-code-best/industry-adapter'

// ─── 通用响应包装 ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  requestId: string
  traceId?: string
  serverTime: string
  data: T
}

export interface ApiErrorResponse {
  requestId: string
  traceId?: string
  serverTime: string
  error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> }
}

export interface PageInfo {
  limit: number
  cursor: string | null
  hasMore: boolean
}

// ─── 14.4.1 创建会话 ──────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  tenantId: string
  userId: string
  industryCode: string
  permissionMode?: PermissionMode
  modelOverride?: string | null
  metadata?: Record<string, unknown>
}

export interface CreateSessionData {
  sessionId: UUID
  status: SessionStatus
  industryCode: string
  streamUrl: string
  createdAt: string
}

// ─── 14.4.2 查询会话 ──────────────────────────────────────────────────────────

export interface SessionData {
  sessionId: UUID
  status: SessionStatus
  industryCode: string
  currentTaskId?: UUID
  pendingConfirmId?: UUID
  createdAt: string
  updatedAt: string
}

// ─── 14.4.3 关闭会话 ──────────────────────────────────────────────────────────

export interface CloseSessionRequest {
  reason?: string
}

export interface CloseSessionData {
  sessionId: UUID
  status: 'closed'
  closedAt: string
}

// ─── 14.4.4 发送消息 ──────────────────────────────────────────────────────────

export interface SendMessageRequest {
  input: string
  mode?: 'auto' | TaskMode
  attachments?: unknown[]
  clientMessageId?: string
  metadata?: Record<string, unknown>
}

export interface SendMessageData {
  taskId: UUID
  sessionId: UUID
  status: 'queued'
  mode: TaskMode
  streamUrl: string
}

// ─── 14.4.5 查询任务状态 ─────────────────────────────────────────────────────

export interface TaskStatusData {
  taskId: UUID
  sessionId: UUID
  status: TaskStatus
  mode: TaskMode
  currentIntent?: NormalizedIntent
  pendingConfirmId?: UUID
  updatedAt: string
}

// ─── 14.4.7 人工确认回调 ─────────────────────────────────────────────────────

export interface ConfirmDecisionRequest {
  confirmId: UUID
  decision: 'approve' | 'reject'
  confirmedBy: string
  confirmedRole: string
  comment?: string
  clientDecisionId?: string
}

export interface ConfirmDecisionData {
  confirmId: UUID
  taskId: UUID
  status: 'approved' | 'rejected'
  nextTaskStatus: TaskStatus
}

// ─── 14.4.8-10 审计接口 ───────────────────────────────────────────────────────

export interface AuditTraceSummaryItem {
  traceId: UUID
  sessionId: UUID
  rootTaskId?: UUID
  userId: string
  industryCode: string
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  eventCount: number
  hasHumanConfirm: boolean
  hasHighRisk: boolean
  firstEventAt: string
  lastEventAt: string
  summary: Record<string, unknown>
}

export interface AuditTraceSummaryData {
  items: AuditTraceSummaryItem[]
  page: PageInfo
}

export interface AuditEventItem {
  sequence: number
  eventType: string
  severity: 'info' | 'warn' | 'error' | 'security'
  payload: Record<string, unknown>
  createdAt: string
}

export interface AuditTraceEventsData {
  traceId: UUID
  events: AuditEventItem[]
}

export interface ReplayStep {
  sequence: number
  kind: string
  title: string
  snapshot: Record<string, unknown>
}

export interface ReplayData {
  sessionId: UUID
  traceId: UUID
  steps: ReplayStep[]
}
