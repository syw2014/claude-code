// src/rules/RuleEngine.ts

import type {
  RuleCheckInput,
  RuleCheckResult,
  RuleSet,
  MatchedRule,
  ConfirmLevel,
  ApproverRole,
} from '@claude-code-best/industry-adapter'
import { RuleEvaluator } from 'src/rules/RuleEvaluator.js'
import type { RuleDef } from 'src/rules/RuleEvaluator.js'

// ─── ConfirmLevel ordering ────────────────────────────────────────────────────

const CONFIRM_LEVEL_ORDER: ConfirmLevel[] = [
  'auto',
  'silent_confirm',
  'explicit_confirm',
  'supervisor_approval',
]

function confirmLevelIndex(level: ConfirmLevel): number {
  return CONFIRM_LEVEL_ORDER.indexOf(level)
}

function higherConfirmLevel(a: ConfirmLevel, b: ConfirmLevel): ConfirmLevel {
  return confirmLevelIndex(a) >= confirmLevelIndex(b) ? a : b
}

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_ORDER: Array<'info' | 'warn' | 'block'> = ['info', 'warn', 'block']

function severityIndex(s: 'info' | 'warn' | 'block'): number {
  return SEVERITY_ORDER.indexOf(s)
}

// ─── RuleDSL ──────────────────────────────────────────────────────────────────

export interface RuleDSL {
  version: string
  industryCode: string
  rules: RuleDef[]
}

// ─── RuleEngine ───────────────────────────────────────────────────────────────

export class RuleEngine implements RuleSet {
  private readonly evaluator: RuleEvaluator = new RuleEvaluator()

  constructor(private readonly dsl: RuleDSL) {}

  get version(): string {
    return this.dsl.version
  }

  check(input: RuleCheckInput): RuleCheckResult {
    const matchedRules: MatchedRule[] = []

    for (const rule of this.dsl.rules) {
      if (this.evaluator.evaluate(rule, input)) {
        matchedRules.push({
          ruleId: rule.ruleId,
          severity: rule.severity,
          reason: rule.description,
        })
      }
    }

    // Determine overall result
    let result: 'PASS' | 'WARN' | 'BLOCKED' = 'PASS'
    for (const mr of matchedRules) {
      if (mr.severity === 'block') {
        result = 'BLOCKED'
        break
      }
      if (mr.severity === 'warn') {
        result = 'WARN'
      }
    }

    // requiredConfirmLevel: highest among matched rules
    let requiredConfirmLevel: ConfirmLevel = 'auto'
    for (const matched of matchedRules) {
      const rule = this.dsl.rules.find(r => r.ruleId === matched.ruleId)
      if (rule) {
        requiredConfirmLevel = higherConfirmLevel(requiredConfirmLevel, rule.confirmLevel)
      }
    }

    // requiredApproverRole: from the highest-severity matched rule that has one
    let requiredApproverRole: ApproverRole | undefined = undefined
    const sortedByServerity = [...matchedRules].sort(
      (a, b) => severityIndex(b.severity) - severityIndex(a.severity)
    )
    for (const mr of sortedByServerity) {
      const rule = this.dsl.rules.find(r => r.ruleId === mr.ruleId)
      if (rule?.approverRole !== undefined) {
        requiredApproverRole = rule.approverRole
        break
      }
    }

    // warnings: reasons from severity='warn' rules
    const warnings = matchedRules
      .filter(mr => mr.severity === 'warn')
      .map(mr => mr.reason)

    return {
      result,
      ruleVersion: this.dsl.version,
      matchedRules,
      warnings,
      requiredConfirmLevel,
      requiredApproverRole,
    }
  }
}
