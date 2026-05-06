import { describe, test, expect } from 'bun:test'
import type {
  NormalizedIntent,
  BizRef,
  FactSet,
  RuleCheckResult,
  ConfirmLevel,
} from '../types.js'

describe('industry-adapter types', () => {
  test('NormalizedIntent 字段齐备', () => {
    const intent: NormalizedIntent = {
      sceneCode: 'CIRCULATION_CHECKOUT',
      actionCode: 'ACTION_INIT',
      confidence: 0.97,
      pathType: 'fast',
      requiredParams: ['readerId', 'copyId'],
      rawInput: '扫码借书，读者A，馆藏B',
    }
    expect(intent.pathType).toBe('fast')
    expect(intent.requiredParams).toHaveLength(2)
  })

  test('BizRef 字段齐备', () => {
    const ref: BizRef = {
      type: 'READER',
      id: 'reader_001',
      status: 'ACTIVE',
      attrs: { quota: 5, overdue: 0 },
      constraints: [],
      sourceSystem: 'library-ils',
      snapshotAt: new Date().toISOString(),
    }
    expect(ref.constraints).toEqual([])
  })

  test('RuleCheckResult 合法 result 值', () => {
    const results: Array<RuleCheckResult['result']> = ['PASS', 'WARN', 'BLOCKED']
    expect(results).toHaveLength(3)
  })

  test('ConfirmLevel 合法值', () => {
    const levels: ConfirmLevel[] = [
      'auto',
      'silent_confirm',
      'explicit_confirm',
      'supervisor_approval',
    ]
    expect(levels).toHaveLength(4)
  })

  test('FactSet sources confidence 可选', () => {
    const fs: FactSet = {
      facts: { overdueCount: 2 },
      sources: [
        { key: 'overdueCount', source: 'library-ils' },
        { key: 'quota', source: 'library-ils', confidence: 1.0 },
      ],
      builtAt: new Date().toISOString(),
    }
    expect(fs.sources[0].confidence).toBeUndefined()
    expect(fs.sources[1].confidence).toBe(1.0)
  })
})
