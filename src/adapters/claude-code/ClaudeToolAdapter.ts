// src/adapters/claude-code/ClaudeToolAdapter.ts
import type { ToolCallRecord, ToolCallStatus, UUID } from 'src/runtime/types'
import type { PermissionLevel } from '@claude-code-best/industry-adapter'

export interface BizToolInput {
  toolName: string
  channel: 'common_tool' | 'biz_tool' | 'mcp_tool' | 'workflow_tool'
  permissionLevel: PermissionLevel
  input: Record<string, unknown>
  taskId: UUID
  traceId: UUID
}

export interface BizToolResult {
  status: ToolCallStatus
  output?: unknown
  error?: string
  durationMs: number
}

/**
 * Adapts Claude Code's tool system for server-side use.
 * Phase B: stub implementation that records tool call metadata.
 * Phase C/D: wire to actual tool execution from packages/builtin-tools.
 */
export class ClaudeToolAdapter {
  async execute(params: BizToolInput): Promise<BizToolResult> {
    const start = Date.now()

    // Phase B stub: simulate tool execution
    // Phase C/D: look up tool in registry and execute
    try {
      const output = { result: `[stub] ${params.toolName} executed`, input: params.input }
      return {
        status: 'succeeded',
        output,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      return {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }
    }
  }

  buildRecord(params: BizToolInput, result: BizToolResult): ToolCallRecord {
    return {
      id: crypto.randomUUID(),
      taskId: params.taskId,
      traceId: params.traceId,
      name: params.toolName,
      channel: params.channel,
      status: result.status,
      input: params.input,
      output: result.output,
      error: result.error ? { code: 'TOOL_ERROR', message: result.error, retryable: false } : undefined,
      durationMs: result.durationMs,
    }
  }
}
