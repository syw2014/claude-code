import { describe, test, expect } from 'bun:test'
import { SSEEventType } from 'src/server/sse/types'
import type { SSEEvent, SSEPermissionRequired } from 'src/server/sse/types'

describe('SSE 事件类型', () => {
  test('SSEEventType 枚举包含所有 13 个事件', () => {
    expect(Object.keys(SSEEventType)).toHaveLength(13)
  })

  test('permission_required 事件字段齐备', () => {
    const event: SSEPermissionRequired = {
      type: 'permission_required',
      traceId: 'trace_001',
      sequence: 7,
      sessionId: 'sess_001',
      taskId: 'task_001',
      confirmId: 'confirm_001',
      operation: 'checkout_book',
      confirmLevel: 'explicit_confirm',
      requiredApproverRole: 'librarian',
      ruleWarnings: ['读者有 2 本逾期未还'],
      expiresAt: '2026-04-27T10:16:00.000Z',
    }
    expect(event.type).toBe('permission_required')
    expect(event.ruleWarnings).toHaveLength(1)
  })

  test('SSEEvent union 的 type 字段可作为类型收窄', () => {
    const events: SSEEvent[] = [
      { type: 'session_ready', traceId: 't', sequence: 1, sessionId: 's' },
      { type: 'done', traceId: 't', sequence: 99, sessionId: 's', taskId: 'task_001', taskStatus: 'succeeded', tokensUsed: 100 },
    ]
    for (const e of events) {
      expect(typeof e.type).toBe('string')
      expect(typeof e.sequence).toBe('number')
    }
  })
})
