// src/server/http/createServer.ts
import { extractAuth, unauthorizedResponse } from './middleware/auth.js'
import { extractTenant } from './middleware/tenant.js'
import { checkIdempotency, storeIdempotency } from './middleware/idempotency.js'
import { handleCreateSession, handleGetSession, handleCloseSession } from './routes/sessions.js'
import type { SessionRoutesDeps } from './routes/sessions.js'
import { handleSendMessage } from './routes/messages.js'
import type { MessageRoutesDeps } from './routes/messages.js'
import { handleConfirmDecision } from './routes/confirms.js'
import { createSseResponse } from '../sse/SseEventWriter.js'
import { SseConnectionRegistry } from '../sse/SseConnectionRegistry.js'
import { SessionStateStore } from '../../runtime/state/SessionStateStore.js'
import { InMemoryTaskStateStore } from '../../runtime/state/TaskStateStore.js'
import { InMemorySessionRepository } from '../../persistence/db/repositories/SessionRepository.js'
import { InMemoryTaskRepository } from '../../persistence/db/repositories/TaskRepository.js'
import type { CreateSessionRequest, SendMessageRequest, ConfirmDecisionRequest } from 'src/server/schemas/api'

export interface ServerDeps {
  sessionRoutes: SessionRoutesDeps
  messageRoutes: MessageRoutesDeps
  sseRegistry: SseConnectionRegistry
}

function requestId(): string {
  return crypto.randomUUID()
}

export function createRouter(deps: ServerDeps) {
  return async function router(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method.toUpperCase()
    const reqId = requestId()

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' },
      })
    }

    // Auth (skip for /health)
    if (path === '/health') {
      return Response.json({ status: 'ok', time: new Date().toISOString() }, { status: 200 })
    }

    const auth = extractAuth(req)
    if (!auth) return unauthorizedResponse()

    const tenant = extractTenant(req, auth)

    // Route matching
    const sessionsBase = '/api/v1/sessions'

    // POST /api/v1/sessions
    if (method === 'POST' && path === sessionsBase) {
      let body: unknown
      try { body = await req.json() } catch { return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid JSON', retryable: false } }, { status: 400 }) }
      const idemKey = req.headers.get('idempotency-key')
      const cached = checkIdempotency(auth.tenantId, idemKey)
      if (cached) return Response.json(cached.body, { status: cached.status })
      const res = handleCreateSession(deps.sessionRoutes, auth, tenant, body as CreateSessionRequest, reqId)
      const resBody = await res.json()
      storeIdempotency(auth.tenantId, idemKey, res.status, resBody)
      return Response.json(resBody, { status: res.status })
    }

    // Session-scoped routes: /api/v1/sessions/:sessionId[/...]
    const sessionMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)(\/.*)?$/)
    if (sessionMatch) {
      const sessionId = sessionMatch[1]!
      const subPath = sessionMatch[2] ?? ''

      // GET /api/v1/sessions/:id
      if (method === 'GET' && subPath === '') {
        return handleGetSession(deps.sessionRoutes, auth, sessionId, reqId)
      }

      // DELETE /api/v1/sessions/:id
      if (method === 'DELETE' && subPath === '') {
        return handleCloseSession(deps.sessionRoutes, auth, sessionId, reqId)
      }

      // POST /api/v1/sessions/:id/messages
      if (method === 'POST' && subPath === '/messages') {
        let body: unknown
        try { body = await req.json() } catch { return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid JSON', retryable: false } }, { status: 400 }) }
        const idemKey = req.headers.get('idempotency-key')
        const cached = checkIdempotency(auth.tenantId, idemKey)
        if (cached) return Response.json(cached.body, { status: cached.status })
        const res = await handleSendMessage(deps.messageRoutes, auth, sessionId, body as SendMessageRequest, reqId)
        if (res.ok) {
          const resBody = await res.json()
          storeIdempotency(auth.tenantId, idemKey, res.status, resBody)
          return Response.json(resBody, { status: res.status })
        }
        return res
      }

      // GET /api/v1/sessions/:id/stream (SSE)
      if (method === 'GET' && subPath === '/stream') {
        const { sseRegistry } = deps
        return createSseResponse(sessionId, (controller) => {
          const conn = sseRegistry.register(auth.tenantId, sessionId, controller)
          // Send initial connected event
          const enc = new TextEncoder()
          const initial = JSON.stringify({ type: 'session_ready', traceId: 'init', sequence: 0, sessionId })
          controller.enqueue(enc.encode(`event: session_ready\ndata: ${initial}\nid: 0\n\n`))
          // Cleanup on close is handled by cancel() in ReadableStream
          void conn // ensure conn reference is captured
        })
      }

      // POST /api/v1/sessions/:id/confirm
      if (method === 'POST' && subPath === '/confirm') {
        let body: unknown
        try { body = await req.json() } catch { return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid JSON', retryable: false } }, { status: 400 }) }
        return handleConfirmDecision(auth, sessionId, body as ConfirmDecisionRequest, reqId)
      }
    }

    return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Not found', retryable: false } }, { status: 404 })
  }
}

export function createServerDeps(): ServerDeps {
  const sessionRepo = new InMemorySessionRepository()
  const taskRepo = new InMemoryTaskRepository()
  const sessionStateStore = new SessionStateStore()
  const taskStateStore = new InMemoryTaskStateStore()
  const sseRegistry = new SseConnectionRegistry()

  return {
    sessionRoutes: { sessionRepo, sessionStateStore },
    messageRoutes: { taskRepo, sessionStateStore, taskStateStore },
    sseRegistry,
  }
}
