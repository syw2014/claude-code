import type { SessionContext } from '../context/SessionContext.js'
import type { UUID } from '../types.js'
import type { Workflow } from '@claude-code-best/industry-adapter'
import { createEnvelope } from '../context/ContextEnvelope.js'
import { WorkflowRunner } from './WorkflowRunner.js'
import { InMemoryCheckpointStore } from '../state/CheckpointStore.js'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SubAgentConfig {
  /** Human-readable purpose, written to audit trail */
  purpose: string
  /** Optional workflow to execute (WorkflowRunner). If omitted, sub-agent is a stub. */
  workflow?: Workflow
  /** Initial params passed to WorkflowRunner (or to toolExecutor) */
  initialParams: Record<string, unknown>
  /** Max workflow steps budget (default: 20) */
  maxSteps?: number
}

export interface SubAgentResult {
  subAgentTaskId: UUID
  status: 'succeeded' | 'failed' | 'timeout'
  output?: unknown
  tokensUsed: number
  stepsCompleted: number
}

// ─── SubAgentSpawner ──────────────────────────────────────────────────────────

export class SubAgentSpawner {
  constructor(private parentCtx: SessionContext) {}

  /**
   * Spawns a sub-agent that inherits the parent's traceId and tenant context,
   * but gets a fresh taskId and sessionId. All audit events share the same traceId,
   * making the full execution chain queryable in one audit trace.
   */
  async spawn(config: SubAgentConfig): Promise<SubAgentResult> {
    const { purpose, workflow, initialParams, maxSteps = 20 } = config
    const { parentCtx } = this

    // 1. Generate fresh child IDs while keeping the same traceId
    const childSessionId = crypto.randomUUID() as UUID
    const childTaskId = crypto.randomUUID() as UUID

    // 2. Build child context — inherits everything from parent, fresh sessionId/taskId/envelope
    const childEnvelope = createEnvelope({
      sessionId: childSessionId,
      traceId: parentCtx.traceId,   // same trace — critical for audit grouping
      taskId: childTaskId,
      tenantId: parentCtx.tenantId,
      userId: parentCtx.userId,
      industryCode: parentCtx.industryCode,
      turnId: crypto.randomUUID() as UUID,
    })

    // 3. Emit audit event before running
    await parentCtx.auditWriter.record({
      eventType: 'subagent_spawned',
      severity: 'info',
      traceId: parentCtx.traceId,   // same trace
      sessionId: childSessionId,
      taskId: childTaskId,
      tenantId: parentCtx.tenantId,
      userId: parentCtx.userId,
      industryCode: parentCtx.industryCode,
      payload: {
        purpose,
        parentTaskId: parentCtx.taskId,
        workflow: workflow?.name,
      },
    })

    // 4. No workflow — return immediately
    if (!workflow) {
      return {
        subAgentTaskId: childTaskId,
        status: 'succeeded',
        tokensUsed: 0,
        stepsCompleted: 0,
      }
    }

    // 5. Execute workflow with maxSteps guard
    const checkpointStore = new InMemoryCheckpointStore()

    // Stub toolExecutor — simulates tool execution for now
    const toolExecutor = async (
      _toolName: string,
      _params: Record<string, unknown>
    ): Promise<unknown> => {
      return { success: true }
    }

    const runner = new WorkflowRunner(checkpointStore, toolExecutor)

    // Slice steps to maxSteps budget; if the workflow has more, we'll report timeout after.
    const totalSteps = workflow.steps.length
    const exceedsMaxSteps = totalSteps > maxSteps
    const limitedWorkflow: Workflow = exceedsMaxSteps
      ? { ...workflow, steps: workflow.steps.slice(0, maxSteps) }
      : workflow

    try {
      const runResult = await runner.run({
        taskId: childTaskId,
        tenantId: parentCtx.tenantId,
        workflow: limitedWorkflow,
        params: initialParams,
        envelope: childEnvelope,
      })

      const stepsCompleted = runResult.stepsCompleted

      // If we sliced the workflow due to maxSteps, treat as timeout
      if (exceedsMaxSteps) {
        return {
          subAgentTaskId: childTaskId,
          status: 'timeout',
          tokensUsed: 0,
          stepsCompleted,
        }
      }

      if (!runResult.completed) {
        return {
          subAgentTaskId: childTaskId,
          status: 'failed',
          output: runResult.error,
          tokensUsed: 0,
          stepsCompleted,
        }
      }

      return {
        subAgentTaskId: childTaskId,
        status: 'succeeded',
        output: runResult.results,
        tokensUsed: 0,
        stepsCompleted,
      }
    } catch (err) {
      return {
        subAgentTaskId: childTaskId,
        status: 'failed',
        output: err instanceof Error ? err.message : String(err),
        tokensUsed: 0,
        stepsCompleted: 0,
      }
    }
  }
}
