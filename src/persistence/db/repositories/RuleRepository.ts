import type { RuleStore } from 'src/runtime/stores.js'
import type { RuleDSL } from 'src/rules/RuleEngine.js'

export interface StoredRuleVersion {
  id: string            // e.g. "{industryCode}@{version}"
  tenantId: string
  industryCode: string
  version: string
  dsl: RuleDSL
  isActive: boolean
  publishedAt: string   // ISO string
}

export interface RuleRepository extends RuleStore {
  // inherits:
  //   getActiveVersion(tenantId, industryCode): Promise<string>
  //   getRulesByVersion(tenantId, industryCode, version): Promise<unknown>  (returns RuleDSL)

  publish(tenantId: string, dsl: RuleDSL): Promise<StoredRuleVersion>
  // Stores the rule version. Sets isActive=true and deactivates all other versions for this tenant+industry.
  // Sets publishedAt = new Date().toISOString()
  // id = "{industryCode}@{version}"

  listVersions(tenantId: string, industryCode: string): Promise<StoredRuleVersion[]>
  // Returns all versions for tenant+industry, sorted by publishedAt desc

  getVersion(tenantId: string, industryCode: string, version: string): Promise<StoredRuleVersion | null>
  // Returns the specific version or null
}

export class InMemoryRuleRepository implements RuleRepository {
  private store = new Map<string, StoredRuleVersion>()

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`
  }

  async publish(tenantId: string, dsl: RuleDSL): Promise<StoredRuleVersion> {
    const id = `${dsl.industryCode}@${dsl.version}`
    const publishedAt = new Date().toISOString()

    // Deactivate all other versions for this tenant+industry
    for (const [_k, v] of this.store) {
      if (v.tenantId === tenantId && v.industryCode === dsl.industryCode && v.id !== id) {
        v.isActive = false
      }
    }

    // Store the new version as active
    const stored: StoredRuleVersion = {
      id,
      tenantId,
      industryCode: dsl.industryCode,
      version: dsl.version,
      dsl,
      isActive: true,
      publishedAt,
    }
    this.store.set(this.key(tenantId, id), stored)
    return stored
  }

  async getActiveVersion(tenantId: string, industryCode: string): Promise<string> {
    for (const [_k, v] of this.store) {
      if (v.tenantId === tenantId && v.industryCode === industryCode && v.isActive) {
        return v.version
      }
    }
    return '0.0.0'
  }

  async getRulesByVersion(tenantId: string, industryCode: string, version: string): Promise<unknown> {
    const id = `${industryCode}@${version}`
    const stored = this.store.get(this.key(tenantId, id))
    return stored?.dsl ?? null
  }

  async listVersions(tenantId: string, industryCode: string): Promise<StoredRuleVersion[]> {
    const versions: StoredRuleVersion[] = []
    for (const [_k, v] of this.store) {
      if (v.tenantId === tenantId && v.industryCode === industryCode) {
        versions.push(v)
      }
    }
    // Sort by publishedAt desc
    versions.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    return versions
  }

  async getVersion(tenantId: string, industryCode: string, version: string): Promise<StoredRuleVersion | null> {
    const id = `${industryCode}@${version}`
    return this.store.get(this.key(tenantId, id)) ?? null
  }
}
