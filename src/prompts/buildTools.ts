/**
 * Tools builder for Industry Agent Runtime.
 * Filters and assembles business tools based on capability bindings.
 */

import type {
  IndustryAdapter,
  CapabilityBinding,
} from '@claude-code-best/industry-adapter'

export interface BizTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface BuiltTools {
  bizTools: BizTool[]
  capabilityCount: number // total capabilities bound
}

/**
 * Filters adapter.getBizTools() to only those whose name appears in bindings
 * where binding.channel === 'tool'.
 * Returns filtered list + total binding count.
 */
export function buildTools(
  adapter: IndustryAdapter,
  bindings: CapabilityBinding[]
): BuiltTools {
  // Get all business tools from adapter
  const allBizTools = adapter.getBizTools()

  // Build a set of tool names that have 'tool' channel bindings
  const boundToolNames = new Set<string>()
  for (const binding of bindings) {
    if (binding.channel === 'tool') {
      boundToolNames.add(binding.capabilityName)
    }
  }

  // Filter tools to only those in the bound set
  const bizTools: BizTool[] = []
  for (const tool of allBizTools) {
    // Handle both object and unknown types from getBizTools()
    if (
      tool &&
      typeof tool === 'object' &&
      'name' in tool &&
      'description' in tool &&
      'inputSchema' in tool
    ) {
      const typedTool = tool as BizTool
      if (boundToolNames.has(typedTool.name)) {
        bizTools.push(typedTool)
      }
    }
  }

  return {
    bizTools,
    capabilityCount: bindings.length,
  }
}
