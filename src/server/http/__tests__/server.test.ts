// src/server/http/__tests__/server.test.ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { createRouter, createServerDeps } from 'src/server/http/createServer'

function makeRequest(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Request {
  const url = `http://localhost:4000${path}`
  const headers: Record<string, string> = {
    'x-user-id': 'user_001',
    'x-tenant-id': 'tenant_001',
    'x-user-role': 'librarian',
    'x-industry-code': 'library',
    'content-type': 'application/json',
    ...extraHeaders,
  }
  return new Request(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

describe('Industry Runtime HTTP Server', () => {
  let router: (req: Request) => Promise<Response>

  beforeEach(() => {
    const deps = createServerDeps()
    router = createRouter(deps)
  })

  test('GET /health → 200', async () => {
    const res = await router(makeRequest('GET', '/health'))
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('ok')
  })

  test('缺少 auth headers → 401', async () => {
    const res = await router(new Request('http://localhost:4000/api/v1/sessions', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  test('POST /api/v1/sessions → 202', async () => {
    const res = await router(makeRequest('POST', '/api/v1/sessions', {
      tenantId: 'tenant_001',
      userId: 'user_001',
      industryCode: 'library',
    }))
    expect(res.status).toBe(202)
    const body = await res.json() as { data: { sessionId: string; status: string } }
    expect(body.data.sessionId).toBeTruthy()
    expect(body.data.status).toBe('created')
  })

  test('POST /api/v1/sessions/:id/messages（session 不存在）→ 404', async () => {
    const res = await router(makeRequest('POST', '/api/v1/sessions/nonexistent/messages', { input: '扫码借书' }))
    expect(res.status).toBe(404)
  })

  test('GET /api/v1/sessions/:id/stream → SSE 头正确', async () => {
    const res = await router(makeRequest('GET', '/api/v1/sessions/sess_001/stream'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('x-session-id')).toBe('sess_001')
  })

  test('POST /api/v1/sessions/:id/confirm → 200', async () => {
    const res = await router(makeRequest('POST', '/api/v1/sessions/sess_001/confirm', {
      confirmId: 'confirm_001',
      decision: 'approve',
      confirmedBy: 'librarian_001',
      confirmedRole: 'librarian',
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { status: string } }
    expect(body.data.status).toBe('approved')
  })

  test('幂等请求返回相同结果', async () => {
    const req1 = makeRequest('POST', '/api/v1/sessions', { tenantId: 'tenant_001', userId: 'user_001', industryCode: 'library' }, { 'idempotency-key': 'test-idem-001' })
    const req2 = makeRequest('POST', '/api/v1/sessions', { tenantId: 'tenant_001', userId: 'user_001', industryCode: 'library' }, { 'idempotency-key': 'test-idem-001' })
    const res1 = await router(req1)
    const body1 = await res1.json()
    const res2 = await router(req2)
    const body2 = await res2.json()
    expect(JSON.stringify(body1)).toBe(JSON.stringify(body2))
  })
})
