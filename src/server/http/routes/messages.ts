// src/server/http/routes/messages.ts
import type { InMemoryTaskRepository } from 'src/persistence/db/repositories/TaskRepository'
import type { SessionStateStore } from 'src/runtime/state/SessionStateStore'
import type { InMemoryTaskStateStore } from 'src/runtime/state/TaskStateStore'
import type { SendMessageRequest } from 'src/server/schemas/api'
import type { AuthContext } from '../middleware/auth.js'

export interface MessageRoutesDeps {
  taskRepo: InMemoryTaskRepository
  sessionStateStore: SessionStateStore
  taskStateStore: InMemoryTaskStateStore
}

export async function handleSendMessage(
  deps: MessageRoutesDeps,
  auth: AuthContext,
  sessionId: string,
  body: SendMessageRequest,
  requestId: string
): Promise<Response> {
  // Verify session exists
  const sessionState = await deps.sessionStateStore.get(auth.tenantId, sessionId)
  if (!sessionState) {
    return Response.json(
      { requestId, serverTime: new Date().toISOString(), error: { code: 'SESSION_NOT_FOUND', message: 'Session not found', retryable: false } },
      { status: 404 }
    )
  }

  const traceId = crypto.randomUUID()
  const mode = (body.mode === 'auto' || !body.mode) ? 'fast' : body.mode

  // Create task record
  const task = await deps.taskRepo.create({
    sessionId,
    traceId,
    tenantId: auth.tenantId,
    userId: auth.userId,
    industryCode: sessionState.industryCode,
    parentTaskId: null,
    inputText: body.input,
    mode,
    status: 'queued',
    envelope: {},
    idempotencyKey: body.clientMessageId ?? null,
    startedAt: null,
    completedAt: null,
  })

  // Mirror to task state store
  await deps.taskStateStore.set(auth.tenantId, {
    id: task.id,
    sessionId,
    traceId,
    tenantId: auth.tenantId,
    userId: auth.userId,
    industryCode: sessionState.industryCode,
    input: body.input,
    mode,
    status: 'queued',
  })

  const data = {
    taskId: task.id,
    sessionId,
    status: 'queued' as const,
    mode,
    streamUrl: `/api/v1/sessions/${sessionId}/stream`,
  }

  return Response.json(
    { requestId, serverTime: new Date().toISOString(), data },
    { status: 202 }
  )
}
