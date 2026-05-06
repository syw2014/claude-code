// packages/industry-adapter/industries/library/__tests__/rules.test.ts

import { describe, test, expect } from 'bun:test'
import rulesJson from '../rules/library-rules-base.json' with { type: 'json' }
import { RuleEngine, type RuleDSL } from '../../../src/rules/RuleEngine.js'
import type { RuleCheckInput } from '../../../src/types.js'

const engine = new RuleEngine(rulesJson as unknown as RuleDSL)

function baseInput(overrides: Partial<RuleCheckInput> = {}): RuleCheckInput {
  return {
    tenantId: 'tenant_001',
    industryCode: 'library',
    ruleVersion: '1.0.0',
    operation: 'checkout_book',
    userId: 'user_001',
    userRole: 'reader',
    bizRefs: {
      reader: {
        type: 'READER',
        id: 'R001',
        attrs: {},
        constraints: [],
        sourceSystem: 'lib',
        snapshotAt: new Date().toISOString(),
      },
    },
    factSet: { facts: {}, sources: [], builtAt: new Date().toISOString() },
    context: {},
    ...overrides,
  }
}

describe('Library Rules DSL', () => {
  test('LIB-001 blocks checkout for suspended reader', () => {
    const input = baseInput({
      operation: 'checkout_book',
      bizRefs: {
        reader: {
          type: 'READER',
          id: 'R001',
          status: 'suspended',
          attrs: {},
          constraints: [],
          sourceSystem: 'lib',
          snapshotAt: new Date().toISOString(),
        },
      },
    })
    const result = engine.check(input)
    expect(result.result).toBe('BLOCKED')
    expect(result.matchedRules.some(r => r.ruleId === 'LIB-001')).toBe(true)
  })

  test('LIB-001 does NOT block checkout for active reader', () => {
    const input = baseInput({
      operation: 'checkout_book',
      bizRefs: {
        reader: {
          type: 'READER',
          id: 'R001',
          status: 'active',
          attrs: {},
          constraints: [],
          sourceSystem: 'lib',
          snapshotAt: new Date().toISOString(),
        },
      },
    })
    const result = engine.check(input)
    expect(result.matchedRules.some(r => r.ruleId === 'LIB-001')).toBe(false)
  })

  test('LIB-002 warns when overdueCount exists during checkout', () => {
    const input = baseInput({
      operation: 'checkout_book',
      context: { overdueCount: 2 },
    })
    const result = engine.check(input)
    expect(result.result).toBe('WARN')
    expect(result.matchedRules.some(r => r.ruleId === 'LIB-002')).toBe(true)
    expect(result.requiredConfirmLevel).toBe('explicit_confirm')
    expect(result.requiredApproverRole).toBe('librarian')
  })

  test('LIB-003 flags waive_fee with supervisor_approval', () => {
    const input = baseInput({ operation: 'waive_fee' })
    const result = engine.check(input)
    expect(result.result).toBe('WARN')
    expect(result.matchedRules.some(r => r.ruleId === 'LIB-003')).toBe(true)
    expect(result.requiredConfirmLevel).toBe('supervisor_approval')
    expect(result.requiredApproverRole).toBe('supervisor')
  })

  test('LIB-005 blocks archive access for reader role', () => {
    const input = baseInput({
      operation: 'special_auth',
      userRole: 'reader',
      context: { authType: 'archive' },
    })
    const result = engine.check(input)
    expect(result.result).toBe('BLOCKED')
    expect(result.matchedRules.some(r => r.ruleId === 'LIB-005')).toBe(true)
  })
})
