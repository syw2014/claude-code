// src/server/http/routes/prompts.ts
import type { AuthContext } from '../middleware/auth.js'
import type { PromptRepository, PromptTemplate } from 'src/persistence/db/repositories/PromptRepository.js'

export interface PromptRoutesDeps {
  promptRepo: PromptRepository
}

// GET /api/v1/prompts/:industry/templates
// Response: { requestId, serverTime, data: { industryCode, templates: Array<{id, version}> } }
export async function handleListPromptTemplates(
  deps: PromptRoutesDeps,
  _auth: AuthContext,
  industryCode: string,
  requestId: string
): Promise<Response> {
  const templates = await deps.promptRepo.listTemplates(industryCode)
  return Response.json(
    {
      requestId,
      serverTime: new Date().toISOString(),
      data: { industryCode, templates },
    },
    { status: 200 }
  )
}

// POST /api/v1/prompts/:industry/templates
// Body: { id: string; version: number; content: string; isActive?: boolean }
// Response 201: { requestId, serverTime, data: PromptTemplate }
// Error 400 if body.id or body.content missing
export async function handleUpsertPromptTemplate(
  deps: PromptRoutesDeps,
  _auth: AuthContext,
  industryCode: string,
  body: Record<string, unknown>,
  requestId: string
): Promise<Response> {
  if (!body['id'] || typeof body['id'] !== 'string') {
    return Response.json(
      {
        requestId,
        serverTime: new Date().toISOString(),
        error: { code: 'VALIDATION_ERROR', message: 'Missing required field: id', retryable: false },
      },
      { status: 400 }
    )
  }
  if (!body['content'] || typeof body['content'] !== 'string') {
    return Response.json(
      {
        requestId,
        serverTime: new Date().toISOString(),
        error: { code: 'VALIDATION_ERROR', message: 'Missing required field: content', retryable: false },
      },
      { status: 400 }
    )
  }

  const template: PromptTemplate = await deps.promptRepo.upsert({
    id: body['id'],
    industryCode,
    version: typeof body['version'] === 'number' ? body['version'] : 1,
    content: body['content'],
    isActive: typeof body['isActive'] === 'boolean' ? body['isActive'] : true,
  })

  return Response.json(
    {
      requestId,
      serverTime: new Date().toISOString(),
      data: template,
    },
    { status: 201 }
  )
}
