import { describe, test, expect, beforeEach } from 'bun:test'
import { InMemorySessionRepository } from '../SessionRepository.js'
import { InMemoryTaskRepository } from '../TaskRepository.js'

const TENANT = 'tenant_001'

describe('InMemorySessionRepository', () => {
  let repo: InMemorySessionRepository

  beforeEach(() => {
    repo = new InMemorySessionRepository()
  })

  test('create 返回含 id 的 StoredSession', async () => {
    const session = await repo.create({
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'library',
      status: 'created',
      permissionMode: 'default',
      modelOverride: null,
      currentTraceId: null,
      metadata: {},
    })
    expect(session.id).toBeTruthy()
    expect(session.status).toBe('created')
    expect(session.closedAt).toBeNull()
  })

  test('findById 不存在时返回 null', async () => {
    expect(await repo.findById(TENANT, 'ghost')).toBeNull()
  })

  test('updateStatus 更新状态', async () => {
    const session = await repo.create({
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'library',
      status: 'created',
      permissionMode: 'default',
      modelOverride: null,
      currentTraceId: null,
      metadata: {},
    })
    const updated = await repo.updateStatus(TENANT, session.id, 'active')
    expect(updated?.status).toBe('active')
  })

  test('updateTraceId 更新当前 trace', async () => {
    const session = await repo.create({
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'library',
      status: 'created',
      permissionMode: 'default',
      modelOverride: null,
      currentTraceId: null,
      metadata: {},
    })
    await repo.updateTraceId(TENANT, session.id, 'trace_001')
    const found = await repo.findById(TENANT, session.id)
    expect(found?.currentTraceId).toBe('trace_001')
  })

  test('updateStatus 设置 closedAt', async () => {
    const session = await repo.create({
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'library',
      status: 'active',
      permissionMode: 'default',
      modelOverride: null,
      currentTraceId: null,
      metadata: {},
    })
    const closedAt = new Date().toISOString()
    const updated = await repo.updateStatus(TENANT, session.id, 'closed', closedAt)
    expect(updated?.closedAt).toBe(closedAt)
  })
})

describe('InMemoryTaskRepository', () => {
  let repo: InMemoryTaskRepository

  beforeEach(() => {
    repo = new InMemoryTaskRepository()
  })

  test('create 返回含 id 的 StoredTask', async () => {
    const task = await repo.create({
      sessionId: 'sess_001',
      traceId: 'trace_001',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'library',
      parentTaskId: null,
      inputText: '扫码借书',
      mode: 'fast',
      status: 'queued',
      envelope: {},
      idempotencyKey: null,
      startedAt: null,
      completedAt: null,
    })
    expect(task.id).toBeTruthy()
    expect(task.status).toBe('queued')
  })

  test('findByIdempotencyKey 重复请求返回同一 task', async () => {
    const task = await repo.create({
      sessionId: 'sess_001',
      traceId: 'trace_001',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'library',
      parentTaskId: null,
      inputText: '扫码借书',
      mode: 'fast',
      status: 'queued',
      envelope: {},
      idempotencyKey: 'client_msg_001',
      startedAt: null,
      completedAt: null,
    })
    const found = await repo.findByIdempotencyKey(TENANT, 'sess_001', 'client_msg_001')
    expect(found?.id).toBe(task.id)
  })

  test('updateStatus 更新状态', async () => {
    const task = await repo.create({
      sessionId: 's',
      traceId: 'tr',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'lib',
      parentTaskId: null,
      inputText: 'x',
      mode: 'agent',
      status: 'queued',
      envelope: {},
      idempotencyKey: null,
      startedAt: null,
      completedAt: null,
    })
    const now = new Date().toISOString()
    const updated = await repo.updateStatus(TENANT, task.id, 'running', { startedAt: now })
    expect(updated?.status).toBe('running')
    expect(updated?.startedAt).toBe(now)
  })

  test('listBySession 返回正确 task', async () => {
    await repo.create({
      sessionId: 'sA',
      traceId: 'tr',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'lib',
      parentTaskId: null,
      inputText: '1',
      mode: 'fast',
      status: 'queued',
      envelope: {},
      idempotencyKey: null,
      startedAt: null,
      completedAt: null,
    })
    await repo.create({
      sessionId: 'sA',
      traceId: 'tr',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'lib',
      parentTaskId: null,
      inputText: '2',
      mode: 'fast',
      status: 'queued',
      envelope: {},
      idempotencyKey: null,
      startedAt: null,
      completedAt: null,
    })
    await repo.create({
      sessionId: 'sB',
      traceId: 'tr',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'lib',
      parentTaskId: null,
      inputText: '3',
      mode: 'fast',
      status: 'queued',
      envelope: {},
      idempotencyKey: null,
      startedAt: null,
      completedAt: null,
    })
    const tasks = await repo.listBySession(TENANT, 'sA')
    expect(tasks).toHaveLength(2)
  })
})
