// src/server/http/routes/rules.ts
import type { AuthContext } from '../middleware/auth.js'
import type { RuleRepository, StoredRuleVersion } from 'src/persistence/db/repositories/RuleRepository.js'
import type { RuleDSL } from 'src/rules/RuleEngine.js'

export interface RuleRoutesDeps {
  ruleRepo: RuleRepository
}

// GET /api/v1/rules/:industry/versions
// Response: { requestId, serverTime, data: { industryCode, versions: StoredRuleVersion[] } }
export async function handleListRuleVersions(
  deps: RuleRoutesDeps,
  auth: AuthContext,
  industryCode: string,
  requestId: string
): Promise<Response> {
  const versions: StoredRuleVersion[] = await deps.ruleRepo.listVersions(auth.tenantId, industryCode)
  return Response.json(
    {
      requestId,
      serverTime: new Date().toISOString(),
      data: { industryCode, versions },
    },
    { status: 200 }
  )
}

// POST /api/v1/rules/:industry/versions
// Body: { dsl: RuleDSL }
// Response 201: { requestId, serverTime, data: StoredRuleVersion }
// Error 400 if body.dsl missing
export async function handlePublishRuleVersion(
  deps: RuleRoutesDeps,
  auth: AuthContext,
  industryCode: string,
  body: Record<string, unknown>,
  requestId: string
): Promise<Response> {
  if (!body['dsl'] || typeof body['dsl'] !== 'object') {
    return Response.json(
      {
        requestId,
        serverTime: new Date().toISOString(),
        error: { code: 'VALIDATION_ERROR', message: 'Missing required field: dsl', retryable: false },
      },
      { status: 400 }
    )
  }

  // Merge route industryCode into DSL
  const dsl: RuleDSL = { ...(body['dsl'] as RuleDSL), industryCode }
  const stored: StoredRuleVersion = await deps.ruleRepo.publish(auth.tenantId, dsl)
  return Response.json(
    {
      requestId,
      serverTime: new Date().toISOString(),
      data: stored,
    },
    { status: 201 }
  )
}
