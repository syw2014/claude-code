// src/rules/__tests__/RuleEngine.test.ts

import { describe, test, expect } from 'bun:test'
import { RuleEngine } from 'src/rules/RuleEngine.js'
import type { RuleDSL } from 'src/rules/RuleEngine.js'
import { RuleVersionResolver } from 'src/rules/RuleVersionResolver.js'
import type { RuleCheckInput, FactSet } from '@claude-code-best/industry-adapter'
import type { RuleStore } from 'src/runtime/stores.js'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<RuleCheckInput> = {}): RuleCheckInput {
  const factSet: FactSet = {
    facts: {},
    sources: [],
    builtAt: new Date().toISOString(),
  }
  return {
    tenantId: 'tenant-1',
    industryCode: 'library',
    ruleVersion: '1.0.0',
    operation: 'borrow',
    userId: 'user-1',
    userRole: 'member',
    bizRefs: {},
    factSet,
    context: {},
    ...overrides,
  }
}

function makeDSL(overrides: Partial<RuleDSL> = {}): RuleDSL {
  return {
    version: '1.0.0',
    industryCode: 'library',
    rules: [],
    ...overrides,
  }
}

// ─── Test 1: Empty rules → PASS ───────────────────────────────────────────────

describe('RuleEngine', () => {
  test('empty rules → PASS with no matched rules', () => {
    const engine = new RuleEngine(makeDSL())
    const result = engine.check(makeInput())

    expect(result.result).toBe('PASS')
    expect(result.matchedRules).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.requiredConfirmLevel).toBe('auto')
    expect(result.requiredApproverRole).toBeUndefined()
  })

  // ─── Test 2: severity='block' matching condition → BLOCKED ─────────────────

  test("rule with severity='block' and matching condition → BLOCKED", () => {
    const dsl = makeDSL({
      rules: [
        {
          ruleId: 'rule-block-1',
          description: 'Admin role blocked',
          severity: 'block',
          confirmLevel: 'supervisor_approval',
          approverRole: 'supervisor',
          conditions: [
            { field: 'userRole', op: '==', value: 'admin' },
          ],
        },
      ],
    })
    const engine = new RuleEngine(dsl)
    const result = engine.check(makeInput({ userRole: 'admin' }))

    expect(result.result).toBe('BLOCKED')
    expect(result.matchedRules).toHaveLength(1)
    expect(result.matchedRules[0]?.ruleId).toBe('rule-block-1')
    expect(result.requiredConfirmLevel).toBe('supervisor_approval')
    expect(result.requiredApproverRole).toBe('supervisor')
  })

  // ─── Test 3: severity='warn' → WARN with warning message ───────────────────

  test("rule with severity='warn' → WARN with warning message", () => {
    const dsl = makeDSL({
      rules: [
        {
          ruleId: 'rule-warn-1',
          description: 'Too many borrows',
          severity: 'warn',
          confirmLevel: 'explicit_confirm',
          conditions: [
            { field: 'userRole', op: '==', value: 'member' },
          ],
        },
      ],
    })
    const engine = new RuleEngine(dsl)
    const result = engine.check(makeInput({ userRole: 'member' }))

    expect(result.result).toBe('WARN')
    expect(result.warnings).toContain('Too many borrows')
    expect(result.requiredConfirmLevel).toBe('explicit_confirm')
  })

  // ─── Test 4: Multiple rules — block takes precedence over warn ──────────────

  test('block takes precedence over warn when both match', () => {
    const dsl = makeDSL({
      rules: [
        {
          ruleId: 'rule-warn-2',
          description: 'Warn reason',
          severity: 'warn',
          confirmLevel: 'explicit_confirm',
          conditions: [{ field: 'userRole', op: '==', value: 'member' }],
        },
        {
          ruleId: 'rule-block-2',
          description: 'Block reason',
          severity: 'block',
          confirmLevel: 'supervisor_approval',
          approverRole: 'admin',
          conditions: [{ field: 'operation', op: '==', value: 'borrow' }],
        },
      ],
    })
    const engine = new RuleEngine(dsl)
    const result = engine.check(makeInput({ userRole: 'member', operation: 'borrow' }))

    expect(result.result).toBe('BLOCKED')
    expect(result.matchedRules).toHaveLength(2)
    expect(result.warnings).toContain('Warn reason')
    expect(result.requiredApproverRole).toBe('admin')
  })

  // ─── Test 5: '==' operator matches string field ─────────────────────────────

  test("'==' operator matches string field correctly", () => {
    const dsl = makeDSL({
      rules: [
        {
          ruleId: 'rule-eq-1',
          description: 'Exact match',
          severity: 'info',
          confirmLevel: 'auto',
          conditions: [{ field: 'industryCode', op: '==', value: 'library' }],
        },
      ],
    })
    const engine = new RuleEngine(dsl)

    const matchResult = engine.check(makeInput({ industryCode: 'library' }))
    expect(matchResult.matchedRules).toHaveLength(1)

    const noMatchResult = engine.check(makeInput({ industryCode: 'hospital' }))
    expect(noMatchResult.matchedRules).toHaveLength(0)
  })

  // ─── Test 6: 'in' operator matches value in array ───────────────────────────

  test("'in' operator matches field value against an array", () => {
    const dsl = makeDSL({
      rules: [
        {
          ruleId: 'rule-in-1',
          description: 'Role in allowed list',
          severity: 'info',
          confirmLevel: 'auto',
          conditions: [
            { field: 'userRole', op: 'in', value: ['member', 'librarian'] },
          ],
        },
      ],
    })
    const engine = new RuleEngine(dsl)

    const matchResult = engine.check(makeInput({ userRole: 'librarian' }))
    expect(matchResult.matchedRules).toHaveLength(1)

    const noMatchResult = engine.check(makeInput({ userRole: 'admin' }))
    expect(noMatchResult.matchedRules).toHaveLength(0)
  })

  // ─── Test 7: 'exists' / 'not_exists' operators ──────────────────────────────

  test("'exists' and 'not_exists' operators work correctly", () => {
    const dslExists = makeDSL({
      rules: [
        {
          ruleId: 'rule-exists-1',
          description: 'book ref exists',
          severity: 'info',
          confirmLevel: 'auto',
          conditions: [{ field: 'bizRefs.book', op: 'exists' }],
        },
      ],
    })
    const engineExists = new RuleEngine(dslExists)

    const withBook = makeInput({
      bizRefs: {
        book: {
          type: 'book',
          id: 'b1',
          status: 'available',
          attrs: {},
          constraints: [],
          sourceSystem: 'ils',
          snapshotAt: new Date().toISOString(),
        },
      },
    })
    const withoutBook = makeInput({ bizRefs: {} })

    expect(engineExists.check(withBook).matchedRules).toHaveLength(1)
    expect(engineExists.check(withoutBook).matchedRules).toHaveLength(0)

    const dslNotExists = makeDSL({
      rules: [
        {
          ruleId: 'rule-not-exists-1',
          description: 'no book ref',
          severity: 'info',
          confirmLevel: 'auto',
          conditions: [{ field: 'bizRefs.book', op: 'not_exists' }],
        },
      ],
    })
    const engineNotExists = new RuleEngine(dslNotExists)

    expect(engineNotExists.check(withoutBook).matchedRules).toHaveLength(1)
    expect(engineNotExists.check(withBook).matchedRules).toHaveLength(0)
  })

  // ─── Test 8: RuleVersionResolver.resolve() delegates correctly ──────────────

  test('RuleVersionResolver.resolve() delegates to store and returns RuleSet', async () => {
    const stubDSL: RuleDSL = {
      version: '2.0.0',
      industryCode: 'library',
      rules: [],
    }

    const stubStore: RuleStore = {
      getActiveVersion: async (_tenantId: string, _industryCode: string) => '2.0.0',
      getRulesByVersion: async (
        _tenantId: string,
        _industryCode: string,
        _version: string
      ) => stubDSL as unknown,
    }

    const resolver = new RuleVersionResolver(stubStore)
    const ruleSet = await resolver.resolve('tenant-1', 'library')

    expect(ruleSet.version).toBe('2.0.0')
    const result = ruleSet.check(makeInput())
    expect(result.result).toBe('PASS')

    const version = await resolver.resolveVersion('tenant-1', 'library')
    expect(version).toBe('2.0.0')
  })
})
