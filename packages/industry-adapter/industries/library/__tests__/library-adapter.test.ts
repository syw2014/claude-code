import { describe, test, expect } from 'bun:test'
import { LibrarySemanticMapper } from '../SemanticMapper.js'
import { LibraryBizRefBuilder } from '../BizRefBuilder.js'
import { LibraryCapabilityGateway } from '../CapabilityGateway.js'
import type { NormalizedIntent } from '../../../src/types.js'

// ─── LibrarySemanticMapper ───────────────────────────────────────────────────

describe('LibrarySemanticMapper', () => {
  test('maps "借书 bookId=123" to circulation/checkout_book', async () => {
    const mapper = new LibrarySemanticMapper()
    const result = await mapper.map('借书 bookId=123', 'tenant-lib')

    expect(result.sceneCode).toBe('circulation')
    expect(result.actionCode).toBe('checkout_book')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.rawInput).toBe('借书 bookId=123')
  })

  test('maps "还书" to actionCode return_book', async () => {
    const mapper = new LibrarySemanticMapper()
    const result = await mapper.map('还书', 'tenant-lib')

    expect(result.actionCode).toBe('return_book')
    expect(result.sceneCode).toBe('circulation')
  })

  test('maps "查询馆藏" to actionCode query_holdings', async () => {
    const mapper = new LibrarySemanticMapper()
    const result = await mapper.map('查询馆藏', 'tenant-lib')

    expect(result.actionCode).toBe('query_holdings')
    expect(result.sceneCode).toBe('query')
  })

  test('maps "续借" to actionCode renew_book', async () => {
    const mapper = new LibrarySemanticMapper()
    const result = await mapper.map('续借', 'tenant-lib')

    expect(result.actionCode).toBe('renew_book')
    expect(result.sceneCode).toBe('circulation')
  })

  test('maps "查询读者" to actionCode query_reader', async () => {
    const mapper = new LibrarySemanticMapper()
    const result = await mapper.map('查询读者', 'tenant-lib')

    expect(result.actionCode).toBe('query_reader')
    expect(result.sceneCode).toBe('query')
  })

  test('maps "waive fee" to actionCode waive_fee', async () => {
    const mapper = new LibrarySemanticMapper()
    const result = await mapper.map('waive fee', 'tenant-lib')

    expect(result.actionCode).toBe('waive_fee')
    expect(result.sceneCode).toBe('fee')
  })

  test('maps "dispute" to actionCode handle_dispute', async () => {
    const mapper = new LibrarySemanticMapper()
    const result = await mapper.map('dispute', 'tenant-lib')

    expect(result.actionCode).toBe('handle_dispute')
    expect(result.sceneCode).toBe('dispute')
  })

  test('returns unknown for unrecognized input', async () => {
    const mapper = new LibrarySemanticMapper()
    const result = await mapper.map('xyzzy unrelated input', 'tenant-lib')

    expect(result.sceneCode).toBe('unknown')
    expect(result.actionCode).toBe('unknown')
  })
})

// ─── LibraryBizRefBuilder ────────────────────────────────────────────────────

