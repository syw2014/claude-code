// packages/industry-adapter/src/rules/RuleEvaluator.ts

import type { ConfirmLevel, ApproverRole, RuleCheckInput } from '../types.js'

// ─── RuleDef ──────────────────────────────────────────────────────────────────

export interface RuleDef {
  ruleId: string
  description: string
  severity: 'info' | 'warn' | 'block'
  confirmLevel: ConfirmLevel
  approverRole?: ApproverRole
  conditions: Array<{
    field: string
    op: '==' | '!=' | 'in' | 'not_in' | 'exists' | 'not_exists'
    value?: unknown
  }>
}

// ─── Dot-path getter ──────────────────────────────────────────────────────────

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ─── Condition evaluator ──────────────────────────────────────────────────────

function evaluateCondition(
  input: RuleCheckInput,
  condition: RuleDef['conditions'][number]
): boolean {
  const actual = getByPath(input, condition.field)

  switch (condition.op) {
    case 'exists':
      return actual !== undefined
    case 'not_exists':
      return actual === undefined
    case '==':
      return actual === condition.value
    case '!=':
      return actual !== condition.value
    case 'in':
      if (!Array.isArray(condition.value)) return false
      return condition.value.includes(actual)
    case 'not_in':
      if (!Array.isArray(condition.value)) return true
      return !condition.value.includes(actual)
    default:
      return false
  }
}

/**
 * Returns true when ALL conditions in the rule match the given input.
 */
export function evaluateConditions(
  input: RuleCheckInput,
  conditions: RuleDef['conditions']
): boolean {
  return conditions.every(c => evaluateCondition(input, c))
}
