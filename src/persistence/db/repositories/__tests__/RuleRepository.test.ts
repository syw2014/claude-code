import { describe, test, expect, beforeEach } from 'bun:test'
import { InMemoryRuleRepository } from '../RuleRepository.js'
import type { RuleDSL } from 'src/rules/RuleEngine.js'

describe('InMemoryRuleRepository', () => {
  let repo: InMemoryRuleRepository
  const tenantId = 'tenant_001'
  const industryCode = 'retail'

  beforeEach(() => {
    repo = new InMemoryRuleRepository()
  })

  test('publish + getActiveVersion returns correct version string', async () => {
    const dsl: RuleDSL = {
      version: '1.0.0',
      industryCode: 'retail',
      rules: [
        {
          ruleId: 'rule_001',
          description: 'Test rule',
          severity: 'info',
          confirmLevel: 'auto',
          conditions: [],
        },
      ],
    }

    const stored = await repo.publish(tenantId, dsl)
    expect(stored.version).toBe('1.0.0')
    expect(stored.isActive).toBe(true)
    expect(stored.publishedAt).toBeTruthy()

    const activeVersion = await repo.getActiveVersion(tenantId, industryCode)
    expect(activeVersion).toBe('1.0.0')
  })

  test('publishing a new version deactivates the old one', async () => {
    const dsl1: RuleDSL = {
      version: '1.0.0',
      industryCode: 'retail',
      rules: [
        {
          ruleId: 'rule_001',
          description: 'Test rule 1',
          severity: 'info',
          confirmLevel: 'auto',
          conditions: [],
        },
      ],
    }

    const dsl2: RuleDSL = {
      version: '2.0.0',
      industryCode: 'retail',
      rules: [
        {
          ruleId: 'rule_002',
          description: 'Test rule 2',
          severity: 'warn',
          confirmLevel: 'explicit_confirm',
          conditions: [],
        },
      ],
    }

    const v1 = await repo.publish(tenantId, dsl1)
    expect(v1.isActive).toBe(true)

    const v2 = await repo.publish(tenantId, dsl2)
    expect(v2.isActive).toBe(true)

    // v1 should now be inactive
    const retrievedV1 = await repo.getVersion(tenantId, industryCode, '1.0.0')
    expect(retrievedV1?.isActive).toBe(false)

    // getActiveVersion should return v2
    const activeVersion = await repo.getActiveVersion(tenantId, industryCode)
    expect(activeVersion).toBe('2.0.0')
  })

  test('listVersions returns all versions sorted by publishedAt desc', async () => {
    const dsl1: RuleDSL = {
      version: '1.0.0',
      industryCode: 'retail',
      rules: [],
    }

    const dsl2: RuleDSL = {
      version: '2.0.0',
      industryCode: 'retail',
      rules: [],
    }

    const dsl3: RuleDSL = {
      version: '3.0.0',
      industryCode: 'retail',
      rules: [],
    }

    await repo.publish(tenantId, dsl1)
    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10))
    await repo.publish(tenantId, dsl2)
    await new Promise(resolve => setTimeout(resolve, 10))
    await repo.publish(tenantId, dsl3)

    const versions = await repo.listVersions(tenantId, industryCode)
    expect(versions).toHaveLength(3)
    // Should be sorted by publishedAt desc (newest first)
    expect(versions[0].version).toBe('3.0.0')
    expect(versions[1].version).toBe('2.0.0')
    expect(versions[2].version).toBe('1.0.0')
  })

  test('getRulesByVersion returns the DSL object', async () => {
    const dsl: RuleDSL = {
      version: '1.5.0',
      industryCode: 'retail',
      rules: [
        {
          ruleId: 'rule_001',
          description: 'High-value transaction',
          severity: 'warn',
          confirmLevel: 'explicit_confirm',
          conditions: [
            {
              field: 'amount',
              op: '==',
              value: 1000,
            },
          ],
        },
      ],
    }

    await repo.publish(tenantId, dsl)
    const retrieved = await repo.getRulesByVersion(tenantId, industryCode, '1.5.0')
    expect(retrieved).toEqual(dsl)
  })

  test('getVersion returns null for unknown version', async () => {
    const dsl: RuleDSL = {
      version: '1.0.0',
      industryCode: 'retail',
      rules: [],
    }

    await repo.publish(tenantId, dsl)

    const notFound = await repo.getVersion(tenantId, industryCode, '99.0.0')
    expect(notFound).toBeNull()
  })

  test('getActiveVersion returns 0.0.0 fallback when no version is active', async () => {
    const fallback = await repo.getActiveVersion(tenantId, industryCode)
    expect(fallback).toBe('0.0.0')
  })

  test('different tenants have separate rule versions', async () => {
    const tenant1 = 'tenant_001'
    const tenant2 = 'tenant_002'

    const dsl1: RuleDSL = {
      version: '1.0.0',
      industryCode: 'retail',
      rules: [],
    }

    const dsl2: RuleDSL = {
      version: '2.0.0',
      industryCode: 'retail',
      rules: [],
    }

    await repo.publish(tenant1, dsl1)
    await repo.publish(tenant2, dsl2)

    const v1Active = await repo.getActiveVersion(tenant1, industryCode)
    const v2Active = await repo.getActiveVersion(tenant2, industryCode)

    expect(v1Active).toBe('1.0.0')
    expect(v2Active).toBe('2.0.0')
  })

  test('different industries have separate rule versions', async () => {
    const retail: RuleDSL = {
      version: '1.0.0',
      industryCode: 'retail',
      rules: [],
    }

    const hospitality: RuleDSL = {
      version: '2.0.0',
      industryCode: 'hospitality',
      rules: [],
    }

    await repo.publish(tenantId, retail)
    await repo.publish(tenantId, hospitality)

    const retailActive = await repo.getActiveVersion(tenantId, 'retail')
    const hospitalityActive = await repo.getActiveVersion(tenantId, 'hospitality')

    expect(retailActive).toBe('1.0.0')
    expect(hospitalityActive).toBe('2.0.0')
  })
})
