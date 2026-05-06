import { describe, test, expect, mock } from 'bun:test'
import { WorkflowRunner } from '../WorkflowRunner.js'
import { InMemoryCheckpointStore } from '../../state/CheckpointStore.js'
import type { Workflow } from '@claude-code-best/industry-adapter'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWorkflow(steps: Workflow['steps']): Workflow {
  return {
    name: 'test-workflow',
    description: 'Test workflow',
    industry: 'library',
    steps,
  }
}

function makeCheckoutWorkflow(): Workflow {
  return makeWorkflow([
    {
      id: 'query_reader_step',
      tool: 'query_reader',
      params: { readerId: '{{readerId}}' },
      onError: 'abort',
    },
    {
      id: 'checkout_step',
      tool: 'checkout_book',
      params: { bookId: '{{bookId}}', readerId: '{{readerId}}' },
      onError: 'abort',
    },
  ])
}

// ─── run() — happy path ───────────────────────────────────────────────────────

describe('WorkflowRunner.run()', () => {
  test('completes all steps and returns completed=true', async () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async (_tool: string, _params: Record<string, unknown>) => ({
      success: true,
    }))
    const runner = new WorkflowRunner(store, executor)

    const result = await runner.run({
      taskId: 'task-1',
      tenantId: 'tenant-lib',
      workflow: makeCheckoutWorkflow(),
      params: { readerId: 'R001', bookId: 'B001' },
    })

    expect(result.completed).toBe(true)
    expect(result.stepsCompleted).toBe(2)
    expect(result.results).toHaveLength(2)
    expect(result.error).toBeUndefined()
  })

  test('interpolates {{placeholder}} in step params', async () => {
    const store = new InMemoryCheckpointStore()
    const capturedParams: Record<string, unknown>[] = []

    const executor = mock(async (_tool: string, params: Record<string, unknown>) => {
      capturedParams.push(params)
      return { success: true }
    })
    const runner = new WorkflowRunner(store, executor)

    await runner.run({
      taskId: 'task-2',
      tenantId: 'tenant-lib',
      workflow: makeCheckoutWorkflow(),
      params: { readerId: 'R042', bookId: 'B999' },
    })

    expect(capturedParams[0]).toMatchObject({ readerId: 'R042' })
    expect(capturedParams[1]).toMatchObject({ bookId: 'B999', readerId: 'R042' })
  })

  test('each step result includes stepId, tool, output, durationMs', async () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async (_tool: string, _params: Record<string, unknown>) => ({
      found: true,
    }))
    const runner = new WorkflowRunner(store, executor)

    const result = await runner.run({
      taskId: 'task-3',
      tenantId: 'tenant-lib',
      workflow: makeCheckoutWorkflow(),
      params: { readerId: 'R001', bookId: 'B001' },
    })

    const first = result.results[0]!
    expect(first.stepId).toBe('query_reader_step')
    expect(first.tool).toBe('query_reader')
    expect(first.output).toMatchObject({ found: true })
    expect(typeof first.durationMs).toBe('number')
    expect(first.durationMs).toBeGreaterThanOrEqual(0)
  })

  test('saves checkpoint after each step', async () => {
    const store = new InMemoryCheckpointStore()
    let saveCount = 0
    const origSave = store.save.bind(store)
    store.save = async (...args: Parameters<typeof store.save>) => {
      saveCount++
      return origSave(...args)
    }

    const executor = mock(async () => ({ success: true }))
    const runner = new WorkflowRunner(store, executor)

    await runner.run({
      taskId: 'task-cp',
      tenantId: 'tenant-lib',
      workflow: makeCheckoutWorkflow(),
      params: { readerId: 'R001', bookId: 'B001' },
    })

    expect(saveCount).toBe(2)
  })

  test('checkpoint envelope has planState.currentStepIndex updated', async () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async () => ({ success: true }))
    const runner = new WorkflowRunner(store, executor)

    await runner.run({
      taskId: 'task-idx',
      tenantId: 'tenant-lib',
      workflow: makeCheckoutWorkflow(),
      params: { readerId: 'R001', bookId: 'B001' },
    })

    const saved = await store.load('tenant-lib', 'task-idx')
    expect(saved).not.toBeNull()
    expect(saved!.planState).toBeDefined()
    // After 2 steps completed, currentStepIndex = 2
    expect(saved!.planState!.currentStepIndex).toBe(2)
  })
})

// ─── onError: abort ───────────────────────────────────────────────────────────

