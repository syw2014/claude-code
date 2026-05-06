// src/runtime/permission/__tests__/permission.test.ts
import { describe, test, expect } from 'bun:test'
import { checkPermission } from 'src/runtime/permission/PermissionGate'
import { HumanConfirmManager } from 'src/runtime/permission/HumanConfirmManager'
import { createEnvelope } from 'src/runtime/context/ContextEnvelope'
import type { SessionContext } from 'src/runtime/context/SessionContext'
import type { RuleCheckResult, IndustryAdapter, RuleSet } from '@claude-code-best/industry-adapter'
import type { AuditWriter, SessionStore, MemoryStore, RuleStore, PromptStore, KnowledgeStore } from 'src/runtime/stores'

function stubRuleSet(): RuleSet {
  return { version: 'v1', check: () => ({ result: 'PASS', ruleVersion: 'v1', matchedRules: [], warnings: [], requiredConfirmLevel: 'auto' }) }
}

function stubCtx(): SessionContext {
  const envelope = createEnvelope({ sessionId: 's', traceId: 'tr', tenantId: 't', userId: 'u', industryCode: 'lib', turnId: 'tu' })
  return {
    sessionId: 's', traceId: 'tr', cwd: '/', projectRoot: '/',
    tokenCounts: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    permissionMode: 'default', industryCode: 'lib', userId: 'u', tenantId: 't',
    industryAdapter: {} as IndustryAdapter,
    ruleSet: stubRuleSet(),
    auditWriter: { record: async () => {}, flush: async () => {} } as AuditWriter,
    sessionStore: {} as SessionStore,
    memoryStore: {} as MemoryStore,
    ruleStore: {} as RuleStore,
    promptStore: {} as PromptStore,
    knowledgeStore: {} as KnowledgeStore,
    envelope,
  }
}

describe('checkPermission', () => {
  test('PASS + auto → allow', () => {
    const result: RuleCheckResult = { result: 'PASS', ruleVersion: 'v1', matchedRules: [], warnings: [], requiredConfirmLevel: 'auto' }
    const decision = checkPermission({ ctx: stubCtx(), operation: 'checkout_book', permissionLevel: 'medium', ruleResult: result })
    expect(decision.verdict).toBe('allow')
  })

  test('BLOCKED → block', () => {
    const result: RuleCheckResult = {
      result: 'BLOCKED', ruleVersion: 'v1',
      matchedRules: [{ ruleId: 'LIB-001', severity: 'block', reason: '超额' }],
      warnings: [], requiredConfirmLevel: 'explicit_confirm',
    }
    const decision = checkPermission({ ctx: stubCtx(), operation: 'checkout_book', permissionLevel: 'high', ruleResult: result })
    expect(decision.verdict).toBe('block')
  })

  test('WARN + explicit_confirm → require_human', () => {
    const result: RuleCheckResult = {
      result: 'WARN', ruleVersion: 'v1', matchedRules: [],
      warnings: ['读者有 2 本逾期未还'], requiredConfirmLevel: 'explicit_confirm',
    }
    const decision = checkPermission({ ctx: stubCtx(), operation: 'checkout_book', permissionLevel: 'medium', ruleResult: result })
    expect(decision.verdict).toBe('require_human')
    if (decision.verdict === 'require_human') {
      expect(decision.confirmRequest.operation).toBe('checkout_book')
      expect(decision.confirmRequest.ruleWarnings).toHaveLength(1)
    }
  })

  test('silent_confirm → silent_confirm', () => {
    const result: RuleCheckResult = { result: 'WARN', ruleVersion: 'v1', matchedRules: [], warnings: [], requiredConfirmLevel: 'silent_confirm' }
    const decision = checkPermission({ ctx: stubCtx(), operation: 'op', permissionLevel: 'low', ruleResult: result })
    expect(decision.verdict).toBe('silent_confirm')
  })
})

describe('HumanConfirmManager', () => {
  test('create + get', () => {
    const mgr = new HumanConfirmManager()
    const req = {
      id: crypto.randomUUID(), sessionId: 's', taskId: 't', traceId: 'tr',
      operation: 'checkout_book', confirmLevel: 'explicit_confirm' as const,
      requiredApproverRole: 'librarian' as const, bizRefs: {}, factSet: { facts: {}, sources: [], builtAt: '' },
      ruleWarnings: ['逾期'], expiresAt: new Date(Date.now() + 60000).toISOString(),
    }
    const record = mgr.create(req)
    expect(record.status).toBe('pending')
    expect(mgr.get(req.id)?.status).toBe('pending')
  })

  test('resolve approve', () => {
    const mgr = new HumanConfirmManager()
    const req = {
      id: crypto.randomUUID(), sessionId: 's', taskId: 't', traceId: 'tr',
      operation: 'op', confirmLevel: 'explicit_confirm' as const,
      requiredApproverRole: 'user' as const, bizRefs: {}, factSet: { facts: {}, sources: [], builtAt: '' },
      ruleWarnings: [], expiresAt: new Date(Date.now() + 60000).toISOString(),
    }
    mgr.create(req)
    const resolved = mgr.resolve(req.id, 'approve', 'lib_001', 'librarian')
    expect(resolved?.status).toBe('approved')
    expect(resolved?.decision).toBe('approve')
  })
})
