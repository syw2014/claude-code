import type { UUID, TaskRun, TaskStatus } from '../types.js'

export interface TaskStateStore {
  get(tenantId: string, taskId: UUID): Promise<TaskRun | null>
  set(tenantId: string, task: TaskRun): Promise<void>
  updateStatus(tenantId: string, taskId: UUID, status: TaskStatus, extra?: Partial<TaskRun>): Promise<TaskRun | null>
  listBySession(tenantId: string, sessionId: UUID): Promise<TaskRun[]>
}

/**
 * In-memory TaskStateStore implementation.
 * Production: replace with Redis + PostgreSQL.
 */
export class InMemoryTaskStateStore implements TaskStateStore {
  private store = new Map<string, TaskRun>()

  private key(tenantId: string, taskId: UUID): string {
    return `${tenantId}:${taskId}`
  }

  async get(tenantId: string, taskId: UUID): Promise<TaskRun | null> {
    return this.store.get(this.key(tenantId, taskId)) ?? null
  }

  async set(tenantId: string, task: TaskRun): Promise<void> {
    this.store.set(this.key(tenantId, task.id), { ...task })
  }

  async updateStatus(
    tenantId: string,
    taskId: UUID,
    status: TaskStatus,
    extra?: Partial<TaskRun>
  ): Promise<TaskRun | null> {
    const existing = this.store.get(this.key(tenantId, taskId))
    if (!existing) return null
    const updated: TaskRun = { ...existing, ...extra, status }
    this.store.set(this.key(tenantId, taskId), updated)
    return updated
  }

  async listBySession(tenantId: string, sessionId: UUID): Promise<TaskRun[]> {
    return Array.from(this.store.values()).filter(
      t => t.tenantId === tenantId && t.sessionId === sessionId
    )
  }

  size(): number {
    return this.store.size
  }
}
