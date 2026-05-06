import { describe, test, expect } from 'bun:test'
import { BaseSemanticMapper } from '../base/BaseSemanticMapper.js'
import { BaseBizRefBuilder } from '../base/BaseBizRefBuilder.js'
import { BaseCapabilityGateway } from '../base/BaseCapabilityGateway.js'
import type {
  IntentTemplate,
  NormalizedIntent,
  ConfidenceScore,
} from '../types.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

class TestSemanticMapper extends BaseSemanticMapper {
  protected templates: IntentTemplate[] = []

  constructor(templates: IntentTemplate[] = []) {
    super()
    this.templates = templates
  }

  // Expose protected methods for testing
  public testScoreTemplate(
    input: string,
    template: IntentTemplate
  ): ConfidenceScore {
    return this.scoreTemplate(input, template)
  }

  public testComputeOverallConfidence(score: ConfidenceScore): number {
    return this.computeOverallConfidence(score)
  }
}

class TestBizRefBuilder extends BaseBizRefBuilder {
  // No additional implementation needed for base tests
}

class TestCapabilityGateway extends BaseCapabilityGateway {
  // No additional implementation needed for base tests
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BaseSemanticMapper', () => {
  test('map() returns fallback intent when no templates defined', async () => {
    const mapper = new TestSemanticMapper([])
    const result = await mapper.map('some input', 'tenant-1')

    expect(result.sceneCode).toBe('unknown')
    expect(result.actionCode).toBe('unknown')
    expect(result.confidence).toBe(0)
    expect(result.pathType).toBe('complex')
    expect(result.requiredParams).toEqual([])
    expect(result.rawInput).toBe('some input')
  })

  test('scoreTemplate() gives non-zero keywordMatch when input matches an example', () => {
    const mapper = new TestSemanticMapper()
    const template: IntentTemplate = {
      sceneCode: 'scene-1',
      pathType: 'fast',
      examples: ['create order', 'new order'],
      requiredParams: ['itemId'],
    }

    const score = mapper.testScoreTemplate('create order for user', template)

    expect(score.keywordMatch).toBeGreaterThan(0)
    expect(score.embeddingSimilarity).toBe(0)
    expect(score.structureMatch).toBe(0)
    expect(score.contextConsistency).toBe(0)
  })

  test('scoreTemplate() case-insensitive matching', () => {
    const mapper = new TestSemanticMapper()
    const template: IntentTemplate = {
      sceneCode: 'scene-1',
      pathType: 'fast',
      examples: ['Create Order'],
      requiredParams: [],
    }

    const score = mapper.testScoreTemplate(
      'please CREATE ORDER now',
      template
    )

    expect(score.keywordMatch).toBeGreaterThan(0)
  })

  test('scoreTemplate() returns 0 when no examples match', () => {
    const mapper = new TestSemanticMapper()
    const template: IntentTemplate = {
      sceneCode: 'scene-1',
      pathType: 'fast',
      examples: ['create order', 'new order'],
      requiredParams: [],
    }

    const score = mapper.testScoreTemplate('unrelated text', template)

    expect(score.keywordMatch).toBe(0)
  })

  test('computeOverallConfidence() correctly weights keywordMatch', () => {
    const mapper = new TestSemanticMapper()

    const score: ConfidenceScore = {
      keywordMatch: 1,
      embeddingSimilarity: 0,
      structureMatch: 0,
      contextConsistency: 0,
    }

    const confidence = mapper.testComputeOverallConfidence(score)

    // 1 * 0.6 + 0 * 0.3 + 0 * 0.1 + 0 * 0 = 0.6
    expect(confidence).toBe(0.6)
  })

  test('computeOverallConfidence() combines all weights correctly', () => {
    const mapper = new TestSemanticMapper()

    const score: ConfidenceScore = {
      keywordMatch: 0.5,
      embeddingSimilarity: 0.8,
      structureMatch: 1,
      contextConsistency: 0.5,
    }

    const confidence = mapper.testComputeOverallConfidence(score)

    // 0.5 * 0.6 + 0.8 * 0.3 + 1 * 0.1 + 0.5 * 0 = 0.3 + 0.24 + 0.1 = 0.64
    expect(confidence).toBe(0.64)
  })

