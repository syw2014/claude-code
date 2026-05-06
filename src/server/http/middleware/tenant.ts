// src/server/http/middleware/tenant.ts
import type { AuthContext } from './auth.js'

export interface TenantContext {
  tenantId: string
  industryCode: string
}

/**
 * Resolves industry code for a tenant.
 * Production: look up from tenant registry / JWT claims.
 * Dev: reads X-Industry-Code header, falls back to 'library'.
 */
export function extractTenant(req: Request, auth: AuthContext): TenantContext {
  const industryCode = req.headers.get('x-industry-code') ?? 'library'
  return { tenantId: auth.tenantId, industryCode }
}
