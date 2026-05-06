// src/runtime/engine/__tests__/MemoryManager.test.ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { MemoryManager, InMemoryMemoryStore, type SimpleMemoryStore } from 'src/runtime/engine/MemoryManager.js'

describe('InMemoryMemoryStore', () => {
  let store: SimpleMemoryStore

  beforeEach(() => {
    store = new InMemoryMemoryStore()
  })

  test('readShortTerm returns null for missing key', async () => {
    const result = await store.getShortTerm('session-1', 'nonexistent')
    expect(result).toBe(null)
  })

  test('writeShortTerm + readShortTerm round-trips', async () => {
    await store.setShortTerm('session-1', 'mykey', 'myvalue')
    const result = await store.getShortTerm('session-1', 'mykey')
    expect(result).toBe('myvalue')
  })

  test('readLongTerm returns null for missing key', async () => {
    const result = await store.getLongTerm('tenant-1', 'user-1', 'nonexistent')
    expect(result).toBe(null)
  })

  test('writeLongTerm + readLongTerm round-trips', async () => {
    await store.setLongTerm('tenant-1', 'user-1', 'mykey', 'myvalue')
    const result = await store.getLongTerm('tenant-1', 'user-1', 'mykey')
    expect(result).toBe('myvalue')
  })

  test('short-term and long-term storage are isolated', async () => {
    // Write same key to both scopes
    await store.setShortTerm('session-1', 'key', 'short-value')
    await store.setLongTerm('tenant-1', 'user-1', 'key', 'long-value')

    // Verify they are separate
    const shortResult = await store.getShortTerm('session-1', 'key')
    const longResult = await store.getLongTerm('tenant-1', 'user-1', 'key')

    expect(shortResult).toBe('short-value')
    expect(longResult).toBe('long-value')
  })

  test('short-term storage is session-isolated', async () => {
    // Write to session-1
    await store.setShortTerm('session-1', 'key', 'value-1')

    // Write different value to session-2
    await store.setShortTerm('session-2', 'key', 'value-2')

    // Verify isolation
    const result1 = await store.getShortTerm('session-1', 'key')
    const result2 = await store.getShortTerm('session-2', 'key')

    expect(result1).toBe('value-1')
    expect(result2).toBe('value-2')
  })

  test('long-term storage is tenant+user isolated', async () => {
    // Write to tenant-1, user-1
    await store.setLongTerm('tenant-1', 'user-1', 'key', 'value-1')

    // Write to tenant-1, user-2
    await store.setLongTerm('tenant-1', 'user-2', 'key', 'value-2')

    // Verify isolation
    const result1 = await store.getLongTerm('tenant-1', 'user-1', 'key')
    const result2 = await store.getLongTerm('tenant-1', 'user-2', 'key')

    expect(result1).toBe('value-1')
    expect(result2).toBe('value-2')
  })

  test('setShortTerm with TTL (ignored in in-memory)', async () => {
    // TTL is accepted but not enforced
    await store.setShortTerm('session-1', 'key', 'value', 60)
    const result = await store.getShortTerm('session-1', 'key')
    expect(result).toBe('value')
  })
})

describe('MemoryManager', () => {
  let store: SimpleMemoryStore
  let manager: MemoryManager

  beforeEach(() => {
    store = new InMemoryMemoryStore()
    manager = new MemoryManager(store)
  })

  test('readShortTerm returns null for missing key', async () => {
    const result = await manager.readShortTerm('session-1', 'nonexistent')
    expect(result).toBe(null)
  })

  test('writeShortTerm + readShortTerm round-trips', async () => {
    await manager.writeShortTerm('session-1', 'mykey', 'myvalue')
    const result = await manager.readShortTerm('session-1', 'mykey')
    expect(result).toBe('myvalue')
  })

  test('readLongTerm returns null for missing key', async () => {
    const result = await manager.readLongTerm('tenant-1', 'user-1', 'nonexistent')
    expect(result).toBe(null)
  })

  test('writeLongTerm + readLongTerm round-trips', async () => {
    await manager.writeLongTerm('tenant-1', 'user-1', 'mykey', 'myvalue')
    const result = await manager.readLongTerm('tenant-1', 'user-1', 'mykey')
    expect(result).toBe('myvalue')
  })

  test('bulkRead reads from correct scopes', async () => {
    // Setup data
    await manager.writeShortTerm('session-1', 'short-key-1', 'short-value-1')
    await manager.writeShortTerm('session-1', 'short-key-2', 'short-value-2')
    await manager.writeLongTerm('tenant-1', 'user-1', 'long-key-1', 'long-value-1')
    await manager.writeLongTerm('tenant-1', 'user-1', 'long-key-2', 'long-value-2')

    // Bulk read mixed scopes
    const result = await manager.bulkRead('session-1', 'tenant-1', 'user-1', [
      { key: 'short-key-1', scope: 'short' },
      { key: 'short-key-2', scope: 'short' },
      { key: 'long-key-1', scope: 'long' },
      { key: 'long-key-2', scope: 'long' },
      { key: 'nonexistent', scope: 'short' }
    ])

    expect(result['short-key-1']).toBe('short-value-1')
    expect(result['short-key-2']).toBe('short-value-2')
    expect(result['long-key-1']).toBe('long-value-1')
    expect(result['long-key-2']).toBe('long-value-2')
    expect(result['nonexistent']).toBe(null)
  })

  test('bulkWrite writes to correct scopes', async () => {
    const entries = [
      { key: 'short-key', value: 'short-value', scope: 'short' as const },
      { key: 'long-key', value: 'long-value', scope: 'long' as const }
    ]

    await manager.bulkWrite('session-1', 'tenant-1', 'user-1', entries)

    // Verify writes
    const shortResult = await manager.readShortTerm('session-1', 'short-key')
    const longResult = await manager.readLongTerm('tenant-1', 'user-1', 'long-key')

    expect(shortResult).toBe('short-value')
    expect(longResult).toBe('long-value')
  })

  test('bulkWrite with TTL on short-term entries', async () => {
    const entries = [
      { key: 'key-with-ttl', value: 'value', scope: 'short' as const, ttlSeconds: 300 }
    ]

    await manager.bulkWrite('session-1', 'tenant-1', 'user-1', entries)

    const result = await manager.readShortTerm('session-1', 'key-with-ttl')
    expect(result).toBe('value')
  })

  test('manager delegates to underlying store correctly', async () => {
    const customStore: SimpleMemoryStore = {
      getShortTerm: async (sessionId: string, key: string) => {
        return sessionId === 'special' ? `special-${key}` : null
      },
      setShortTerm: async (_sessionId: string, _key: string, _value: string, _ttlSeconds?: number) => {
        // no-op
      },
      getLongTerm: async (tenantId: string, userId: string, key: string) => {
        return `${tenantId}:${userId}:${key}`
      },
      setLongTerm: async (_tenantId: string, _userId: string, _key: string, _value: string) => {
        // no-op
      }
    }

    const customManager = new MemoryManager(customStore)

    const shortResult = await customManager.readShortTerm('special', 'test')
    expect(shortResult).toBe('special-test')

    const longResult = await customManager.readLongTerm('t1', 'u1', 'k1')
    expect(longResult).toBe('t1:u1:k1')
  })

  test('bulkRead with empty entries list returns empty object', async () => {
    const result = await manager.bulkRead('session-1', 'tenant-1', 'user-1', [])
    expect(result).toEqual({})
  })

  test('bulkWrite with empty entries list succeeds', async () => {
    await manager.bulkWrite('session-1', 'tenant-1', 'user-1', [])
    // Should not throw
    expect(true).toBe(true)
  })
})