describe('LibraryBizRefBuilder', () => {
  const makeIntent = (requiredParams: string[]): NormalizedIntent => ({
    sceneCode: 'circulation',
    actionCode: 'checkout_book',
    confidence: 0.9,
    pathType: 'fast',
    requiredParams,
    rawInput: 'test',
  })

  test('produces BOOK + READER BizRefs for requiredParams bookId + readerId', async () => {
    const builder = new LibraryBizRefBuilder()
    const intent = makeIntent(['bookId', 'readerId'])
    const result = await builder.build(intent, 'tenant-lib')

    expect(result.bizRefs['bookId']).toBeDefined()
    expect(result.bizRefs['bookId'].type).toBe('BOOK')
    expect(result.bizRefs['bookId'].id).toBe('bookId_stub')
    expect(result.bizRefs['bookId'].sourceSystem).toBe('library-stub')
    expect(result.bizRefs['bookId'].attrs).toEqual({})
    expect(result.bizRefs['bookId'].constraints).toEqual([])

    expect(result.bizRefs['readerId']).toBeDefined()
    expect(result.bizRefs['readerId'].type).toBe('READER')
    expect(result.bizRefs['readerId'].id).toBe('readerId_stub')
    expect(result.bizRefs['readerId'].sourceSystem).toBe('library-stub')
  })

  test('produces FEE BizRef for feeId param', async () => {
    const builder = new LibraryBizRefBuilder()
    const intent = makeIntent(['readerId', 'feeId'])
    const result = await builder.build(intent, 'tenant-lib')

    expect(result.bizRefs['feeId']).toBeDefined()
    expect(result.bizRefs['feeId'].type).toBe('FEE')
    expect(result.bizRefs['feeId'].id).toBe('feeId_stub')
  })

  test('factSet contains tenantId and intentSceneCode', async () => {
    const builder = new LibraryBizRefBuilder()
    const intent = makeIntent(['bookId'])
    const result = await builder.build(intent, 'tenant-lib')

    expect(result.factSet.facts['tenantId']).toBe('tenant-lib')
    expect(result.factSet.facts['intentSceneCode']).toBe('circulation')
  })

  test('skips params that do not match known types', async () => {
    const builder = new LibraryBizRefBuilder()
    const intent = makeIntent(['query'])
    const result = await builder.build(intent, 'tenant-lib')

    // 'query' doesn't match book/reader/fee patterns
    expect(Object.keys(result.bizRefs)).toHaveLength(0)
  })

  test('factSet builtAt is a valid ISO string', async () => {
    const builder = new LibraryBizRefBuilder()
    const intent = makeIntent([])
    const result = await builder.build(intent, 'tenant-lib')

    const date = new Date(result.factSet.builtAt)
    expect(Number.isNaN(date.getTime())).toBe(false)
  })
})

// ─── LibraryCapabilityGateway ─────────────────────────────────────────────────

describe('LibraryCapabilityGateway', () => {
  const makeIntent = (actionCode: string): NormalizedIntent => ({
    sceneCode: 'test',
    actionCode,
    confidence: 0.9,
    pathType: 'fast',
    requiredParams: [],
    rawInput: 'test',
  })

  test('checkout_book → tool binding with permissionLevel low', () => {
    const gateway = new LibraryCapabilityGateway()
    const result = gateway.route(makeIntent('checkout_book'), {})

    expect(result).toHaveLength(1)
    expect(result[0].channel).toBe('tool')
    expect(result[0].capabilityName).toBe('checkout_book')
    expect(result[0].permissionLevel).toBe('low')
    expect(result[0].confirmLevel).toBe('auto')
  })

  test('return_book → tool binding with permissionLevel low', () => {
    const gateway = new LibraryCapabilityGateway()
    const result = gateway.route(makeIntent('return_book'), {})

    expect(result).toHaveLength(1)
    expect(result[0].permissionLevel).toBe('low')
    expect(result[0].confirmLevel).toBe('auto')
  })

  test('renew_book → tool binding with permissionLevel low', () => {
    const gateway = new LibraryCapabilityGateway()
    const result = gateway.route(makeIntent('renew_book'), {})

    expect(result).toHaveLength(1)
    expect(result[0].permissionLevel).toBe('low')
  })

  test('query_reader → tool binding with permissionLevel medium and silent_confirm', () => {
    const gateway = new LibraryCapabilityGateway()
    const result = gateway.route(makeIntent('query_reader'), {})

    expect(result).toHaveLength(1)
    expect(result[0].channel).toBe('tool')
    expect(result[0].permissionLevel).toBe('medium')
    expect(result[0].confirmLevel).toBe('silent_confirm')
  })

  test('waive_fee → confirmLevel explicit_confirm', () => {
    const gateway = new LibraryCapabilityGateway()
    const result = gateway.route(makeIntent('waive_fee'), {})

    expect(result).toHaveLength(1)
    expect(result[0].confirmLevel).toBe('explicit_confirm')
    expect(result[0].permissionLevel).toBe('high')
  })

  test('handle_dispute → workflow binding with supervisor_approval', () => {
    const gateway = new LibraryCapabilityGateway()
    const result = gateway.route(makeIntent('handle_dispute'), {})

    expect(result).toHaveLength(1)
    expect(result[0].channel).toBe('workflow')
    expect(result[0].permissionLevel).toBe('high')
    expect(result[0].confirmLevel).toBe('supervisor_approval')
  })

  test('unknown actionCode → returns []', () => {
    const gateway = new LibraryCapabilityGateway()
    const result = gateway.route(makeIntent('completely_unknown_action'), {})

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })
})
