// src/server/http/routes/__tests__/rules.test.ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { InMemoryRuleRepository } from 'src/persistence/db/repositories/RuleRepository'
import { handleListRuleVersions, handlePublishRuleVersion } from '../rules.js'
import type { RuleRoutesDeps } from '../rules.js'
import type { AuthContext } from '../../middleware/auth.js'

const AUTH: AuthContext = {
  userId: 'user_001',
  tenantId: 'tenant_001',
  role: 'admin',
}

const REQUEST_ID = 'req_test_001'

function makeDeps(): RuleRoutesDeps {
  return { ruleRepo: new InMemoryRuleRepository() }
}

describe('handleListRuleVersions', () => {
  let deps: RuleRoutesDeps

  beforeEach(() => {
    deps = makeDeps()
  })

  test('returns empty list initially', async () => {
    const res = await handleListRuleVersions(deps, AUTH, 'library', REQUEST_ID)
    expect(res.status).toBe(200)
    const body = await res.json() as { requestId: string; serverTime: string; data: { industryCode: string; versions: unknown[] } }
    expect(body.requestId).toBe(REQUEST_ID)
    expect(body.serverTime).toBeTruthy()
    expect(body.data.industryCode).toBe('library')
    expect(body.data.versions).toEqual([])
  })

  test('returns published versions after publish', async () => {
    // Publish a version first
    await deps.ruleRepo.publish('tenant_001', {
      version: '1.0.0',
      industryCode: 'library',
      rules: [],
    })

    const res = await handleListRuleVersions(deps, AUTH, 'library', REQUEST_ID)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { versions: Array<{ version: string }> } }
    expect(body.data.versions).toHaveLength(1)
    expect(body.data.versions[0]!.version).toBe('1.0.0')
  })
})

describe('handlePublishRuleVersion', () => {
  let deps: RuleRoutesDeps

  beforeEach(() => {
    deps = makeDeps()
  })

  test('publishes a new version and returns 201', async () => {
    const body = {
      dsl: {
        version: '1.0.0',
        industryCode: 'library',
        rules: [],
      },
    }
    const res = await handlePublishRuleVersion(deps, AUTH, 'library', body, REQUEST_ID)
    expect(res.status).toBe(201)
    const resBody = await res.json() as { requestId: string; serverTime: string; data: { version: string; industryCode: string } }
    expect(resBody.requestId).toBe(REQUEST_ID)
    expect(resBody.data.version).toBe('1.0.0')
    expect(resBody.data.industryCode).toBe('library')
  })

  test('GET versions after publish shows the version', async () => {
    const body = {
      dsl: {
        version: '2.0.0',
        industryCode: 'hotel',
        rules: [],
      },
    }
    await handlePublishRuleVersion(deps, AUTH, 'hotel', body, REQUEST_ID)

    const listRes = await handleListRuleVersions(deps, AUTH, 'hotel', REQUEST_ID)
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json() as { data: { versions: Array<{ version: string }> } }
    expect(listBody.data.versions).toHaveLength(1)
    expect(listBody.data.versions[0]!.version).toBe('2.0.0')
  })

  test('returns 400 when dsl is missing', async () => {
    const res = await handlePublishRuleVersion(deps, AUTH, 'library', {}, REQUEST_ID)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string; message: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('dsl')
  })
})
