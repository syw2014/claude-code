// src/adapters/claude-code/__tests__/adapters.test.ts
import { describe, test, expect } from 'bun:test'
import { ClaudeQueryAdapter } from 'src/adapters/claude-code/ClaudeQueryAdapter'
import { ClaudeToolAdapter } from 'src/adapters/claude-code/ClaudeToolAdapter'

describe('ClaudeQueryAdapter', () => {
  test('query 返回含 output 的结果', async () => {
    const adapter = new ClaudeQueryAdapter()
    const result = await adapter.query({ input: '扫码借书', systemPrompt: 'You are a library agent.' })
    expect(result.output).toContain('扫码借书')
    expect(result.tokensUsed.inputTokens).toBeGreaterThan(0)
    expect(result.stopReason).toBe('end_turn')
  })

  test('getModel 返回模型名', () => {
    const adapter = new ClaudeQueryAdapter('claude-haiku-4-5-20251001')
    expect(adapter.getModel()).toBe('claude-haiku-4-5-20251001')
  })
})

describe('ClaudeToolAdapter', () => {
  test('execute 返回 succeeded 状态', async () => {
    const adapter = new ClaudeToolAdapter()
    const result = await adapter.execute({
      toolName: 'checkout_book', channel: 'biz_tool', permissionLevel: 'medium',
      input: { readerId: 'r001', copyId: 'c001' },
      taskId: 'task_001', traceId: 'trace_001',
    })
    expect(result.status).toBe('succeeded')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  test('buildRecord 返回合法 ToolCallRecord', async () => {
    const adapter = new ClaudeToolAdapter()
    const params = {
      toolName: 'checkout_book', channel: 'biz_tool' as const, permissionLevel: 'medium' as const,
      input: { readerId: 'r001' }, taskId: 'task_001', traceId: 'trace_001',
    }
    const result = await adapter.execute(params)
    const record = adapter.buildRecord(params, result)
    expect(record.name).toBe('checkout_book')
    expect(record.status).toBe('succeeded')
    expect(record.id).toBeTruthy()
  })
})
