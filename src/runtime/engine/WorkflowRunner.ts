import type { Workflow } from '@claude-code-best/industry-adapter'
import type { CheckpointStore } from '../state/CheckpointStore.js'
import type { ContextEnvelope } from '../context/ContextEnvelope.js'
import { createEnvelope } from '../context/ContextEnvelope.js'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WorkflowRunInput {
  /** Used as the checkpoint key */
  taskId: string
  tenantId: string
  workflow: Workflow
  /** Fills {{placeholder}} values in step params */
  params: Record<string, unknown>
  /** Optional: resume from this step index (0-based) */
  resumeFromStep?: number
  /** Optional base envelope — if absent a minimal one is synthesised */
  envelope?: ContextEnvelope
}

export interface WorkflowStepResult {
  stepId: string
  tool: string
  output: unknown
  durationMs: number
}

export interface WorkflowRunResult {
  completed: boolean
  stepsCompleted: number
  results: WorkflowStepResult[]
  error?: string
}

// ─── Placeholder interpolation ────────────────────────────────────────────────

function interpolateParams(
  params: Record<string, unknown>,
  values: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') {
      out[k] = v.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        const replacement = values[key]
        return replacement !== undefined ? String(replacement) : `{{${key}}}`
      })
    } else {
      out[k] = v
    }
  }
  return out
}

// ─── WorkflowRunner ───────────────────────────────────────────────────────────

export class WorkflowRunner {
  constructor(
    private checkpointStore: CheckpointStore,
    private toolExecutor: (
      toolName: string,
      params: Record<string, unknown>
    ) => Promise<unknown>
  ) {}

  async run(input: WorkflowRunInput): Promise<WorkflowRunResult> {
    const { taskId, tenantId, workflow, params, resumeFromStep = 0 } = input

    const startIndex = Math.max(0, resumeFromStep)
    const results: WorkflowStepResult[] = []
    let stepsCompleted = 0

    // Build or reuse the base envelope for checkpointing
    const baseEnvelope: ContextEnvelope = input.envelope ?? createEnvelope({
      sessionId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      tenantId,
      userId: '',
      industryCode: 'library',
      turnId: crypto.randomUUID(),
      taskId,
    })

    for (let idx = startIndex; idx < workflow.steps.length; idx++) {
      const step = workflow.steps[idx]!
      const interpolated = interpolateParams(step.params, params)

      const t0 = Date.now()
      let output: unknown
      let stepError: string | undefined

      try {
        output = await this.toolExecutor(step.tool, interpolated)
      } catch (err) {
        stepError = err instanceof Error ? err.message : String(err)
      }

      const durationMs = Date.now() - t0

      if (stepError !== undefined) {
        const onError = step.onError ?? 'abort'

        if (onError === 'abort') {
          // Save checkpoint marking current step before aborting
          await this.saveCheckpoint(baseEnvelope, tenantId, taskId, idx)
          return {
            completed: false,
            stepsCompleted,
            results,
            error: `Step '${step.id}' (${step.tool}) failed: ${stepError}`,
          }
        }

        if (onError === 'retry') {
          // Retry once
          const t1 = Date.now()
          try {
            output = await this.toolExecutor(step.tool, interpolated)
            stepError = undefined
          } catch (retryErr) {
            const retryError = retryErr instanceof Error ? retryErr.message : String(retryErr)
            await this.saveCheckpoint(baseEnvelope, tenantId, taskId, idx)
            return {
              completed: false,
              stepsCompleted,
              results,
              error: `Step '${step.id}' (${step.tool}) failed after retry: ${retryError}`,
            }
          }
          const retryDuration = Date.now() - t1
          results.push({ stepId: step.id, tool: step.tool, output, durationMs: retryDuration })
          stepsCompleted++
          await this.saveCheckpoint(baseEnvelope, tenantId, taskId, idx + 1)
          continue
        }

        // onError: 'continue' — log and proceed
        results.push({
          stepId: step.id,
          tool: step.tool,
          output: { error: stepError },
          durationMs,
        })
        stepsCompleted++
        await this.saveCheckpoint(baseEnvelope, tenantId, taskId, idx + 1)
        continue
      }

      results.push({ stepId: step.id, tool: step.tool, output, durationMs })
      stepsCompleted++
      await this.saveCheckpoint(baseEnvelope, tenantId, taskId, idx + 1)
    }

    return { completed: true, stepsCompleted, results }
  }

  private async saveCheckpoint(
    baseEnvelope: ContextEnvelope,
    tenantId: string,
    taskId: string,
    currentStepIndex: number
  ): Promise<void> {
    const now = new Date().toISOString()
    const envelope: ContextEnvelope = {
      ...baseEnvelope,
      planState: {
        planId: taskId,
        steps: [],
        currentStepIndex,
        createdAt: baseEnvelope.planState?.createdAt ?? now,
        updatedAt: now,
      },
      updatedAt: now,
    }
    await this.checkpointStore.save(tenantId, taskId, envelope)
  }
}
