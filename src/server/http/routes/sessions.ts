// src/server/http/routes/sessions.ts
import type { InMemorySessionRepository } from 'src/persistence/db/repositories/SessionRepository'
import type { SessionStateStore } from 'src/runtime/state/SessionStateStore'
import type { CreateSessionRequest } from 'src/server/schemas/api'
import type { AuthContext } from '../middleware/auth.js'
import type { TenantContext } from '../middleware/tenant.js'

export interface SessionRoutesDeps {
  sessionRepo: InMemorySessionRepository
  sessionStateStore: SessionStateStore
}

export function handleCreateSession(
  deps: SessionRoutesDeps,
  auth: AuthContext,
  _tenant: TenantContext,
  body: CreateSessionRequest,
  requestId: string
): Response {
  const { sessionRepo, sessionStateStore } = deps

  // async fire-and-forget: create session record
  sessionRepo.create({
    tenantId: auth.tenantId,
    userId: auth.userId,
    industryCode: body.industryCode,
    status: 'created',
    permissionMode: body.permissionMode ?? 'default',
    modelOverride: body.modelOverride ?? null,
    currentTraceId: null,
    metadata: body.metadata ?? {},
  }).then(session => {
    sessionStateStore.set(auth.tenantId, session.id, {
      sessionId: session.id,
      tenantId: auth.tenantId,
      userId: auth.userId,
      industryCode: body.industryCode,
      status: 'created',
      updatedAt: session.createdAt,
    })
  })

  const sessionId = crypto.randomUUID()
  const data = {
    sessionId,
    status: 'created' as const,
    industryCode: body.industryCode,
    streamUrl: `/api/v1/sessions/${sessionId}/stream`,
    createdAt: new Date().toISOString(),
  }

  return Response.json(
    { requestId, serverTime: new Date().toISOString(), data },
    { status: 202 }
  )
}

export async function handleGetSession(
  deps: SessionRoutesDeps,
  auth: AuthContext,
  sessionId: string,
  requestId: string
): Promise<Response> {
  const state = await deps.sessionStateStore.get(auth.tenantId, sessionId)
  if (!state) {
    return Response.json(
      { requestId, serverTime: new Date().toISOString(), error: { code: 'SESSION_NOT_FOUND', message: 'Session not found', retryable: false } },
      { status: 404 }
    )
  }
  return Response.json(
    { requestId, serverTime: new Date().toISOString(), data: state },
    { status: 200 }
  )
}

export async function handleCloseSession(
  deps: SessionRoutesDeps,
  auth: AuthContext,
  sessionId: string,
  requestId: string
): Promise<Response> {
  const state = await deps.sessionStateStore.get(auth.tenantId, sessionId)
  if (!state) {
    return Response.json(
      { requestId, serverTime: new Date().toISOString(), error: { code: 'SESSION_NOT_FOUND', message: 'Session not found', retryable: false } },
      { status: 404 }
    )
  }
  await deps.sessionStateStore.set(auth.tenantId, sessionId, { ...state, status: 'closed', updatedAt: new Date().toISOString() })
  return Response.json(
    { requestId, serverTime: new Date().toISOString(), data: { sessionId, status: 'closed', closedAt: new Date().toISOString() } },
    { status: 200 }
  )
}
