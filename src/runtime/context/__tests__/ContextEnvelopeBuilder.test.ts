import { describe, test, expect } from 'bun:test'
import { ContextEnvelopeBuilder } from 'src/runtime/context/ContextEnvelopeBuilder.js'
import { createEnvelope } from 'src/runtime/context/ContextEnvelope.js'
import type { ContextEnvelope } from 'src/runtime/context/ContextEnvelope.js'
import type { AdapterPipelineOutput } from 'src/runtime/context/ContextEnvelopeBuilder.js'
import type { BizRef, FactSet, NormalizedIntent } from '@claude-code-best/industry-adapter'

function makeEnvelope(): ContextEnvelope {
  return createEnvelope({
    sessionId: 'sess_001',
    traceId: 'trace_001',
    tenantId: 'tenant_001',
    userId: 'user_001',
    industryCode: 'library',
    turnId: 'turn_001',
  })
}

function makeBizRef(type: string, id: string, displayName?: string): BizRef {
  return {
    type,
    id,
    displayName,
    attrs: {},
    constraints: [],
    sourceSystem: 'test',
    snapshotAt: new Date().toISOString(),
  }
}

function makeIntent(): NormalizedIntent {
  return {
    sceneCode: 'checkout',
    actionCode: 'borrow',
    confidence: 0.95,
    pathType: 'fast',
    requiredParams: ['book_id', 'user_id'],
    rawInput: 'borrow a book',
  }
}

function makeFactSet(): FactSet {
  return {
    facts: { availability: 'in_stock' },
    sources: [{ key: 'availability', source: 'catalog' }],
    builtAt: new Date().toISOString(),
  }
}

describe('ContextEnvelopeBuilder', () => {
  test('preserves existing bizRefs not in the new output', () => {
    const builder = new ContextEnvelopeBuilder()
    const current = makeEnvelope()
    const ref123 = makeBizRef('book', '123', 'The Hobbit')
    const ref456 = makeBizRef('user', '456', 'Alice')
    current.bizRefs = {
      'book_123': ref123,
      'user_456': ref456,
    }

    const ref789 = makeBizRef('book', '789', 'Harry Potter')
    const pipelineOutput: AdapterPipelineOutput = {
      intent: makeIntent(),
      bizRefs: {
        'book_789': ref789,
      },
      factSet: makeFactSet(),
    }

    const updated = builder.build(current, pipelineOutput, 'turn_002')

    expect(updated.bizRefs).toHaveProperty('book_123')
    expect(updated.bizRefs).toHaveProperty('user_456')
    expect(updated.bizRefs).toHaveProperty('book_789')
    expect(updated.bizRefs['book_123']?.id).toBe('123')
    expect(updated.bizRefs['user_456']?.id).toBe('456')
    expect(updated.bizRefs['book_789']?.id).toBe('789')
  })

  test('new bizRefs overwrite existing ones with same key', () => {
    const builder = new ContextEnvelopeBuilder()
    const current = makeEnvelope()
    current.bizRefs = {
      'book_123': makeBizRef('book', '123', 'Old Title'),
    }

    const newRef = makeBizRef('book', '123', 'New Title')
    const pipelineOutput: AdapterPipelineOutput = {
      intent: makeIntent(),
      bizRefs: {
        'book_123': newRef,
      },
      factSet: makeFactSet(),
    }

    const updated = builder.build(current, pipelineOutput, 'turn_002')

    expect(updated.bizRefs['book_123']?.displayName).toBe('New Title')
    expect(updated.bizRefs['book_123']?.id).toBe('123')
  })

  test('factSet is replaced with the new one', () => {
    const builder = new ContextEnvelopeBuilder()
    const current = makeEnvelope()
    current.factSet = {
      facts: { old: 'value' },
      sources: [],
      builtAt: '2026-01-01T00:00:00Z',
    }

    const newFactSet = makeFactSet()
    const pipelineOutput: AdapterPipelineOutput = {
      intent: makeIntent(),
      bizRefs: {},
      factSet: newFactSet,
    }

    const updated = builder.build(current, pipelineOutput, 'turn_002')

    expect(updated.factSet.facts).toEqual({ availability: 'in_stock' })
    expect(updated.factSet.sources).toHaveLength(1)
    expect(updated.factSet.sources[0]?.key).toBe('availability')
  })

  test('turnId is updated, other fields are preserved', () => {
    const builder = new ContextEnvelopeBuilder()
    const current = makeEnvelope()
    const originalSessionId = current.sessionId
    const originalTenantId = current.tenantId
    const originalUserId = current.userId

    const pipelineOutput: AdapterPipelineOutput = {
      intent: makeIntent(),
      bizRefs: {},
      factSet: makeFactSet(),
    }

    const newTurnId = 'turn_999'
    const updated = builder.build(current, pipelineOutput, newTurnId)

    expect(updated.turnId).toBe(newTurnId)
    expect(updated.sessionId).toBe(originalSessionId)
    expect(updated.tenantId).toBe(originalTenantId)
    expect(updated.userId).toBe(originalUserId)
    expect(updated.industryCode).toBe(current.industryCode)
    expect(updated.traceId).toBe(current.traceId)
  })
})
