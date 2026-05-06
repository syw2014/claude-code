// src/runtime/engine/MemoryManager.ts

/**
 * Simplified MemoryStore interface for session and user memory operations.
 * Used by MemoryManager to abstract storage backend (Redis, PostgreSQL, in-memory, etc.)
 */
export interface SimpleMemoryStore {
  getShortTerm(sessionId: string, key: string): Promise<string | null>
  setShortTerm(sessionId: string, key: string, value: string, ttlSeconds?: number): Promise<void>
  getLongTerm(tenantId: string, userId: string, key: string): Promise<string | null>
  setLongTerm(tenantId: string, userId: string, key: string, value: string): Promise<void>
}

/**
 * Represents a single memory entry to be stored or retrieved.
 * Scope determines which storage tier (short-term session or long-term user) is used.
 */
export interface MemoryEntry {
  key: string
  value: string
  scope: 'short' | 'long'
  ttlSeconds?: number
}

/**
 * MemoryManager delegates memory operations to a backing store.
 * Provides high-level memory access: short-term (session), long-term (user).
 * All operations are async to support distributed storage backends.
 */
export class MemoryManager {
  constructor(private store: SimpleMemoryStore) {}

  /**
   * Read short-term memory (session-scoped).
   * Returns null if key not found.
   */
  async readShortTerm(sessionId: string, key: string): Promise<string | null> {
    return this.store.getShortTerm(sessionId, key)
  }

  /**
   * Write short-term memory (session-scoped).
   * Optional TTL in seconds.
   */
  async writeShortTerm(
    sessionId: string,
    key: string,
    value: string,
    ttlSeconds?: number
  ): Promise<void> {
    return this.store.setShortTerm(sessionId, key, value, ttlSeconds)
  }

  /**
   * Read long-term memory (user-scoped, persists across sessions).
   * Returns null if key not found.
   */
  async readLongTerm(tenantId: string, userId: string, key: string): Promise<string | null> {
    return this.store.getLongTerm(tenantId, userId, key)
  }

  /**
   * Write long-term memory (user-scoped, persists across sessions).
   */
  async writeLongTerm(tenantId: string, userId: string, key: string, value: string): Promise<void> {
    return this.store.setLongTerm(tenantId, userId, key, value)
  }

  /**
   * Bulk read from mixed scopes (short-term and long-term).
   * Returns a map of key -> value (or null if not found).
   */
  async bulkRead(
    sessionId: string,
    tenantId: string,
    userId: string,
    entries: Array<{ key: string; scope: 'short' | 'long' }>
  ): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {}

    for (const entry of entries) {
      if (entry.scope === 'short') {
        result[entry.key] = await this.store.getShortTerm(sessionId, entry.key)
      } else {
        result[entry.key] = await this.store.getLongTerm(tenantId, userId, entry.key)
      }
    }

    return result
  }

  /**
   * Bulk write to mixed scopes (short-term and long-term).
   */
  async bulkWrite(
    sessionId: string,
    tenantId: string,
    userId: string,
    entries: MemoryEntry[]
  ): Promise<void> {
    for (const entry of entries) {
      if (entry.scope === 'short') {
        await this.store.setShortTerm(sessionId, entry.key, entry.value, entry.ttlSeconds)
      } else {
        await this.store.setLongTerm(tenantId, userId, entry.key, entry.value)
      }
    }
  }
}

/**
 * In-memory implementation of SimpleMemoryStore.
 * Uses Map for both short-term and long-term storage.
 * TTL is not enforced (acceptable for Phase C).
 * Suitable for testing and single-process deployments.
 */
export class InMemoryMemoryStore implements SimpleMemoryStore {
  private shortTermStorage = new Map<string, string>()
  private longTermStorage = new Map<string, string>()

  /**
   * Returns key format: "{sessionId}#{key}"
   */
  private shortTermKey(sessionId: string, key: string): string {
    return `${sessionId}#${key}`
  }

  /**
   * Returns key format: "{tenantId}#{userId}#{key}"
   */
  private longTermKey(tenantId: string, userId: string, key: string): string {
    return `${tenantId}#${userId}#${key}`
  }

  async getShortTerm(_sessionId: string, key: string): Promise<string | null> {
    const fullKey = this.shortTermKey(_sessionId, key)
    return this.shortTermStorage.get(fullKey) ?? null
  }

  async setShortTerm(
    _sessionId: string,
    key: string,
    value: string,
    _ttlSeconds?: number
  ): Promise<void> {
    const fullKey = this.shortTermKey(_sessionId, key)
    this.shortTermStorage.set(fullKey, value)
  }

  async getLongTerm(_tenantId: string, _userId: string, key: string): Promise<string | null> {
    const fullKey = this.longTermKey(_tenantId, _userId, key)
    return this.longTermStorage.get(fullKey) ?? null
  }

  async setLongTerm(_tenantId: string, _userId: string, key: string, value: string): Promise<void> {
    const fullKey = this.longTermKey(_tenantId, _userId, key)
    this.longTermStorage.set(fullKey, value)
  }
}
