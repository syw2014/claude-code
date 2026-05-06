// src/audit/__tests__/types.test.ts
import { describe, test, expect } from 'bun:test'
import type { AuditEventType, AuditEvent } from 'src/audit/types'

describe('AuditEvent 类型', () => {
  test('AuditEventType 覆盖 19 种事件', () => {
    const all: AuditEventType[] = [
      'session_created', 'session_closed', 'request_received', 'intent_detected',
      'context_built', 'plan_created', 'tool_call_started', 'tool_call_completed',
      'permission_check', 'permission_required', 'human_confirm', 'permission_timeout',
      'subagent_spawned', 'memory_read', 'memory_write', 'knowledge_query',
      'rule_check', 'error', 'response_sent',
    ]
    expect(all).toHaveLength(19)
  })

  test('AuditEvent 可包含 toolCallId 和 confirmId', () => {
    const event: AuditEvent = {
      id: 'audit_001',
      traceId: 'trace_001',
      sequence: 7,
      sessionId: 'sess_001',
      taskId: 'task_001',
      toolCallId: 'tc_001',
      confirmId: 'confirm_001',
      tenantId: 'tenant_001',
      userId: 'user_001',
      industryCode: 'library',
      eventType: 'human_confirm',
      severity: 'security',
      payload: { decision: 'approve', confirmedBy: 'librarian_001' },
      createdAt: new Date().toISOString(),
    }
    expect(event.severity).toBe('security')
    expect(event.sequence).toBe(7)
  })
})
