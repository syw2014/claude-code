// src/server/http/middleware/auth.ts

export interface AuthContext {
  userId: string
  tenantId: string
  role: string
}

/**
 * Extracts auth context from request headers.
 * Production: validate JWT and extract claims.
 * Dev: reads X-User-Id / X-Tenant-Id / X-User-Role headers directly.
 */
export function extractAuth(req: Request): AuthContext | null {
  const userId = req.headers.get('x-user-id')
  const tenantId = req.headers.get('x-tenant-id')
  const role = req.headers.get('x-user-role') ?? 'user'
  if (!userId || !tenantId) return null
  return { userId, tenantId, role }
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { error: { code: 'UNAUTHORIZED', message: 'Missing auth headers', retryable: false } },
    { status: 401 }
  )
}
