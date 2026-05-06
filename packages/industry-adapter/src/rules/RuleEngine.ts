// packages/industry-adapter/src/rules/RuleEngine.ts

import type {
  ConfirmLevel,
  ApproverRole,
  RuleCheckInput,
  RuleCheckResult,
  MatchedRule,
  RuleSet,
} from '../types.js'
import { type RuleDef, evaluateConditions } from './RuleEvaluator.js'

// ─── RuleDSL ──────────────────────────────────────────────────────────────────

export interface RuleDSL {
  version: string
  industryCode: string
  rules: RuleDef[]
}

// ─── Confirm level ordering (higher index = more restrictive) ─────────────────

const CONFIRM_LEVEL_ORDER: ConfirmLevel[] = [
  'auto',
  'silent_confirm',
  'explicit_confirm',
  'supervisor_approval',
]

function mostRestrictiveConfirmLevel(levels: ConfirmLevel[]): ConfirmLevel {
  if (levels.length === 0) return 'auto'
  let maxIndex = 0
  for (const level of levels) {
    const idx = CONFIRM_LEVEL_ORDER.indexOf(level)
    if (idx > maxIndex) maxIndex = idx
  }
  return CONFIRM_LEVEL_ORDER[maxIndex]!
}

// ─── RuleEngine ───────────────────────────────────────────────────────────────

export class RuleEngine implements RuleSet {
  readonly version: string
  private readonly rules: RuleDef[]

  constructor(dsl: RuleDSL) {
    this.version = dsl.version
    this.rules = dsl.rules
  }

  check(input: RuleCheckInput): RuleCheckResult {
    const matchedRules: MatchedRule[] = []

    for (const rule of this.rules) {
      if (evaluateConditions(input, rule.conditions)) {
        matchedRules.push({
          ruleId: rule.ruleId,
          severity: rule.severity,
          reason: rule.description,
        })
      }
    }

    // Determine overall result
    const hasBlock = matchedRules.some(r => r.severity === 'block')
    const hasWarn = matchedRules.some(r => r.severity === 'warn')

    let result: 'PASS' | 'WARN' | 'BLOCKED'
    if (hasBlock) {
      result = 'BLOCKED'
    } else if (hasWarn) {
      result = 'WARN'
    } else {
      result = 'PASS'
    }

    // Most restrictive confirm level
    const matchedRuleDefs = this.rules.filter(r =>
      matchedRules.some(m => m.ruleId === r.ruleId)
    )
    const requiredConfirmLevel = mostRestrictiveConfirmLevel(
      matchedRuleDefs.map(r => r.confirmLevel)
    )

    // Approver role: prefer block rule's role, then first warn rule's role
    let requiredApproverRole: ApproverRole | undefined
    const blockingDef = matchedRuleDefs.find(r => r.severity === 'block')
    if (blockingDef?.approverRole) {
      requiredApproverRole = blockingDef.approverRole
    } else {
      const warnDef = matchedRuleDefs.find(r => r.severity === 'warn')
      if (warnDef?.approverRole) {
        requiredApproverRole = warnDef.approverRole
      }
    }

    return {
      result,
      ruleVersion: this.version,
      matchedRules,
      warnings: matchedRules
        .filter(r => r.severity === 'warn')
        .map(r => r.reason),
      requiredConfirmLevel,
      requiredApproverRole,
    }
  }
}
