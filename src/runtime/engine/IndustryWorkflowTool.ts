import type { CheckpointStore } from '../state/CheckpointStore.js'
import type { Workflow } from '@claude-code-best/industry-adapter'
import { WorkflowRunner } from './WorkflowRunner.js'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WorkflowToolInput {
  taskId: string
  tenantId: string
  params: Record<string, unknown>
  resumeFromStep?: number
}

export interface WorkflowToolOutput {
  workflowName: string
  completed: boolean
  stepsCompleted: number
  results: unknown[]
  error?: string
}

// ─── IndustryWorkflowTool ─────────────────────────────────────────────────────

/**
 * Wraps WorkflowRunner as a tool-callable unit.
 * Used by AgentRuntime fast path for industry workflow intents.
 */
export class IndustryWorkflowTool {
  readonly name: string
  readonly description: string

  private runner: WorkflowRunner

  constructor(
    private workflow: Workflow,
    checkpointStore: CheckpointStore,
    toolExecutor: (tool: string, params: Record<string, unknown>) => Promise<unknown>,
  ) {
    this.name = `workflow:${workflow.name}`
    this.description = workflow.description
    this.runner = new WorkflowRunner(checkpointStore, toolExecutor)
  }

  async execute(input: WorkflowToolInput): Promise<WorkflowToolOutput> {
    const result = await this.runner.run({
      taskId: input.taskId,
      tenantId: input.tenantId,
      workflow: this.workflow,
      params: input.params,
      resumeFromStep: input.resumeFromStep,
    })

    return {
      workflowName: this.workflow.name,
      completed: result.completed,
      stepsCompleted: result.stepsCompleted,
      results: result.results,
      error: result.error,
    }
  }
}
