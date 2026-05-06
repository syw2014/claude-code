import { describe, test, expect } from 'bun:test'
import { IndustryRegistry } from '../registry.js'
import type {
  IndustryAdapter,
  SemanticMapper,
  BizRefBuilder,
  CapabilityGateway,
  NormalizedIntent,
  BizRef,
  FactSet,
  CapabilityBinding,
  RuleSet,
  RuleCheckInput,
  RuleCheckResult,
} from '../types.js'

// ─── Stub Adapter for Testing ─────────────────────────────────────────────────

const createStubAdapter = (industryCode: string): IndustryAdapter => {
  const stubMapper: SemanticMapper = {
    async map(_input: string, _tenantId: string) {
      return {
        sceneCode: 'STUB_SCENE',
        actionCode: 'STUB_ACTION',
        confidence: 0.95,
        pathType: 'fast',
        requiredParams: [],
        rawInput: '',
      }
    },
  }

  const stubBuilder: BizRefBuilder = {
    async build(_intent: NormalizedIntent, _tenantId: string) {
      const bizRefs: Record<string, BizRef> = {
        stub_ref: {
          type: 'STUB',
          id: 'stub_001',
          attrs: {},
          constraints: [],
          sourceSystem: 'stub-system',
          snapshotAt: new Date().toISOString(),
        },
      }
      const factSet: FactSet = {
        facts: {},
        sources: [],
        builtAt: new Date().toISOString(),
      }
      return { bizRefs, factSet }
    },
  }

  const stubGateway: CapabilityGateway = {
    route(_intent: NormalizedIntent, _bizRefs: Record<string, BizRef>) {
      const bindings: CapabilityBinding[] = [
        {
          channel: 'tool',
          capabilityName: 'stub_tool',
          permissionLevel: 'low',
          confirmLevel: 'auto',
        },
      ]
      return bindings
    },
  }

  const stubRules: RuleSet = {
    version: '1.0.0',
    check(_input: RuleCheckInput): RuleCheckResult {
      return {
        result: 'PASS',
        ruleVersion: '1.0.0',
        matchedRules: [],
        warnings: [],
        requiredConfirmLevel: 'auto',
      }
    },
  }

  return {
    industryCode,
    semanticMapper: stubMapper,
    bizRefBuilder: stubBuilder,
    capabilityGateway: stubGateway,
    getBizTools() {
      return []
    },
    getBizSkills() {
      return []
    },
    getBizWorkflows() {
      return []
    },
    getRules() {
      return stubRules
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IndustryRegistry', () => {
  test('register + load round-trips correctly', () => {
    const registry = new IndustryRegistry()
    const adapter = createStubAdapter('LIBRARY')

    registry.register(adapter)
    const loaded = registry.load('LIBRARY')

    expect(loaded.industryCode).toBe('LIBRARY')
    expect(loaded.semanticMapper).toBe(adapter.semanticMapper)
  })

  test('load throws for unregistered code', () => {
    const registry = new IndustryRegistry()

    expect(() => {
      registry.load('NONEXISTENT')
    }).toThrow('Industry adapter not registered: NONEXISTENT')
  })

  test('has returns true/false correctly', () => {
    const registry = new IndustryRegistry()
    const adapter = createStubAdapter('HEALTHCARE')

    expect(registry.has('HEALTHCARE')).toBe(false)

    registry.register(adapter)
    expect(registry.has('HEALTHCARE')).toBe(true)
    expect(registry.has('NONEXISTENT')).toBe(false)
  })

  test('listCodes returns all registered codes', () => {
    const registry = new IndustryRegistry()

    const adapter1 = createStubAdapter('FINANCE')
    const adapter2 = createStubAdapter('RETAIL')
    const adapter3 = createStubAdapter('LOGISTICS')

    registry.register(adapter1)
    registry.register(adapter2)
    registry.register(adapter3)

    const codes = registry.listCodes()
    expect(codes).toHaveLength(3)
    expect(codes).toContain('FINANCE')
    expect(codes).toContain('RETAIL')
    expect(codes).toContain('LOGISTICS')
  })

  test('register overwrites existing adapter with same code', () => {
    const registry = new IndustryRegistry()
    const adapter1 = createStubAdapter('LIBRARY')
    const adapter2 = createStubAdapter('LIBRARY')

    registry.register(adapter1)
    registry.register(adapter2)

    const codes = registry.listCodes()
    expect(codes).toHaveLength(1)

    const loaded = registry.load('LIBRARY')
    expect(loaded).toBe(adapter2)
  })
})
