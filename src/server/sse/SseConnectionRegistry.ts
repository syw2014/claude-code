// src/server/sse/SseConnectionRegistry.ts
import type { UUID } from 'src/runtime/types'

export type SseConnection = {
  sessionId: UUID
  tenantId: string
  controller: ReadableStreamDefaultController<Uint8Array>
  sequence: number
  connectedAt: string
}

/**
 * In-memory registry of active SSE connections.
 * Production: coordinate via Redis (sse:* key) for multi-node routing.
 */
export class SseConnectionRegistry {
  private connections = new Map<string, SseConnection[]>()

  private key(tenantId: string, sessionId: UUID): string {
    return `${tenantId}:${sessionId}`
  }

  register(tenantId: string, sessionId: UUID, controller: ReadableStreamDefaultController<Uint8Array>): SseConnection {
    const conn: SseConnection = {
      sessionId,
      tenantId,
      controller,
      sequence: 0,
      connectedAt: new Date().toISOString(),
    }
    const k = this.key(tenantId, sessionId)
    const existing = this.connections.get(k) ?? []
    this.connections.set(k, [...existing, conn])
    return conn
  }

  unregister(tenantId: string, sessionId: UUID, conn: SseConnection): void {
    const k = this.key(tenantId, sessionId)
    const existing = this.connections.get(k) ?? []
    this.connections.set(k, existing.filter(c => c !== conn))
  }

  getConnections(tenantId: string, sessionId: UUID): SseConnection[] {
    return this.connections.get(this.key(tenantId, sessionId)) ?? []
  }

  totalConnections(): number {
    let n = 0
    for (const conns of this.connections.values()) n += conns.length
    return n
  }
}
