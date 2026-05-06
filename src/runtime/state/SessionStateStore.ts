import type { UUID } from '../types.js'
import type { SessionStore, SessionState } from '../stores.js'

/**
 * In-memory SessionStore implementation.
 * Production: replace backing map with Redis using sessionKey() builder.
 */
export class SessionStateStore implements SessionStore {
  private store = new Map<string, SessionState>()

  private key(tenantId: string, sessionId: UUID): string {
    return `${tenantId}:${sessionId}`
  }

  async get(tenantId: string, sessionId: UUID): Promise<SessionState | null> {
    return this.store.get(this.key(tenantId, sessionId)) ?? null
  }

  async set(tenantId: string, sessionId: UUID, state: SessionState): Promise<void> {
    this.store.set(this.key(tenantId, sessionId), state)
  }

  async delete(tenantId: string, sessionId: UUID): Promise<void> {
    this.store.delete(this.key(tenantId, sessionId))
  }

  /** Total number of active sessions — for testing */
  size(): number {
    return this.store.size
  }
}