  test('computeOverallConfidence() clamps result to [0, 1]', () => {
    const mapper = new TestSemanticMapper()

    const scoreOverMax: ConfidenceScore = {
      keywordMatch: 2,
      embeddingSimilarity: 2,
      structureMatch: 2,
      contextConsistency: 2,
    }

    const resultOverMax = mapper.testComputeOverallConfidence(scoreOverMax)
    expect(resultOverMax).toBeLessThanOrEqual(1)

    const scoreNegative: ConfidenceScore = {
      keywordMatch: -1,
      embeddingSimilarity: -1,
      structureMatch: -1,
      contextConsistency: -1,
    }

    const resultNegative = mapper.testComputeOverallConfidence(scoreNegative)
    expect(resultNegative).toBeGreaterThanOrEqual(0)
  })

  test('map() returns intent with highest-scoring template', async () => {
    const templates: IntentTemplate[] = [
      {
        sceneCode: 'scene-1',
        pathType: 'fast',
        examples: ['create order'],
        requiredParams: ['itemId'],
      },
      {
        sceneCode: 'scene-2',
        pathType: 'complex',
        examples: ['check status', 'order status'],
        requiredParams: ['orderId'],
      },
    ]

    const mapper = new TestSemanticMapper(templates)
    const result = await mapper.map('order status please', 'tenant-1')

    expect(result.sceneCode).toBe('scene-2')
    expect(result.pathType).toBe('complex')
    expect(result.requiredParams).toEqual(['orderId'])
  })
})

describe('BaseBizRefBuilder', () => {
  test('build() returns empty bizRefs and valid factSet', async () => {
    const builder = new TestBizRefBuilder()
    const intent: NormalizedIntent = {
      sceneCode: 'scene-1',
      actionCode: 'action-1',
      confidence: 0.8,
      pathType: 'fast',
      requiredParams: ['itemId'],
      rawInput: 'test input',
    }

    const result = await builder.build(intent, 'tenant-1')

    expect(result.bizRefs).toEqual({})
    expect(result.factSet.facts).toEqual({})
    expect(result.factSet.sources).toEqual([])
    expect(typeof result.factSet.builtAt).toBe('string')
  })

  test('build() generates valid ISO timestamp', async () => {
    const builder = new TestBizRefBuilder()
    const intent: NormalizedIntent = {
      sceneCode: 'scene-1',
      actionCode: 'action-1',
      confidence: 0.8,
      pathType: 'fast',
      requiredParams: [],
      rawInput: 'test',
    }

    const result = await builder.build(intent, 'tenant-1')

    // Check that builtAt is a valid ISO string
    const date = new Date(result.factSet.builtAt)
    expect(Number.isNaN(date.getTime())).toBe(false)
  })
})

describe('BaseCapabilityGateway', () => {
  test('route() returns empty array', () => {
    const gateway = new TestCapabilityGateway()
    const intent: NormalizedIntent = {
      sceneCode: 'scene-1',
      actionCode: 'action-1',
      confidence: 0.8,
      pathType: 'fast',
      requiredParams: [],
      rawInput: 'test input',
    }

    const result = gateway.route(intent, {})

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
  })

  test('route() handles non-empty bizRefs without error', () => {
    const gateway = new TestCapabilityGateway()
    const intent: NormalizedIntent = {
      sceneCode: 'scene-1',
      actionCode: 'action-1',
      confidence: 0.8,
      pathType: 'fast',
      requiredParams: [],
      rawInput: 'test input',
    }

    const bizRefs = {
      'ref-1': {
        type: 'order',
        id: 'order-123',
        displayName: 'Order 123',
        status: 'pending',
        attrs: {},
        constraints: [],
        sourceSystem: 'ERP',
        snapshotAt: new Date().toISOString(),
      },
    }

    const result = gateway.route(intent, bizRefs)

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
  })
})
