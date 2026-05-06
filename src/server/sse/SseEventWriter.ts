// src/server/sse/SseEventWriter.ts
import type { SSEWriter } from 'src/runtime/stores'
import type { SseConnection } from './SseConnectionRegistry.js'
import type { UUID } from 'src/runtime/types'

const encoder = new TextEncoder()

function formatSseMessage(event: { type: string; traceId: UUID; sequence: number; data: Record<string, unknown> }): Uint8Array {
  const payload = JSON.stringify({ type: event.type, traceId: event.traceId, sequence: event.sequence, ...event.data })
  return encoder.encode(`event: ${event.type}\ndata: ${payload}\nid: ${event.sequence}\n\n`)
}

/**
 * SSEWriter backed by a single SseConnection.
 */
export class SseEventWriter implements SSEWriter {
  constructor(private conn: SseConnection) {}

  send(event: Parameters<SSEWriter['send']>[0]): void {
    const bytes = formatSseMessage(event)
    try {
      this.conn.controller.enqueue(bytes)
      this.conn.sequence++
    } catch {
      // connection closed — ignore
    }
  }

  close(): void {
    try {
      this.conn.controller.close()
    } catch {
      // already closed
    }
  }
}

export function createSseResponse(
  sessionId: UUID,
  setup: (controller: ReadableStreamDefaultController<Uint8Array>) => void
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      setup(controller)
    },
    cancel() {
      // client disconnected
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': sessionId,
    },
  })
}
