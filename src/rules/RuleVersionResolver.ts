// src/rules/RuleVersionResolver.ts

import type { RuleSet } from '@claude-code-best/industry-adapter'
import type { RuleStore } from 'src/runtime/stores.js'
import { RuleEngine } from 'src/rules/RuleEngine.js'
import type { RuleDSL } from 'src/rules/RuleEngine.js'

// ─── RuleVersionResolver ──────────────────────────────────────────────────────

export class RuleVersionResolver {
  constructor(private readonly store: RuleStore) {}

  /**
   * Resolves the active rule version, loads the corresponding RuleDSL from
   * the store, and returns a RuleSet (RuleEngine) ready for use.
   */
  async resolve(tenantId: string, industryCode: string): Promise<RuleSet> {
    const version = await this.store.getActiveVersion(tenantId, industryCode)
    const raw = await this.store.getRulesByVersion(tenantId, industryCode, version)
    const dsl = raw as RuleDSL
    return new RuleEngine(dsl)
  }

  /**
   * Returns just the active version string for the given tenant + industry.
   */
  async resolveVersion(tenantId: string, industryCode: string): Promise<string> {
    return this.store.getActiveVersion(tenantId, industryCode)
  }
}
