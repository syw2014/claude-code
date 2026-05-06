// src/persistence/redis/__tests__/keys.test.ts
import { describe, test, expect } from 'bun:test'
import {
  sessionKey,
  taskKey,
  sseKey,
  auditStreamKey,
  ruleActiveKey,
  idempotencyKey,
  shortMemoryKey,
  taskResumeQueueKey,
  auditSeqKey,
} from 'src/persistence/redis/keys'

describe('Redis key builders', () => {
  test('sessionKey', () => {
    expect(sessionKey('tenant1', 'sess1')).toBe('session:tenant1:sess1')
  })

  test('taskKey', () => {
    expect(taskKey('t1', 'task1')).toBe('task:t1:task1')
  })

  test('sseKey', () => {
    expect(sseKey('t1', 's1')).toBe('sse:t1:s1')
  })

  test('auditStreamKey', () => {
    expect(auditStreamKey('tenant_001')).toBe('audit_stream:tenant_001')
  })

  test('ruleActiveKey', () => {
    expect(ruleActiveKey('t1', 'library')).toBe('rule:t1:library:active')
  })

  test('idempotencyKey', () => {
    expect(idempotencyKey('t1', 'client_msg_001')).toBe('idem:t1:client_msg_001')
  })

  test('shortMemoryKey', () => {
    expect(shortMemoryKey('t1', 's1')).toBe('memory:short:t1:s1')
  })

  test('taskResumeQueueKey', () => {
    expect(taskResumeQueueKey('tenant_001')).toBe('task_resume_queue:tenant_001')
  })

  test('auditSeqKey', () => {
    expect(auditSeqKey('t1', 'trace_001')).toBe('audit_seq:t1:trace_001')
  })

  test('所有 key 包含 tenantId 防止跨租户冲突', () => {
    const keys = [
      sessionKey('t1', 's1'),
      taskKey('t1', 'task1'),
      sseKey('t1', 's1'),
      auditStreamKey('t1'),
      ruleActiveKey('t1', 'lib'),
      idempotencyKey('t1', 'k1'),
      shortMemoryKey('t1', 's1'),
      taskResumeQueueKey('t1'),
      auditSeqKey('t1', 'tr1'),
    ]
    for (const k of keys) {
      expect(k).toContain('t1')
    }
  })
})
