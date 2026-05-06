import { describe, test, expect, mock } from 'bun:test'
import { SubAgentSpawner } from '../SubAgentSpawner.js'
import type { SessionContext } from '../../context/SessionContext.js'
import type { AuditEventPayload, AuditWriter } from '../../stores.js'
import type { Workflow } from '@claude-code-best/industry-adapter'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWorkflow(steps: Workflow['steps']): Workflow {
  return {
    name: 'test-workflow',
    description: 'Test workflow for sub-agent',
    industry: 'library',
    steps,
  }
}

function makeDisputeWorkflow(): Workflow {
  return makeWorkflow([
    {
      id: 'query_reader_step',
      tool: 'query_reader',
      params: { readerId: '{{readerId}}' },
      onError: 'abort',
    },
    {
      id: 'handle_dispute_step',
      tool: 'handle_dispute',
      params: { readerId: '{{readerId}}', bookId: '{{bookId}}', disputeReason: '{{disputeReason}}' },
      onError: 'abort',
    },
    {
      id: 'notify_step',
      tool: 'query_reader',
      params: { readerId: '{{readerId}}' },
      onError: 'continue',
    },
  ])
}

function makeParentCtx(overrides?: Partial<SessionContext>): SessionContext {
  const recorded: AuditEventPayload[] = []
  const auditWriter: AuditWriter = {
    record: mock(async (event: AuditEventPayload) => { recorded.push(event) }),
    flush: mock(async () => {}),
  }

  return {
    sessionId: 'parent-session-id',
    traceId: 'shared-trace-id',
    taskId: 'parent-task-id',
    cwd: '/tmp',
    projectRoot: '/tmp',
    tokenCounts: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    permissionMode: 'default',
    industryCode: 'library',
    userId: 'user-001',
    tenantId: 'tenant-001',
    industryAdapter: {} as unknown as SessionContext['industryAdapter'],
    ruleSet: {} as unknown as SessionContext['ruleSet'],
    auditWriter,
    sessionStore: {} as unknown as SessionContext['sessionStore'],
    memoryStore: {} as unknown as SessionContext['memoryStore'],
    ruleStore: {} as unknown as SessionContext['ruleStore'],
    promptStore: {} as unknown as SessionContext['promptStore'],
    knowledgeStore: {} as unknown as SessionContext['knowledgeStore'],
    envelope: {
      schemaVersion: 1,
      sessionId: 'parent-session-id',
      traceId: 'shared-trace-id',
      taskId: 'parent-task-id',
      tenantId: 'tenant-001',
      userId: 'user-001',
      industryCode: 'library',
      turnId: 'turn-001',
      bizRefs: {},
      factSet: { facts: {}, sources: [], builtAt: new Date().toISOString() },
      memoryRefs: [],
      ruleBindings: [],
      capabilityBindings: [],
      priorToolResults: [],
      promptRefs: [],
      costState: { inputTokensTotal: 0, outputTokensTotal: 0, budgetExceeded: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...overrides,
  } as unknown as SessionContext
}

// ─── spawn() with workflow ────────────────────────────────────────────────────

describe('SubAgentSpawner.spawn() with workflow', () => {
  test('succeeds and returns stepsCompleted', async () => {
    const parentCtx = makeParentCtx()
    const spawner = new SubAgentSpawner(parentCtx)

    const result = await spawner.spawn({
      purpose: 'dispute resolution',
      workflow: makeDisputeWorkflow(),
      initialParams: { readerId: 'R001', bookId: 'B001', disputeReason: 'overdue' },
    })

    expect(result.status).toBe('succeeded')
    expect(result.stepsCompleted).toBe(3)
    expect(typeof result.subAgentTaskId).toBe('string')
    expect(result.subAgentTaskId.length).toBeGreaterThan(0)
  })

  test('emits subagent_spawned audit event with parent traceId', async () => {
    const parentCtx = makeParentCtx()
    const recordMock = parentCtx.auditWriter.record as ReturnType<typeof mock>
    const spawner = new SubAgentSpawner(parentCtx)

    await spawner.spawn({
      purpose: 'dispute resolution',
      workflow: makeDisputeWorkflow(),
      initialParams: { readerId: 'R001', bookId: 'B001', disputeReason: 'overdue' },
    })

    expect(recordMock).toHaveBeenCalled()
    const call = recordMock.mock.calls[0]![0] as AuditEventPayload
    expect(call.eventType).toBe('subagent_spawned')
    expect(call.traceId).toBe('shared-trace-id')
    expect(call.payload.purpose).toBe('dispute resolution')
    expect(call.payload.parentTaskId).toBe('parent-task-id')
    expect(call.payload.workflow).toBe('test-workflow')
  })

  test('child context has same traceId as parent', async () => {
    const parentCtx = makeParentCtx()
    const spawner = new SubAgentSpawner(parentCtx)

    const result = await spawner.spawn({
      purpose: 'dispute resolution',
      workflow: makeDisputeWorkflow(),
      initialParams: { readerId: 'R001', bookId: 'B001', disputeReason: 'overdue' },
    })

    // The audit event uses parent traceId (same trace), and subAgentTaskId is a fresh UUID
    const recordMock = parentCtx.auditWriter.record as ReturnType<typeof mock>
    const call = recordMock.mock.calls[0]![0] as AuditEventPayload
    expect(call.traceId).toBe(parentCtx.traceId)
    // subAgentTaskId differs from parent task
    expect(result.subAgentTaskId).not.toBe('parent-task-id')
  })
})

// ─── spawn() without workflow ─────────────────────────────────────────────────

describe('SubAgentSpawner.spawn() without workflow', () => {
  test('returns immediately with succeeded and stepsCompleted=0', async () => {
    const parentCtx = makeParentCtx()
    const spawner = new SubAgentSpawner(parentCtx)

    const result = await spawner.spawn({
      purpose: 'stub agent',
      initialParams: {},
    })

    expect(result.status).toBe('succeeded')
    expect(result.stepsCompleted).toBe(0)
    expect(typeof result.subAgentTaskId).toBe('string')
  })
})

// ─── spawn() maxSteps timeout ─────────────────────────────────────────────────

describe('SubAgentSpawner.spawn() maxSteps guard', () => {
  test('maxSteps=1 on 3-step workflow returns timeout', async () => {
    const parentCtx = makeParentCtx()
    const spawner = new SubAgentSpawner(parentCtx)

    const result = await spawner.spawn({
      purpose: 'limited agent',
      workflow: makeDisputeWorkflow(),
      initialParams: { readerId: 'R001', bookId: 'B001', disputeReason: 'overdue' },
      maxSteps: 1,
    })

    expect(result.status).toBe('timeout')
    expect(result.stepsCompleted).toBeLessThanOrEqual(1)
  })
})
