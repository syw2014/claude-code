// src/runtime/permission/HumanConfirmManager.ts
import type { UUID, ConfirmRequest, ConfirmStatus } from '../types.js'

export interface ConfirmRecord {
  request: ConfirmRequest
  status: ConfirmStatus
  resolvedAt?: string
  decision?: 'approve' | 'reject' | 'timeout'
  confirmedBy?: string
  confirmedRole?: string
}

/**
 * Manages HITL confirm lifecycle.
 * Phase B: in-memory. Phase C: persist to PostgreSQL + Redis.
 */
export class HumanConfirmManager {
  private records = new Map<string, ConfirmRecord>()

  create(request: ConfirmRequest): ConfirmRecord {
    const record: ConfirmRecord = { request, status: 'pending' }
    this.records.set(request.id, record)
    return record
  }

  get(confirmId: UUID): ConfirmRecord | null {
    return this.records.get(confirmId) ?? null
  }

  resolve(
    confirmId: UUID,
    decision: 'approve' | 'reject',
    confirmedBy: string,
    confirmedRole: string
  ): ConfirmRecord | null {
    const record = this.records.get(confirmId)
    if (!record) return null
    if (record.status !== 'pending' && record.status !== 'escalated') return record

    const status: ConfirmStatus = decision === 'approve' ? 'approved' : 'rejected'
    const updated: ConfirmRecord = {
      ...record,
      status,
      decision,
      confirmedBy,
      confirmedRole,
      resolvedAt: new Date().toISOString(),
    }
    this.records.set(confirmId, updated)
    return updated
  }

  expireOverdue(): void {
    const now = Date.now()
    for (const [id, record] of this.records) {
      if (record.status === 'pending' && new Date(record.request.expiresAt).getTime() < now) {
        this.records.set(id, { ...record, status: 'timeout', decision: 'timeout', resolvedAt: new Date().toISOString() })
      }
    }
  }

  size(): number {
    return this.records.size
  }
}
