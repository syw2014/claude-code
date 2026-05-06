/**
 * User message builder for Industry Agent Runtime.
 * Assembles user message with minimal context block.
 */

import type { NormalizedIntent, BizRef } from '@claude-code-best/industry-adapter'

export interface UserMessageInput {
  userText: string
  intent: NormalizedIntent // from industry-adapter
  bizRefs: Record<string, BizRef>
}

export interface BuiltUserMessage {
  role: 'user'
  content: string
}

/**
 * Assembles user message:
 * 1. Start with userText (raw)
 * 2. Append context block with intent and bizRef keys
 * Context block is minimal — only what Claude needs to understand the request
 */
export function buildUserMessage(input: UserMessageInput): BuiltUserMessage {
  const bizRefKeys = Object.keys(input.bizRefs)

  let content = input.userText
  content += '\n\n<context>'
  content += `\nIntent: ${input.intent.sceneCode}/${input.intent.actionCode} (confidence=${input.intent.confidence})`
  content += `\nBizRefs: ${JSON.stringify(bizRefKeys)}`
  content += '\n</context>'

  return {
    role: 'user',
    content,
  }
}
