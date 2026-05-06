// src/adapters/claude-code/ClaudeQueryAdapter.ts
// Wraps Claude Code's query() function for use in the server runtime.
// Does NOT import any Ink/REPL/screen components.

import type { TokenCounts } from 'src/runtime/types'
import type { SSEWriter } from 'src/runtime/stores'

export interface SimpleQueryParams {
  input: string
  systemPrompt: string
  model?: string
  maxTurns?: number
  abortSignal?: AbortSignal
}

export interface SimpleQueryResult {
  output: string
  tokensUsed: TokenCounts
  stopReason: string
}

/**
 * Minimal Claude query adapter for server runtime.
 * Phase B: returns a deterministic stub response.
 * Phase C/D: wire to actual query() from src/query.ts.
 *
 * The actual query() function signature is:
 *   async function* query(params: QueryParams): AsyncGenerator<StreamEvent>
 *
 * This adapter wraps it into a simple async function for the runtime.
 */
export class ClaudeQueryAdapter {
  constructor(private model: string = 'claude-sonnet-4-6') {}

  async query(
    params: SimpleQueryParams,
    sseWriter?: SSEWriter
  ): Promise<SimpleQueryResult> {
    // Phase B stub: simulate a successful response
    // Phase C: replace with actual query() call from src/query.ts
    const output = `[Phase B stub] Processed: ${params.input}`
    const tokensUsed: TokenCounts = {
      inputTokens: params.input.length,
      outputTokens: output.length,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }

    if (sseWriter) {
      sseWriter.send({
        type: 'message_delta',
        traceId: 'stub' as import('src/runtime/types').UUID,
        sequence: 1,
        sessionId: 'stub' as import('src/runtime/types').UUID,
        delta: output,
      })
    }

    return { output, tokensUsed, stopReason: 'end_turn' }
  }

  getModel(): string {
    return this.model
  }
}
