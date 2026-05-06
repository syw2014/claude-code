import { describe, test, expect } from 'bun:test'
import { createEnvelope, compactPriorToolResults } from 'src/runtime/context/ContextEnvelope'
import type { ContextEnvelope } from 'src/runtime/context/ContextEnvelope'
import type { ToolResultSummary } from 'src/runtime/types'

function makeEnvelope(): ContextEnvelope {
  return createEnvelope({
    sessionId: 'sess_001',
    traceId: 'trace_001',
    tenantId: 'tenant_001',
    userId: 'user_001',
    industryCode: 'library',
    turnId: 'turn_001',
  })
}

function makeToolResult(n: number): ToolResultSummary {
  return {
    toolCallId: `tc_${n}`,
    toolName: 'checkout_book',
    channel: 'biz_tool',
    status: 'succeeded',
    outputSummary: `借阅成功 #${n}`,
    durationMs: 100,
    turnId: `turn_${n}`,
  }
}

describe('createEnvelope', () => {
  test('返回 schemaVersion=1', () => {
    const e = makeEnvelope()
    expect(e.schemaVersion).toBe(1)
  })

  test('bizRefs 初始为空对象', () => {
    const e = makeEnvelope()
    expect(e.bizRefs).toEqual({})
  })

  test('costState.budgetExceeded 初始 false', () => {
    const e = makeEnvelope()
    expect(e.costState.budgetExceeded).toBe(false)
  })
})

describe('compactPriorToolResults', () => {
  test('条数不超过 maxEntries 时不压缩', () => {
    const e = makeEnvelope()
    e.priorToolResults = Array.from({ length: 20 }, (_, i) => makeToolResult(i))
    compactPriorToolResults(e, 20)
    expect(e.priorToolResults).toHaveLength(20)
    expect(e.priorToolResults[0]).not.toHaveProperty('type', 'compacted_summary')
  })

  test('超过 maxEntries 时压缩为 compacted_summary + kept', () => {
    const e = makeEnvelope()
    e.priorToolResults = Array.from({ length: 25 }, (_, i) => makeToolResult(i))
    compactPriorToolResults(e, 20)
    // 1 compacted + 20 kept = 21
    expect(e.priorToolResults).toHaveLength(21)
    expect(e.priorToolResults[0]).toHaveProperty('type', 'compacted_summary')
    const compacted = e.priorToolResults[0] as { type: string; count: number }
    expect(compacted.count).toBe(5)
  })

  test('压缩后 updatedAt 更新', () => {
    const e = makeEnvelope()
    const before = e.updatedAt
    e.priorToolResults = Array.from({ length: 25 }, (_, i) => makeToolResult(i))
    compactPriorToolResults(e, 20)
    expect(e.updatedAt >= before).toBe(true)
  })
})
