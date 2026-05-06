import type { UUID } from '../types.js'
import type { ContextEnvelope } from '../context/ContextEnvelope.js'

export interface CheckpointStore {
  save(tenantId: string, taskId: UUID, envelope: ContextEnvelope): Promise<void>
  load(tenantId: string, taskId: UUID): Promise<ContextEnvelope | null>
  delete(tenantId: string, taskId: UUID): Promise<void>
}

/**
 * In-memory CheckpointStore for task envelope snapshots.
 * Production: persist to Redis (task:* key) for cross-node HITL recovery.
 */
export class InMemoryCheckpointStore implements CheckpointStore {
  private store = new Map<string, ContextEnvelope>()

  private key(tenantId: string, taskId: UUID): string {
    return `${tenantId}:${taskId}`
  }

  async save(tenantId: string, taskId: UUID, envelope: ContextEnvelope): Promise<void> {
    this.store.set(this.key(tenantId, taskId), { ...envelope })
  }

  async load(tenantId: string, taskId: UUID): Promise<ContextEnvelope | null> {
    return this.store.get(this.key(tenantId, taskId)) ?? null
  }

  async delete(tenantId: string, taskId: UUID): Promise<void> {
    this.store.delete(this.key(tenantId, taskId))
  }
}
