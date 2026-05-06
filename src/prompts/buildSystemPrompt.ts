/**
 * System prompt builder for Industry Agent Runtime.
 * Assembles final system prompt from template, knowledge snippets, and footer.
 */

export interface SystemPromptInput {
  industryCode: string
  industryPromptTemplate: string // raw markdown template from DB/store
  knowledgeSnippets: string[] // pre-fetched knowledge chunks to inject
  ruleVersion: string
  tenantId: string
}

/**
 * Assembles the final system prompt:
 * 1. Start with industryPromptTemplate as-is
 * 2. If knowledgeSnippets.length > 0, append a section with knowledge
 * 3. Append footer with rule version, tenant, and industry code
 */
export function buildSystemPrompt(input: SystemPromptInput): string {
  let prompt = input.industryPromptTemplate

  // Append knowledge section if snippets exist
  if (input.knowledgeSnippets.length > 0) {
    prompt += '\n\n## Knowledge\n\n'
    prompt += input.knowledgeSnippets.join('\n\n---\n\n')
  }

  // Append footer
  prompt += `\n\n---\nRule version: ${input.ruleVersion} | Tenant: ${input.tenantId} | Industry: ${input.industryCode}`

  return prompt
}