describe('WorkflowRunner onError: abort', () => {
  test('aborts on first step failure and returns error', async () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async (tool: string) => {
      if (tool === 'query_reader') throw new Error('reader not found')
      return { success: true }
    })
    const runner = new WorkflowRunner(store, executor)

    const result = await runner.run({
      taskId: 'task-abort',
      tenantId: 'tenant-lib',
      workflow: makeCheckoutWorkflow(),
      params: { readerId: 'R001', bookId: 'B001' },
    })

    expect(result.completed).toBe(false)
    expect(result.stepsCompleted).toBe(0)
    expect(result.error).toBeTypeOf('string')
    expect(result.error).toContain('query_reader')
    // checkout_book should not have been called
    expect(executor).toHaveBeenCalledTimes(1)
  })

  test('returns partial results when second step aborts', async () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async (tool: string) => {
      if (tool === 'checkout_book') throw new Error('checkout failed')
      return { success: true }
    })
    const runner = new WorkflowRunner(store, executor)

    const result = await runner.run({
      taskId: 'task-abort2',
      tenantId: 'tenant-lib',
      workflow: makeCheckoutWorkflow(),
      params: { readerId: 'R001', bookId: 'B001' },
    })

    expect(result.completed).toBe(false)
    expect(result.stepsCompleted).toBe(1)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.stepId).toBe('query_reader_step')
  })
})

// ─── onError: continue ────────────────────────────────────────────────────────

describe('WorkflowRunner onError: continue', () => {
  test('continues to next step on error', async () => {
    const store = new InMemoryCheckpointStore()
    const workflow = makeWorkflow([
      {
        id: 'step1',
        tool: 'tool_a',
        params: {},
        onError: 'continue',
      },
      {
        id: 'step2',
        tool: 'tool_b',
        params: {},
        onError: 'abort',
      },
    ])

    const executor = mock(async (tool: string) => {
      if (tool === 'tool_a') throw new Error('tool_a error')
      return { success: true }
    })
    const runner = new WorkflowRunner(store, executor)

    const result = await runner.run({
      taskId: 'task-continue',
      tenantId: 'tenant-lib',
      workflow,
      params: {},
    })

    expect(result.completed).toBe(true)
    expect(result.stepsCompleted).toBe(2)
    expect(result.results).toHaveLength(2)
    // step1 result has error wrapped
    expect(result.results[0]!.output).toMatchObject({ error: 'tool_a error' })
    // step2 succeeded
    expect(result.results[1]!.output).toMatchObject({ success: true })
  })
})

// ─── onError: retry ───────────────────────────────────────────────────────────

describe('WorkflowRunner onError: retry', () => {
  test('retries once and succeeds if retry passes', async () => {
    const store = new InMemoryCheckpointStore()
    let callCount = 0
    const executor = mock(async (tool: string) => {
      if (tool === 'flaky_tool') {
        callCount++
        if (callCount === 1) throw new Error('transient error')
        return { success: true, attempt: callCount }
      }
      return { success: true }
    })

    const workflow = makeWorkflow([
      {
        id: 'flaky_step',
        tool: 'flaky_tool',
        params: {},
        onError: 'retry',
      },
    ])

    const runner = new WorkflowRunner(store, executor)
    const result = await runner.run({
      taskId: 'task-retry',
      tenantId: 'tenant-lib',
      workflow,
      params: {},
    })

    expect(result.completed).toBe(true)
    expect(result.stepsCompleted).toBe(1)
    expect(callCount).toBe(2)
  })

  test('aborts after retry also fails', async () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async () => {
      throw new Error('always fails')
    })

    const workflow = makeWorkflow([
      {
        id: 'bad_step',
        tool: 'bad_tool',
        params: {},
        onError: 'retry',
      },
    ])

    const runner = new WorkflowRunner(store, executor)
    const result = await runner.run({
      taskId: 'task-retry-fail',
      tenantId: 'tenant-lib',
      workflow,
      params: {},
    })

    expect(result.completed).toBe(false)
    expect(result.stepsCompleted).toBe(0)
    expect(result.error).toContain('retry')
    expect(executor).toHaveBeenCalledTimes(2) // initial + retry
  })
})

// ─── Resume from step ─────────────────────────────────────────────────────────

describe('WorkflowRunner resume from step', () => {
  test('resumes from step index 1, skips step 0', async () => {
    const store = new InMemoryCheckpointStore()
    const calledTools: string[] = []
    const executor = mock(async (tool: string) => {
      calledTools.push(tool)
      return { success: true }
    })
    const runner = new WorkflowRunner(store, executor)

    const result = await runner.run({
      taskId: 'task-resume',
      tenantId: 'tenant-lib',
      workflow: makeCheckoutWorkflow(),
      params: { readerId: 'R001', bookId: 'B001' },
      resumeFromStep: 1,
    })

    expect(result.completed).toBe(true)
    expect(result.stepsCompleted).toBe(1)
    expect(calledTools).toEqual(['checkout_book'])
    expect(calledTools).not.toContain('query_reader')
  })

  test('resumeFromStep=0 runs all steps normally', async () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async () => ({ success: true }))
    const runner = new WorkflowRunner(store, executor)

    const result = await runner.run({
      taskId: 'task-resume0',
      tenantId: 'tenant-lib',
      workflow: makeCheckoutWorkflow(),
      params: { readerId: 'R001', bookId: 'B001' },
      resumeFromStep: 0,
    })

    expect(result.completed).toBe(true)
    expect(result.stepsCompleted).toBe(2)
  })
})
