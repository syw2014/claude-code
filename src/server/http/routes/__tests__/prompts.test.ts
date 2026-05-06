// src/server/http/routes/__tests__/prompts.test.ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { InMemoryPromptRepository } from 'src/persistence/db/repositories/PromptRepository'
import { handleListPromptTemplates, handleUpsertPromptTemplate } from '../prompts.js'
import type { PromptRoutesDeps } from '../prompts.js'
import type { AuthContext } from '../../middleware/auth.js'

const AUTH: AuthContext = {
  userId: 'user_001',
  tenantId: 'tenant_001',
  role: 'admin',
}

const REQUEST_ID = 'req_test_002'

function makeDeps(): PromptRoutesDeps {
  return { promptRepo: new InMemoryPromptRepository() }
}

describe('handleListPromptTemplates', () => {
  let deps: PromptRoutesDeps

  beforeEach(() => {
    deps = makeDeps()
  })

  test('returns empty list initially', async () => {
    const res = await handleListPromptTemplates(deps, AUTH, 'library', REQUEST_ID)
    expect(res.status).toBe(200)
    const body = await res.json() as { requestId: string; serverTime: string; data: { industryCode: string; templates: unknown[] } }
    expect(body.requestId).toBe(REQUEST_ID)
    expect(body.serverTime).toBeTruthy()
    expect(body.data.industryCode).toBe('library')
    expect(body.data.templates).toEqual([])
  })

  test('returns templates after upsert', async () => {
    await deps.promptRepo.upsert({
      id: 'tmpl_001',
      industryCode: 'library',
      version: 1,
      content: '# Library Template',
      isActive: true,
    })

    const res = await handleListPromptTemplates(deps, AUTH, 'library', REQUEST_ID)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { templates: Array<{ id: string; version: number }> } }
    expect(body.data.templates).toHaveLength(1)
    expect(body.data.templates[0]!.id).toBe('tmpl_001')
    expect(body.data.templates[0]!.version).toBe(1)
  })
})

describe('handleUpsertPromptTemplate', () => {
  let deps: PromptRoutesDeps

  beforeEach(() => {
    deps = makeDeps()
  })

  test('upserts a template and returns 201', async () => {
    const body = {
      id: 'tmpl_hotel_001',
      version: 1,
      content: '# Hotel Booking Template',
      isActive: true,
    }
    const res = await handleUpsertPromptTemplate(deps, AUTH, 'hotel', body, REQUEST_ID)
    expect(res.status).toBe(201)
    const resBody = await res.json() as { requestId: string; serverTime: string; data: { id: string; industryCode: string; content: string } }
    expect(resBody.requestId).toBe(REQUEST_ID)
    expect(resBody.data.id).toBe('tmpl_hotel_001')
    expect(resBody.data.industryCode).toBe('hotel')
    expect(resBody.data.content).toBe('# Hotel Booking Template')
  })

  test('GET templates after upsert shows the template', async () => {
    const body = {
      id: 'tmpl_restaurant_001',
      version: 2,
      content: '# Restaurant Reservation',
      isActive: true,
    }
    await handleUpsertPromptTemplate(deps, AUTH, 'restaurant', body, REQUEST_ID)

    const listRes = await handleListPromptTemplates(deps, AUTH, 'restaurant', REQUEST_ID)
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json() as { data: { templates: Array<{ id: string; version: number }> } }
    expect(listBody.data.templates).toHaveLength(1)
    expect(listBody.data.templates[0]!.id).toBe('tmpl_restaurant_001')
    expect(listBody.data.templates[0]!.version).toBe(2)
  })

  test('returns 400 when id is missing', async () => {
    const res = await handleUpsertPromptTemplate(deps, AUTH, 'library', { content: 'some content' }, REQUEST_ID)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string; message: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('id')
  })

  test('returns 400 when content is missing', async () => {
    const res = await handleUpsertPromptTemplate(deps, AUTH, 'library', { id: 'tmpl_001' }, REQUEST_ID)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string; message: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('content')
  })
})
