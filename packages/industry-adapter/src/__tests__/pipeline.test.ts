import { describe, test, expect } from 'bun:test'
import { AdapterPipeline } from '../pipeline.js'
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

// ─── Mock Adapter for Testing ─────────────────────────────────────────────────

const createMockAdapter = (
  mapperMock?: SemanticMapper['map'],
  builderMock?: BizRefBuilder['build'],
  gatewayMock?: CapabilityGateway['route']
): IndustryAdapter => {
  const mapper: SemanticMapper = {
    async map(input: string, tenantId: string, sessionHistory?: NormalizedIntent[]) {
      if (mapperMock) {
        return mapperMock(input, tenantId, sessionHistory)
      }
      return {
        sceneCode: 'DEFAULT_SCENE',
        actionCode: 'DEFAULT_ACTION',
        confidence: 0.85,
        pathType: 'fast',
        requiredParams: [],
        rawInput: input,
      }
    },
  }

  const builder: BizRefBuilder = {
    async build(intent: NormalizedIntent, tenantId: string) {
      if (builderMock) {
        return builderMock(intent, tenantId)
      }
      return {
        bizRefs: {
          default_ref: {
            type: 'DEFAULT',
            id: 'default_001',
            attrs: {},
            constraints: [],
            sourceSystem: 'default-system',
            snapshotAt: new Date().toISOString(),
          },
        },
        factSet: {
          facts: {},
          sources: [],
          builtAt: new Date().toISOString(),
        },
      }
    },
  }

  const gateway: CapabilityGateway = {
    route(intent: NormalizedIntent, _bizRefs: Record<string, BizRef>) {
      if (gatewayMock) {
        return gatewayMock(intent, _bizRefs)
      }
      return [
        {
          channel: 'tool',
          capabilityName: 'default_tool',
          permissionLevel: 'low',
          confirmLevel: 'auto',
        },
      ]
    },
  }

  const rules: RuleSet = {
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
    industryCode: 'TEST_INDUSTRY',
    semanticMapper: mapper,
    bizRefBuilder: builder,
    capabilityGateway: gateway,
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
      return rules
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AdapterPipeline', () => {
  test('run calls all three stages in order', async () => {
    const callOrder: string[] = []

    const mapperMock = async (input: string, _tenantId: string): Promise<NormalizedIntent> => {
      callOrder.push('mapper')
      return {
        sceneCode: 'TEST_SCENE',
        actionCode: 'TEST_ACTION',
        confidence: 0.9,
        pathType: 'fast',
        requiredParams: ['param1'],
        rawInput: input,
      }
    }

    const builderMock = async (_intent: NormalizedIntent, _tenantId: string) => {
      callOrder.push('builder')
      return {
        bizRefs: { ref1: {
          type: 'TEST_REF',
          id: 'test_001',
          attrs: {},
          constraints: [],
          sourceSystem: 'test-system',
          snapshotAt: new Date().toISOString(),
        }},
        factSet: {
          facts: {},
          sources: [],
          builtAt: new Date().toISOString(),
        },
      }
    }

    const gatewayMock = (_intent: NormalizedIntent, _bizRefs: Record<string, BizRef>): CapabilityBinding[] => {
      callOrder.push('gateway')
      return [
        {
          channel: 'tool',
          capabilityName: 'test_capability',
          permissionLevel: 'medium',
          confirmLevel: 'explicit_confirm',
        },
      ]
    }

    const adapter = createMockAdapter(mapperMock, builderMock, gatewayMock)
    const pipeline = new AdapterPipeline(adapter)

    await pipeline.run('test input', 'tenant_001')

    expect(callOrder).toEqual(['mapper', 'builder', 'gateway'])
  })

  test('run returns all four output fields', async () => {
    const adapter = createMockAdapter()
    const pipeline = new AdapterPipeline(adapter)

    const output = await pipeline.run('test input', 'tenant_001')

    expect(output).toHaveProperty('intent')
    expect(output).toHaveProperty('bizRefs')
    expect(output).toHaveProperty('factSet')
    expect(output).toHaveProperty('bindings')

    expect(output.intent.sceneCode).toBe('DEFAULT_SCENE')
    expect(output.intent.actionCode).toBe('DEFAULT_ACTION')
    expect(typeof output.bizRefs).toBe('object')
    expect(typeof output.factSet).toBe('object')
    expect(Array.isArray(output.bindings)).toBe(true)
  })

  test('run passes sessionHistory to mapper', async () => {
    let receivedHistory: NormalizedIntent[] | undefined

    const mapperMock = async (
      _input: string,
      _tenantId: string,
      sessionHistory?: NormalizedIntent[]
    ): Promise<NormalizedIntent> => {
      receivedHistory = sessionHistory
      return {
        sceneCode: 'HISTORY_SCENE',
        actionCode: 'HISTORY_ACTION',
        confidence: 0.88,
        pathType: 'complex',
        requiredParams: [],
        rawInput: '',
      }
    }

    const adapter = createMockAdapter(mapperMock)
    const pipeline = new AdapterPipeline(adapter)

    const history: NormalizedIntent[] = [
      {
        sceneCode: 'PREV_SCENE',
        actionCode: 'PREV_ACTION',
        confidence: 0.9,
        pathType: 'fast',
        requiredParams: [],
        rawInput: 'previous input',
      },
    ]

    await pipeline.run('new input', 'tenant_001', history)

    expect(receivedHistory).toEqual(history)
  })

  test('run correctly constructs PipelineOutput structure', async () => {
    const mapperMock = async (): Promise<NormalizedIntent> => ({
      sceneCode: 'ORDER_SCENE',
      actionCode: 'CREATE_ORDER',
      confidence: 0.92,
      pathType: 'fast',
      requiredParams: ['orderId', 'customerId'],
      rawInput: 'place an order',
    })

    const builderMock = async (_intent: NormalizedIntent, _tenantId: string): Promise<{ bizRefs: Record<string, BizRef>; factSet: FactSet }> => ({
      bizRefs: {
        customer: {
          type: 'CUSTOMER',
          id: 'cust_123',
          displayName: 'John Doe',
          status: 'ACTIVE',
          attrs: { credit_limit: 10000 },
          constraints: ['MAX_ORDER_AMOUNT_5000'],
          sourceSystem: 'crm-system',
          snapshotAt: new Date().toISOString(),
        },
      },
      factSet: {
        facts: { credit_used: 2500, remaining_credit: 7500 },
        sources: [
          { key: 'credit_used', source: 'crm-system', confidence: 0.99 },
        ],
        builtAt: new Date().toISOString(),
      },
    })

    const gatewayMock = (_intent: NormalizedIntent, _bizRefs: Record<string, BizRef>): CapabilityBinding[] => [
      {
        channel: 'tool',
        capabilityName: 'CreateOrderTool',
        permissionLevel: 'high',
        confirmLevel: 'explicit_confirm',
      },
      {
        channel: 'skill',
        capabilityName: 'ValidateOrderSkill',
        permissionLevel: 'medium',
        confirmLevel: 'auto',
      },
    ]

    const adapter = createMockAdapter(mapperMock, builderMock, gatewayMock)
    const pipeline = new AdapterPipeline(adapter)

    const output = await pipeline.run('place an order', 'tenant_002')

    expect(output.intent.sceneCode).toBe('ORDER_SCENE')
    expect(output.intent.actionCode).toBe('CREATE_ORDER')
    expect(output.intent.confidence).toBe(0.92)

    expect(output.bizRefs.customer.id).toBe('cust_123')
    expect(output.bizRefs.customer.status).toBe('ACTIVE')

    expect(output.factSet.facts.credit_used).toBe(2500)
    expect(output.factSet.sources).toHaveLength(1)

    expect(output.bindings).toHaveLength(2)
    expect(output.bindings[0].capabilityName).toBe('CreateOrderTool')
    expect(output.bindings[1].capabilityName).toBe('ValidateOrderSkill')
  })
})
