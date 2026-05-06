import { describe, test, expect } from 'bun:test'
import type { SessionContext } from 'src/runtime/context/SessionContext'
import { createEnvelope } from 'src/runtime/context/ContextEnvelope'
import type { IndustryAdapter, RuleSet } from '@claude-code-best/industry-adapter'
import type { SessionStore, MemoryStore, RuleStore, PromptStore, KnowledgeStore, AuditWriter } from 'src/runtime/stores'

// Minimal stub factories — only used to satisfy the interface at type-check time
function stubAdapter(): IndustryAdapter {
  return {
    industryCode: 'library',
    semanticMapper: { map: async () => ({ sceneCode: '', actionCode: '', confidence: 0, pathType: 'fast', requiredParams: [], rawInput: '' }) },
    bizRefBuilder: { build: async () => ({ bizRefs: {}, factSet: { facts: {}, sources: [], builtAt: '' } }) },
    capabilityGateway: { route: () => [] },
    getBizTools: () => [],
    getBizSkills: () => [],
    getBizWorkflows: () => [],
    getRules: () => stubRuleSet(),
  }
}

function stubRuleSet(): RuleSet {
  return {
    version: 'test-v1',
    check: () => ({ result: 'PASS', ruleVersion: 'test-v1', matchedRules: [], warnings: [], requiredConfirmLevel: 'auto' }),
  }
}

function stubStore<T>(): T {
  return {} as T
}

function stubAuditWriter(): AuditWriter {
  return { record: async () => {}, flush: async () => {} }
}

describe('SessionContext shape', () => {
  test('可以构造满足接口的对象', () => {
    const envelope = createEnvelope({
      sessionId: 'sess_001',
      traceId: 'trace_001',
      tenantId: 'tenant_001',
      userId: 'user_001',
      industryCode: 'library',
      turnId: 'turn_001',
    })

    const ctx: SessionContext = {
      sessionId: 'sess_001',
      traceId: 'trace_001',
      cwd: '/tmp',
      projectRoot: '/tmp',
      tokenCounts: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      permissionMode: 'default',
      industryCode: 'library',
      userId: 'user_001',
      tenantId: 'tenant_001',
      industryAdapter: stubAdapter(),
      ruleSet: stubRuleSet(),
      auditWriter: stubAuditWriter(),
      sessionStore: stubStore(),
      memoryStore: stubStore(),
      ruleStore: stubStore(),
      promptStore: stubStore(),
      knowledgeStore: stubStore(),
      envelope,
    }

    expect(ctx.sessionId).toBe('sess_001')
    expect(ctx.industryCode).toBe('library')
    expect(ctx.pendingConfirm).toBeUndefined()
    expect(ctx.sseWriter).toBeUndefined()
  })
})
