import type { UUID, TaskStatus, TaskMode } from 'src/runtime/types'

export interface StoredTask {
  id: UUID
  sessionId: UUID
  traceId: UUID
  tenantId: string
  userId: string
  industryCode: string
  parentTaskId: UUID | null
  inputText: string
  mode: TaskMode
  status: TaskStatus
  envelope: Record<string, unknown>
  idempotencyKey: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskRepository {
  create(params: Omit<StoredTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredTask>
  findById(tenantId: string, id: UUID): Promise<StoredTask | null>
  findByIdempotencyKey(tenantId: string, sessionId: UUID, key: string): Promise<StoredTask | null>
  updateStatus(tenantId: string, id: UUID, status: TaskStatus, extra?: Partial<Pick<StoredTask, 'startedAt' | 'completedAt' | 'envelope'>>): Promise<StoredTask | null>
  listBySession(tenantId: string, sessionId: UUID): Promise<StoredTask[]>
}

/**
 * In-memory TaskRepository.
 * Production: replace with PostgreSQL (agent_tasks table).
 */
export class InMemoryTaskRepository implements TaskRepository {
  private store = new Map<string, StoredTask>()
  private idempotencyIndex = new Map<string, UUID>()

  private key(tenantId: string, id: UUID): string {
    return `${tenantId}:${id}`
  }

  private idemKey(tenantId: string, sessionId: UUID, idemKey: string): string {
    return `${tenantId}:${sessionId}:${idemKey}`
  }

  async create(params: Omit<StoredTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredTask> {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const task: StoredTask = { ...params, id, createdAt: now, updatedAt: now }
    this.store.set(this.key(params.tenantId, id), task)
    if (params.idempotencyKey) {
      this.idempotencyIndex.set(this.idemKey(params.tenantId, params.sessionId, params.idempotencyKey), id)
    }
    return task
  }

  async findById(tenantId: string, id: UUID): Promise<StoredTask | null> {
    return this.store.get(this.key(tenantId, id)) ?? null
  }

  async findByIdempotencyKey(tenantId: string, sessionId: UUID, key: string): Promise<StoredTask | null> {
    const id = this.idempotencyIndex.get(this.idemKey(tenantId, sessionId, key))
    if (!id) return null
    return this.findById(tenantId, id)
  }

  async updateStatus(
    tenantId: string,
    id: UUID,
    status: TaskStatus,
    extra?: Partial<Pick<StoredTask, 'startedAt' | 'completedAt' | 'envelope'>>
  ): Promise<StoredTask | null> {
    const existing = this.store.get(this.key(tenantId, id))
    if (!existing) return null
    const updated: StoredTask = { ...existing, ...extra, status, updatedAt: new Date().toISOString() }
    this.store.set(this.key(tenantId, id), updated)
    return updated
  }

  async listBySession(tenantId: string, sessionId: UUID): Promise<StoredTask[]> {
    return Array.from(this.store.values()).filter(
      t => t.tenantId === tenantId && t.sessionId === sessionId
    )
  }

  size(): number {
    return this.store.size
  }
}
