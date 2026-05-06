// src/rules/RuleEvaluator.ts

import type { RuleCheckInput, ConfirmLevel, ApproverRole } from '@claude-code-best/industry-adapter'

// ─── RuleDef ─────────────────────────────────────────────────────────────────

export interface ConditionDef {
  field: string
  op: '==' | '!=' | 'in' | 'not_in' | 'exists' | 'not_exists'
  value?: unknown
}

export interface RuleDef {
  ruleId: string
  description: string
  severity: 'info' | 'warn' | 'block'
  confirmLevel: ConfirmLevel
  approverRole?: ApproverRole
  conditions: ConditionDef[]
}

// ─── Field resolver ───────────────────────────────────────────────────────────

/**
 * Resolve a dot-path into `input`. Returns `undefined` if any segment is missing.
 * e.g. "bizRefs.book.status" → input.bizRefs?.['book']?.['status']
 */
function resolvePath(obj: unknown, path: string): unknown {
  const segments = path.split('.')
  let current: unknown = obj
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined
    current = (current as Record<string, unknown>)[seg]
  }
  return current
}

// ─── RuleEvaluator ───────────────────────────────────────────────────────────

export class RuleEvaluator {
  /**
   * Returns true if ALL conditions of the rule match against `input`.
   */
  evaluate(rule: RuleDef, input: RuleCheckInput): boolean {
    for (const condition of rule.conditions) {
      const fieldValue = resolvePath(input, condition.field)

      switch (condition.op) {
        case 'exists':
          if (fieldValue === null || fieldValue === undefined) return false
          break

        case 'not_exists':
          if (fieldValue !== null && fieldValue !== undefined) return false
          break

        case '==':
          if (fieldValue !== condition.value) return false
          break

        case '!=':
          if (fieldValue === condition.value) return false
          break

        case 'in': {
          const list = condition.value
          if (!Array.isArray(list)) return false
          if (!list.includes(fieldValue)) return false
          break
        }

        case 'not_in': {
          const list = condition.value
          if (!Array.isArray(list)) return false
          if (list.includes(fieldValue)) return false
          break
        }

        default:
          // Unknown operator — treat as non-matching
          return false
      }
    }
    return true
  }
}
