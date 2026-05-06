// src/runtime/engine/__tests__/engine.test.ts
import { describe, test, expect } from 'bun:test'
import { CostMonitor } from 'src/runtime/engine/CostMonitor'
import { ErrorHandler } from 'src/runtime/engine/ErrorHandler'

describe('CostMonitor', () => {
  test('初始状态 budgetExceeded = false', () => {
    const monitor = new CostMonitor()
    expect(monitor.isBudgetExceeded()).toBe(false)
  })

  test('addUsage 累加 tokens', () => {
    const monitor = new CostMonitor()
    monitor.addUsage({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 })
    monitor.addUsage({ inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 })
    expect(monitor.getState().inputTokensTotal).toBe(300)
    expect(monitor.getState().outputTokensTotal).toBe(150)
  })

  test('超预算时 budgetExceeded = true', () => {
    const monitor = new CostMonitor({ budgetInputTokens: 100 })
    monitor.addUsage({ inputTokens: 50, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
    expect(monitor.isBudgetExceeded()).toBe(false)
    monitor.addUsage({ inputTokens: 60, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
    expect(monitor.isBudgetExceeded()).toBe(true)
  })
})

describe('ErrorHandler', () => {
  test('可重试错误且未超次数 → retry', () => {
    const handler = new ErrorHandler({ maxAttempts: 3 })
    const err = new Error('NetworkError timeout')
    err.name = 'NetworkError'
    const strategy = handler.decide({ operation: 'query', attempt: 1, maxAttempts: 3, error: err })
    expect(strategy).toBe('retry')
  })

  test('超过最大尝试次数 → terminate', () => {
    const handler = new ErrorHandler({ maxAttempts: 3 })
    const err = new Error('NetworkError')
    err.name = 'NetworkError'
    const strategy = handler.decide({ operation: 'query', attempt: 3, maxAttempts: 3, error: err })
    expect(strategy).toBe('terminate')
  })

  test('不可重试错误 → terminate', () => {
    const handler = new ErrorHandler({ maxAttempts: 3 })
    const err = new Error('AuthError')
    err.name = 'AuthError'
    const strategy = handler.decide({ operation: 'query', attempt: 1, maxAttempts: 3, error: err })
    expect(strategy).toBe('terminate')
  })
})
