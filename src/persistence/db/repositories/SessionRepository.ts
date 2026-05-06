import type { UUID, SessionStatus, PermissionMode } from 'src/runtime/types'

export interface StoredSession {
  id: UUID
  tenantId: string
  userId: string
  industryCode: string
  status: SessionStatus
  permissionMode: PermissionMode
  modelOverride: string | null
  currentTraceId: UUID | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export interface SessionRepository {
  create(params: Omit<StoredSession, 'id' | 'createdAt' | 'updatedAt' | 'closedAt'>): Promise<StoredSession>
  findById(tenantId: string, id: UUID): Promise<StoredSession | null>
  updateStatus(tenantId: string, id: UUID, status: SessionStatus, closedAt?: string): Promise<StoredSession | null>
  updateTraceId(tenantId: string, id: UUID, traceId: UUID): Promise<void>
}

/**
 * In-memory SessionRepository.
 * Production: replace with PostgreSQL (agent_sessions table).
 */
export class InMemorySessionRepository implements SessionRepository {
  private store = new Map<string, StoredSession>()

  private key(tenantId: string, id: UUID): string {
    return `${tenantId}:${id}`
  }

  async create(params: Omit<StoredSession, 'id' | 'createdAt' | 'updatedAt' | 'closedAt'>): Promise<StoredSession> {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const session: StoredSession = {
      ...params,
      id,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    }
    this.store.set(this.key(params.tenantId, id), session)
    return session
  }

  async findById(tenantId: string, id: UUID): Promise<StoredSession | null> {
    return this.store.get(this.key(tenantId, id)) ?? null
  }

  async updateStatus(tenantId: string, id: UUID, status: SessionStatus, closedAt?: string): Promise<StoredSession | null> {
    const existing = this.store.get(this.key(tenantId, id))
    if (!existing) return null
    const updated: StoredSession = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
      closedAt: closedAt ?? existing.closedAt,
    }
    this.store.set(this.key(tenantId, id), updated)
    return updated
  }

  async updateTraceId(tenantId: string, id: UUID, traceId: UUID): Promise<void> {
    const existing = this.store.get(this.key(tenantId, id))
    if (!existing) return
    this.store.set(this.key(tenantId, id), {
      ...existing,
      currentTraceId: traceId,
      updatedAt: new Date().toISOString(),
    })
  }

  size(): number {
    return this.store.size
  }
}
