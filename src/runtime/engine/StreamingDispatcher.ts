// src/runtime/engine/StreamingDispatcher.ts
import type { SSEWriter } from '../stores.js'
import type { UUID } from '../types.js'
import type { NormalizedIntent } from '@claude-code-best/industry-adapter'

// ─── Sequence counter helper ──────────────────────────────────────────────────

export function createSequenceCounter(start = 0): { next(): number } {
  let seq = start
  return { next: () => ++seq }
}

// ─── StreamingDispatcher ──────────────────────────────────────────────────────

/**
 * Central hub that translates runtime events into SSE events pushed to the
 * client via the injected SSEWriter. Also supports interrupt injection —
 * the frontend can inject a human instruction mid-task (e.g. "cancel this",
 * "change approach") which the AgentRuntime reads between steps.
 */
export class StreamingDispatcher {
  /** Pending interrupt injected by frontend. Cleared after being read. */
  private pendingInterrupt: string | null = null

  constructor(
    private sessionId: UUID,
    private traceId: UUID,
    private writer: SSEWriter,
    private sequenceCounter: { next(): number },
  ) {}

  // ── Intent / context events ──────────────────────────────────────────────

  dispatchIntentDetected(intent: NormalizedIntent, taskId: UUID): void {
    this.writer.send({
      type: 'intent_detected',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      intent,
    })
  }

  dispatchContextBuilt(bizRefsCount: number, taskId: UUID): void {
    this.writer.send({
      type: 'context_built',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      bizRefsCount,
    })
  }

  dispatchPlanCreated(stepCount: number, taskId: UUID): void {
    this.writer.send({
      type: 'plan_created',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      stepCount,
    })
  }

  // ── LLM streaming ────────────────────────────────────────────────────────

  dispatchMessageDelta(delta: string, taskId: UUID): void {
    this.writer.send({
      type: 'message_delta',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      delta,
    })
  }

  // ── Tool lifecycle ────────────────────────────────────────────────────────

  dispatchToolStarted(toolCallId: UUID, toolName: string, channel: string, taskId: UUID): void {
    this.writer.send({
      type: 'tool_started',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      toolCallId,
      toolName,
      channel,
    })
  }

  dispatchToolCompleted(
    toolCallId: UUID,
    toolName: string,
    status: 'succeeded' | 'failed',
    durationMs: number,
    taskId: UUID,
  ): void {
    this.writer.send({
      type: 'tool_completed',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      toolCallId,
      toolName,
      status,
      durationMs,
    })
  }

  // ── Permission events ─────────────────────────────────────────────────────

  dispatchPermissionRequired(
    confirmId: UUID,
    operation: string,
    confirmLevel: string,
    requiredApproverRole: string,
    ruleWarnings: string[],
    expiresAt: string,
    taskId: UUID,
  ): void {
    this.writer.send({
      type: 'permission_required',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      confirmId,
      operation,
      confirmLevel,
      requiredApproverRole,
      ruleWarnings,
      expiresAt,
    })
  }

  dispatchPermissionResolved(
    confirmId: UUID,
    decision: 'approve' | 'reject' | 'timeout',
    taskId: UUID,
  ): void {
    this.writer.send({
      type: 'permission_resolved',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      confirmId,
      decision,
    })
  }

  // ── Warning / Error / Done ────────────────────────────────────────────────

  dispatchWarning(warningCode: string, message: string, taskId: UUID): void {
    this.writer.send({
      type: 'warning',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      warningCode,
      message,
    })
  }

  dispatchError(errorCode: string, message: string, retryable: boolean, taskId: UUID): void {
    this.writer.send({
      type: 'error',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      errorCode,
      message,
      retryable,
    })
  }

  dispatchDone(taskId: UUID, taskStatus: string, tokensUsed: number): void {
    this.writer.send({
      type: 'done',
      traceId: this.traceId,
      sequence: this.sequenceCounter.next(),
      sessionId: this.sessionId,
      taskId,
      taskStatus,
      tokensUsed,
    })
  }

  // ── Interrupt injection ───────────────────────────────────────────────────

  /**
   * Called by the HTTP handler when the frontend POSTs an interrupt.
   * Stores the instruction; runtime reads it via consumeInterrupt().
   */
  injectInterrupt(instruction: string): void {
    this.pendingInterrupt = instruction
  }

  /**
   * Called by AgentRuntime / WorkflowRunner between steps to check for
   * interrupts. Returns the interrupt instruction and clears it, or null
   * if none is pending.
   */
  consumeInterrupt(): string | null {
    const pending = this.pendingInterrupt
    this.pendingInterrupt = null
    return pending
  }

  /** Returns true if an interrupt is pending (without consuming it). */
  hasInterrupt(): boolean {
    return this.pendingInterrupt !== null
  }
}
