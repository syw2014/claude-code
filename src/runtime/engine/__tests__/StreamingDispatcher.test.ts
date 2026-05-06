// src/runtime/engine/__tests__/StreamingDispatcher.test.ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { StreamingDispatcher, createSequenceCounter } from '../StreamingDispatcher.js'
import type { SSEWriter } from '../../stores.js'
import type { SSEEvent } from 'src/server/sse/types'
import type { UUID } from '../../types.js'
import type { NormalizedIntent } from '@claude-code-best/industry-adapter'

const SESSION_ID = 'session-001' as UUID
const TRACE_ID = 'trace-001' as UUID
const TASK_ID = 'task-001' as UUID
const TOOL_CALL_ID = 'tool-call-001' as UUID
const CONFIRM_ID = 'confirm-001' as UUID

function makeDispatcher(): { dispatcher: StreamingDispatcher; sent: SSEEvent[] } {
  const sent: SSEEvent[] = []
  const mockWriter: SSEWriter = {
    send: (event) => { sent.push(event) },
    close: () => {},
  }
  const dispatcher = new StreamingDispatcher(
    SESSION_ID,
    TRACE_ID,
    mockWriter,
    createSequenceCounter(),
  )
  return { dispatcher, sent }
}

describe('StreamingDispatcher', () => {
  describe('dispatchMessageDelta', () => {
    test('calls writer.send with correct type and delta', () => {
      const { dispatcher, sent } = makeDispatcher()
      dispatcher.dispatchMessageDelta('Hello world', TASK_ID)
      expect(sent).toHaveLength(1)
      const event = sent[0]
      expect(event.type).toBe('message_delta')
      expect((event as { type: string; delta: string }).delta).toBe('Hello world')
      expect(event.traceId).toBe(TRACE_ID)
      expect(event.sessionId).toBe(SESSION_ID)
      expect(event.taskId).toBe(TASK_ID)
    })
  })

  describe('dispatchToolStarted', () => {
    test('sends tool_started event with toolCallId and toolName', () => {
      const { dispatcher, sent } = makeDispatcher()
      dispatcher.dispatchToolStarted(TOOL_CALL_ID, 'checkout', 'ecommerce', TASK_ID)
      expect(sent).toHaveLength(1)
      const event = sent[0] as { type: string; toolCallId: UUID; toolName: string; channel: string }
      expect(event.type).toBe('tool_started')
      expect(event.toolCallId).toBe(TOOL_CALL_ID)
      expect(event.toolName).toBe('checkout')
      expect(event.channel).toBe('ecommerce')
    })
  })

  describe('dispatchToolCompleted', () => {
    test('sends tool_completed with status and durationMs', () => {
      const { dispatcher, sent } = makeDispatcher()
      dispatcher.dispatchToolCompleted(TOOL_CALL_ID, 'checkout', 'succeeded', 120, TASK_ID)
      expect(sent).toHaveLength(1)
      const event = sent[0] as { type: string; toolCallId: UUID; toolName: string; status: string; durationMs: number }
      expect(event.type).toBe('tool_completed')
      expect(event.toolCallId).toBe(TOOL_CALL_ID)
      expect(event.toolName).toBe('checkout')
      expect(event.status).toBe('succeeded')
      expect(event.durationMs).toBe(120)
    })
  })

  describe('dispatchPermissionRequired', () => {
    test('sends permission_required with confirmId and ruleWarnings', () => {
      const { dispatcher, sent } = makeDispatcher()
      const warnings = ['Rule A violated', 'Rule B check required']
      dispatcher.dispatchPermissionRequired(
        CONFIRM_ID,
        'delete_order',
        'level_2',
        'supervisor',
        warnings,
        '2026-05-06T12:00:00Z',
        TASK_ID,
      )
      expect(sent).toHaveLength(1)
      const event = sent[0] as {
        type: string
        confirmId: UUID
        operation: string
        confirmLevel: string
        requiredApproverRole: string
        ruleWarnings: string[]
        expiresAt: string
      }
      expect(event.type).toBe('permission_required')
      expect(event.confirmId).toBe(CONFIRM_ID)
      expect(event.operation).toBe('delete_order')
      expect(event.confirmLevel).toBe('level_2')
      expect(event.requiredApproverRole).toBe('supervisor')
      expect(event.ruleWarnings).toEqual(warnings)
      expect(event.expiresAt).toBe('2026-05-06T12:00:00Z')
    })
  })

  describe('dispatchDone', () => {
    test('sends done event with taskStatus and tokensUsed', () => {
      const { dispatcher, sent } = makeDispatcher()
      dispatcher.dispatchDone(TASK_ID, 'completed', 1500)
      expect(sent).toHaveLength(1)
      const event = sent[0] as { type: string; taskId: UUID; taskStatus: string; tokensUsed: number }
      expect(event.type).toBe('done')
      expect(event.taskId).toBe(TASK_ID)
      expect(event.taskStatus).toBe('completed')
      expect(event.tokensUsed).toBe(1500)
    })
  })

  describe('interrupt injection', () => {
    test('injectInterrupt stores instruction', () => {
      const { dispatcher } = makeDispatcher()
      dispatcher.injectInterrupt('cancel this task')
      expect(dispatcher.hasInterrupt()).toBe(true)
    })

    test('consumeInterrupt returns instruction and clears it', () => {
      const { dispatcher } = makeDispatcher()
      dispatcher.injectInterrupt('change approach')
      const result = dispatcher.consumeInterrupt()
      expect(result).toBe('change approach')
      expect(dispatcher.hasInterrupt()).toBe(false)
      expect(dispatcher.consumeInterrupt()).toBeNull()
    })

    test('consumeInterrupt when empty returns null', () => {
      const { dispatcher } = makeDispatcher()
      expect(dispatcher.consumeInterrupt()).toBeNull()
    })

    test('hasInterrupt is true when pending, false after consume', () => {
      const { dispatcher } = makeDispatcher()
      expect(dispatcher.hasInterrupt()).toBe(false)
      dispatcher.injectInterrupt('stop')
      expect(dispatcher.hasInterrupt()).toBe(true)
      dispatcher.consumeInterrupt()
      expect(dispatcher.hasInterrupt()).toBe(false)
    })
  })

  describe('sequence counter', () => {
    test('increments on each send', () => {
      const { dispatcher, sent } = makeDispatcher()
      dispatcher.dispatchMessageDelta('a', TASK_ID)
      dispatcher.dispatchMessageDelta('b', TASK_ID)
      dispatcher.dispatchMessageDelta('c', TASK_ID)
      expect(sent[0].sequence).toBe(1)
      expect(sent[1].sequence).toBe(2)
      expect(sent[2].sequence).toBe(3)
    })
  })
})

describe('createSequenceCounter', () => {
  test('starts at 1 by default (increments from 0)', () => {
    const counter = createSequenceCounter()
    expect(counter.next()).toBe(1)
    expect(counter.next()).toBe(2)
  })

  test('respects custom start value', () => {
    const counter = createSequenceCounter(10)
    expect(counter.next()).toBe(11)
  })
})
