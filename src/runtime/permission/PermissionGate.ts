// src/runtime/permission/PermissionGate.ts
import type { UUID, ConfirmRequest, ConfirmStatus } from '../types.js'
import type { PermissionLevel, ConfirmLevel, ApproverRole, RuleCheckResult } from '@claude-code-best/industry-adapter'
import type { SessionContext } from '../context/SessionContext.js'

export type PermissionDecision =
  | { verdict: 'allow' }
  | { verdict: 'silent_confirm' }
  | { verdict: 'require_human'; confirmRequest: ConfirmRequest }
  | { verdict: 'block'; reason: string }

export interface PermissionGateInput {
  ctx: SessionContext
  operation: string
  permissionLevel: PermissionLevel
  ruleResult: RuleCheckResult
}

/**
 * Three-level permission gate.
 * Level 1: auto — allow if PASS + low risk
 * Level 2: silent_confirm — log and continue
 * Level 3: explicit_confirm / supervisor_approval — suspend and wait for human
 */
export function checkPermission(input: PermissionGateInput): PermissionDecision {
  const { ruleResult, operation, ctx } = input

  if (ruleResult.result === 'BLOCKED') {
    return { verdict: 'block', reason: ruleResult.matchedRules.map(r => r.reason).join('; ') }
  }

  const confirmLevel = ruleResult.requiredConfirmLevel

  if (confirmLevel === 'auto') {
    return { verdict: 'allow' }
  }

  if (confirmLevel === 'silent_confirm') {
    return { verdict: 'silent_confirm' }
  }

  // explicit_confirm or supervisor_approval → build ConfirmRequest
  const confirmRequest: ConfirmRequest = {
    id: crypto.randomUUID(),
    sessionId: ctx.sessionId,
    taskId: ctx.taskId ?? ctx.sessionId,
    traceId: ctx.traceId,
    operation,
    confirmLevel,
    requiredApproverRole: ruleResult.requiredApproverRole ?? 'user',
    bizRefs: ctx.envelope.bizRefs,
    factSet: ctx.envelope.factSet,
    ruleWarnings: ruleResult.warnings,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
  }

  return { verdict: 'require_human', confirmRequest }
}
