// src/audit/types.ts
import type { UUID } from 'src/runtime/types'

export type AuditEventType =
  | 'session_created'
  | 'session_closed'
  | 'request_received'
  | 'intent_detected'
  | 'context_built'
  | 'plan_created'
  | 'tool_call_started'
  | 'tool_call_completed'
  | 'permission_check'
  | 'permission_required'
  | 'human_confirm'
  | 'permission_timeout'
  | 'subagent_spawned'
  | 'memory_read'
  | 'memory_write'
  | 'knowledge_query'
  | 'rule_check'
  | 'error'
  | 'response_sent'

export type AuditSeverity = 'info' | 'warn' | 'error' | 'security'

export interface AuditEvent {
  id: UUID
  traceId: UUID
  /** trace 内严格递增，由 AuditSequence 模块在写入 Redis Stream 前分配 */
  sequence: number
  sessionId: UUID
  taskId?: UUID
  toolCallId?: UUID
  confirmId?: UUID
  tenantId: string
  userId: string
  industryCode: string
  eventType: AuditEventType
  severity: AuditSeverity
  /** 脱敏后的事件详情，禁止写入 API key/token/密码/证件号等敏感字段 */
  payload: Record<string, unknown>
  createdAt: string
}

/** Redis Stream 消息格式，AuditWriter 写入，AuditConsumer 消费 */
export interface AuditStreamMessage {
  auditEvent: AuditEvent
  /** requireAuditDurability=true 时，Consumer 需确认落库后才 ACK */
  requireDurability: boolean
}
