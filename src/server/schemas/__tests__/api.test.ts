// src/server/schemas/__tests__/api.test.ts
import { describe, test, expect } from 'bun:test'
import type { CreateSessionRequest, SendMessageRequest, ConfirmDecisionRequest } from 'src/server/schemas/api'
import { RuntimeErrorCode } from 'src/server/schemas/errors'

describe('API schema types', () => {
  test('CreateSessionRequest 必填字段', () => {
    const req: CreateSessionRequest = {
      tenantId: 'tenant_001',
      userId: 'user_001',
      industryCode: 'library',
    }
    expect(req.industryCode).toBe('library')
    expect(req.permissionMode).toBeUndefined()
  })

  test('SendMessageRequest mode 默认 auto', () => {
    const req: SendMessageRequest = { input: '扫码借书' }
    expect(req.mode).toBeUndefined()
  })

  test('ConfirmDecisionRequest decision 只允许 approve/reject', () => {
    const req: ConfirmDecisionRequest = {
      confirmId: 'confirm_001',
      decision: 'approve',
      confirmedBy: 'librarian_001',
      confirmedRole: 'librarian',
    }
    expect(req.decision).toBe('approve')
  })

  test('RuntimeErrorCode 包含 SESSION_NOT_FOUND', () => {
    expect(RuntimeErrorCode.SESSION_NOT_FOUND).toBe('SESSION_NOT_FOUND')
    expect(Object.keys(RuntimeErrorCode)).toHaveLength(13)
  })
})
