import { describe, test, expect, beforeEach } from 'bun:test'
import { SessionStateStore } from '../SessionStateStore.js'
import { InMemoryTaskStateStore } from '../TaskStateStore.js'
import { InMemoryCheckpointStore } from '../CheckpointStore.js'
import { createEnvelope } from '../../context/ContextEnvelope.js'
import type { SessionState } from '../../stores.js'
import type { TaskRun } from '../../types.js'

const TENANT = 'tenant_001'

describe('SessionStateStore', () => {
  let store: SessionStateStore

  beforeEach(() => {
    store = new SessionStateStore()
  })

  test('get 不存在时返回 null', async () => {
    expect(await store.get(TENANT, 'nonexistent')).toBeNull()
  })

  test('set 后 get 返回相同状态', async () => {
    const state: SessionState = {
      sessionId: 'sess_001',
      tenantId: TENANT,
      userId: 'user_001',
      industryCode: 'library',
      status: 'active',
      updatedAt: new Date().toISOString(),
    }
    await store.set(TENANT, 'sess_001', state)
    const got = await store.get(TENANT, 'sess_001')
    expect(got?.sessionId).toBe('sess_001')
    expect(got?.status).toBe('active')
  })

  test('delete 后 get 返回 null', async () => {
    const state: SessionState = {
      sessionId: 'sess_002',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'lib',
      status: 'active',
      updatedAt: '',
    }
    await store.set(TENANT, 'sess_002', state)
    await store.delete(TENANT, 'sess_002')
    expect(await store.get(TENANT, 'sess_002')).toBeNull()
  })

  test('不同 tenant 不冲突', async () => {
    const s1: SessionState = {
      sessionId: 's',
      tenantId: 't1',
      userId: 'u',
      industryCode: 'lib',
      status: 'active',
      updatedAt: '',
    }
    const s2: SessionState = {
      sessionId: 's',
      tenantId: 't2',
      userId: 'u',
      industryCode: 'lib',
      status: 'closed',
      updatedAt: '',
    }
    await store.set('t1', 's', s1)
    await store.set('t2', 's', s2)
    expect((await store.get('t1', 's'))?.status).toBe('active')
    expect((await store.get('t2', 's'))?.status).toBe('closed')
  })
})

describe('InMemoryTaskStateStore', () => {
  let store: InMemoryTaskStateStore

  beforeEach(() => {
    store = new InMemoryTaskStateStore()
  })

  function makeTask(id: string, sessionId = 'sess_001'): TaskRun {
    return {
      id,
      sessionId,
      traceId: 'trace_001',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'library',
      input: '扫码借书',
      mode: 'fast',
      status: 'queued',
    }
  }

  test('get 不存在时返回 null', async () => {
    expect(await store.get(TENANT, 'nonexistent')).toBeNull()
  })

  test('set 后可 get', async () => {
    await store.set(TENANT, makeTask('task_001'))
    const got = await store.get(TENANT, 'task_001')
    expect(got?.id).toBe('task_001')
    expect(got?.status).toBe('queued')
  })

  test('updateStatus 更新状态', async () => {
    await store.set(TENANT, makeTask('task_002'))
    const updated = await store.updateStatus(TENANT, 'task_002', 'running')
    expect(updated?.status).toBe('running')
    const got = await store.get(TENANT, 'task_002')
    expect(got?.status).toBe('running')
  })

  test('updateStatus 对不存在 task 返回 null', async () => {
    expect(await store.updateStatus(TENANT, 'ghost', 'succeeded')).toBeNull()
  })

  test('listBySession 返回该 session 的所有 task', async () => {
    await store.set(TENANT, makeTask('t1', 'sess_A'))
    await store.set(TENANT, makeTask('t2', 'sess_A'))
    await store.set(TENANT, makeTask('t3', 'sess_B'))
    const tasks = await store.listBySession(TENANT, 'sess_A')
    expect(tasks).toHaveLength(2)
  })
})

describe('InMemoryCheckpointStore', () => {
  let store: InMemoryCheckpointStore

  beforeEach(() => {
    store = new InMemoryCheckpointStore()
  })

  test('load 不存在时返回 null', async () => {
    expect(await store.load(TENANT, 'task_001')).toBeNull()
  })

  test('save 后 load 返回 envelope', async () => {
    const envelope = createEnvelope({
      sessionId: 'sess_001',
      traceId: 'trace_001',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'library',
      turnId: 'turn_001',
    })
    await store.save(TENANT, 'task_001', envelope)
    const got = await store.load(TENANT, 'task_001')
    expect(got?.sessionId).toBe('sess_001')
  })

  test('delete 后 load 返回 null', async () => {
    const envelope = createEnvelope({
      sessionId: 's',
      traceId: 'tr',
      tenantId: TENANT,
      userId: 'u',
      industryCode: 'lib',
      turnId: 'tu',
    })
    await store.save(TENANT, 'task_002', envelope)
    await store.delete(TENANT, 'task_002')
    expect(await store.load(TENANT, 'task_002')).toBeNull()
  })
})
