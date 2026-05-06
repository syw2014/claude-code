import { describe, test, expect, mock } from 'bun:test'
import { IndustryWorkflowTool } from '../IndustryWorkflowTool.js'
import { InMemoryCheckpointStore } from '../../state/CheckpointStore.js'
import type { Workflow } from '@claude-code-best/industry-adapter'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAcquisitionWorkflow(): Workflow {
  return {
    name: 'acquisition-fast-flow',
    description: '图书馆采编快工作流（选书→馆藏查重→记录采购意向）',
    industry: 'library',
    steps: [
      {
        id: 'query_holdings_step',
        tool: 'query_holdings',
        params: { query: '{{title}}' },
        onError: 'continue',
      },
      {
        id: 'record_acquisition_step',
        tool: 'query_reader',
        params: { readerId: '{{librarianId}}' },
        onError: 'abort',
      },
    ],
  }
}

// ─── IndustryWorkflowTool ─────────────────────────────────────────────────────

describe('IndustryWorkflowTool', () => {
  test('name is "workflow:acquisition-fast-flow"', () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async () => ({ success: true }))
    const tool = new IndustryWorkflowTool(makeAcquisitionWorkflow(), store, executor)
    expect(tool.name).toBe('workflow:acquisition-fast-flow')
  })

  test('description matches workflow description', () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async () => ({ success: true }))
    const tool = new IndustryWorkflowTool(makeAcquisitionWorkflow(), store, executor)
    expect(tool.description).toBe('图书馆采编快工作流（选书→馆藏查重→记录采购意向）')
  })

  test('execute() runs workflow and returns completed=true', async () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async () => ({ success: true }))
    const tool = new IndustryWorkflowTool(makeAcquisitionWorkflow(), store, executor)

    const output = await tool.execute({
      taskId: 'task-acq-1',
      tenantId: 'tenant-lib',
      params: { title: 'TypeScript Deep Dive', librarianId: 'L001' },
    })

    expect(output.workflowName).toBe('acquisition-fast-flow')
    expect(output.completed).toBe(true)
    expect(output.stepsCompleted).toBe(2)
    expect(output.results).toHaveLength(2)
    expect(output.error).toBeUndefined()
  })

  test('execute() passes params to toolExecutor', async () => {
    const store = new InMemoryCheckpointStore()
    const capturedCalls: Array<{ tool: string; params: Record<string, unknown> }> = []

    const executor = mock(async (tool: string, params: Record<string, unknown>) => {
      capturedCalls.push({ tool, params })
      return { success: true }
    })

    const toolAdapter = new IndustryWorkflowTool(makeAcquisitionWorkflow(), store, executor)

    await toolAdapter.execute({
      taskId: 'task-acq-2',
      tenantId: 'tenant-lib',
      params: { title: 'Clean Code', librarianId: 'L042' },
    })

    expect(capturedCalls).toHaveLength(2)
    expect(capturedCalls[0]!.tool).toBe('query_holdings')
    expect(capturedCalls[0]!.params).toMatchObject({ query: 'Clean Code' })
    expect(capturedCalls[1]!.tool).toBe('query_reader')
    expect(capturedCalls[1]!.params).toMatchObject({ readerId: 'L042' })
  })

  test('execute() resumeFromStep skips first step', async () => {
    const store = new InMemoryCheckpointStore()
    const calledTools: string[] = []

    const executor = mock(async (tool: string) => {
      calledTools.push(tool)
      return { success: true }
    })

    const toolAdapter = new IndustryWorkflowTool(makeAcquisitionWorkflow(), store, executor)

    const output = await toolAdapter.execute({
      taskId: 'task-acq-resume',
      tenantId: 'tenant-lib',
      params: { title: 'Refactoring', librarianId: 'L007' },
      resumeFromStep: 1,
    })

    expect(output.completed).toBe(true)
    expect(output.stepsCompleted).toBe(1)
    expect(calledTools).toEqual(['query_reader'])
    expect(calledTools).not.toContain('query_holdings')
  })

  test('execute() returns error when abort step fails', async () => {
    const store = new InMemoryCheckpointStore()
    const executor = mock(async (tool: string) => {
      // query_holdings has onError: continue, query_reader has onError: abort
      if (tool === 'query_reader') throw new Error('librarian not found')
      return { success: true }
    })

    const toolAdapter = new IndustryWorkflowTool(makeAcquisitionWorkflow(), store, executor)

    const output = await toolAdapter.execute({
      taskId: 'task-acq-fail',
      tenantId: 'tenant-lib',
      params: { title: 'SICP', librarianId: 'L999' },
    })

    expect(output.completed).toBe(false)
    expect(output.error).toBeTypeOf('string')
    expect(output.error).toContain('query_reader')
  })
})
