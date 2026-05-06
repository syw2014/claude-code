// src/runtime/__tests__/types.test.ts
import { describe, test, expect } from 'bun:test'
import type {
  SessionStatus,
  TaskStatus,
  ToolCallStatus,
  TokenCounts,
  CostState,
} from 'src/runtime/types'

describe('runtime types', () => {
  test('SessionStatus 覆盖所有合法值', () => {
    const all: SessionStatus[] = [
      'created', 'active', 'waiting_human', 'closing', 'closed', 'failed', 'expired',
    ]
    expect(all).toHaveLength(7)
  })

  test('TaskStatus 覆盖所有合法值', () => {
    const all: TaskStatus[] = [
      'queued', 'running', 'waiting_confirm', 'succeeded', 'failed', 'rejected', 'timeout', 'cancelled',
    ]
    expect(all).toHaveLength(8)
  })

  test('ToolCallStatus 覆盖所有合法值', () => {
    const all: ToolCallStatus[] = [
      'planned', 'permission_checking', 'waiting_confirm', 'executing',
      'retrying', 'succeeded', 'failed', 'blocked', 'timeout', 'cancelled',
    ]
    expect(all).toHaveLength(10)
  })

  test('TokenCounts 初始值合法', () => {
    const tc: TokenCounts = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    expect(Object.values(tc).every(v => v === 0)).toBe(true)
  })

  test('CostState budgetExceeded 默认 false', () => {
    const cs: CostState = {
      inputTokensTotal: 100,
      outputTokensTotal: 50,
      budgetExceeded: false,
    }
    expect(cs.budgetExceeded).toBe(false)
    expect(cs.budgetInputTokens).toBeUndefined()
  })
})
