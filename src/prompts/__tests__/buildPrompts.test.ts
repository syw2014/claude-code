import { describe, test, expect } from 'bun:test'
import {
  buildSystemPrompt,
  type SystemPromptInput,
} from '../buildSystemPrompt.js'
import {
  buildUserMessage,
  type UserMessageInput,
} from '../buildUserMessage.js'
import { buildTools, type BuiltTools } from '../buildTools.js'
import type {
  NormalizedIntent,
  BizRef,
  IndustryAdapter,
  CapabilityBinding,
} from '@claude-code-best/industry-adapter'

// ─── Fixtures ─────────────────────────────────────────────────────────────

function createMockIntent(): NormalizedIntent {
  return {
    sceneCode: 'order',
    actionCode: 'create',
    confidence: 0.95,
    pathType: 'fast',
    requiredParams: ['product_id', 'quantity'],
    rawInput: 'create an order for 5 units',
  }
}

function createMockBizRef(): BizRef {
  return {
    type: 'order',
    id: 'ORD-001',
    displayName: 'Order 001',
    status: 'pending',
    attrs: { createdAt: '2025-05-06T00:00:00Z' },
    constraints: [],
    sourceSystem: 'erp',
    snapshotAt: '2025-05-06T10:00:00Z',
  }
}

function createMockBizTool(): { name: string; description: string; inputSchema: Record<string, unknown> } {
  return {
    name: 'create_order',
    description: 'Creates a new order in the system',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        quantity: { type: 'number' },
      },
      required: ['product_id', 'quantity'],
    },
  }
}

function createMockIndustryAdapter(): IndustryAdapter {
  const tools = [
    createMockBizTool(),
    {
      name: 'update_order',
      description: 'Updates an existing order',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
    {
      name: 'cancel_order',
      description: 'Cancels an order',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: { type: 'string' },
        },
      },
    },
  ]

  return {
    industryCode: 'retail',
    semanticMapper: {} as any,
    bizRefBuilder: {} as any,
    capabilityGateway: {} as any,
    getBizTools: () => tools,
    getBizSkills: () => [],
    getBizWorkflows: () => [],
    getRules: () => ({ version: '1.0' } as any),
  }
}

// ─── Tests: buildSystemPrompt ──────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  test('includes template and appends knowledge section when snippets provided', () => {
    const input: SystemPromptInput = {
      industryCode: 'retail',
      industryPromptTemplate: 'You are a retail assistant.',
      knowledgeSnippets: ['Knowledge item 1', 'Knowledge item 2'],
      ruleVersion: '2.1.0',
      tenantId: 'tenant-123',
    }

    const result = buildSystemPrompt(input)

    expect(result).toContain('You are a retail assistant.')
    expect(result).toContain('## Knowledge')
    expect(result).toContain('Knowledge item 1')
    expect(result).toContain('Knowledge item 2')
    expect(result).toContain('Rule version: 2.1.0')
    expect(result).toContain('Tenant: tenant-123')
    expect(result).toContain('Industry: retail')
  })

  test('no knowledge section when snippets array is empty', () => {
    const input: SystemPromptInput = {
      industryCode: 'retail',
      industryPromptTemplate: 'You are a helpful assistant.',
      knowledgeSnippets: [],
      ruleVersion: '1.0.0',
      tenantId: 'tenant-456',
    }

    const result = buildSystemPrompt(input)

    expect(result).toContain('You are a helpful assistant.')
    expect(result).not.toContain('## Knowledge')
    expect(result).toContain('Rule version: 1.0.0')
    expect(result).toContain('Tenant: tenant-456')
    expect(result).toContain('Industry: retail')
  })

  test('knowledge snippets are separated by separator line', () => {
    const input: SystemPromptInput = {
      industryCode: 'retail',
      industryPromptTemplate: 'Template',
      knowledgeSnippets: ['Snippet A', 'Snippet B', 'Snippet C'],
      ruleVersion: '1.0.0',
      tenantId: 'tenant-789',
    }

    const result = buildSystemPrompt(input)

    const knowledge = result.split('## Knowledge')[1].split('---\nRule')[0]
    expect(knowledge).toContain('---')
    expect(knowledge.match(/---/g)?.length).toBe(2) // 2 separators between 3 snippets
  })
})

// ─── Tests: buildUserMessage ──────────────────────────────────────────────

describe('buildUserMessage', () => {
  test('produces correct role=user and includes intent context block', () => {
    const intent = createMockIntent()
    const input: UserMessageInput = {
      userText: 'I need help with an order',
      intent,
      bizRefs: { order: createMockBizRef() },
    }

    const result = buildUserMessage(input)

    expect(result.role).toBe('user')
    expect(result.content).toContain('I need help with an order')
    expect(result.content).toContain('<context>')
    expect(result.content).toContain('</context>')
    expect(result.content).toContain('Intent: order/create')
    expect(result.content).toContain('confidence=0.95')
    expect(result.content).toContain('BizRefs:')
  })

  test('empty bizRefs still produces valid output', () => {
    const intent = createMockIntent()
    const input: UserMessageInput = {
      userText: 'Create an order',
      intent,
      bizRefs: {},
    }

    const result = buildUserMessage(input)

    expect(result.role).toBe('user')
    expect(result.content).toContain('Create an order')
    expect(result.content).toContain('<context>')
    expect(result.content).toContain('Intent: order/create')
    expect(result.content).toContain('BizRefs: []')
  })

  test('includes all bizRef keys in context block', () => {
    const intent = createMockIntent()
    const bizRefs = {
      order: createMockBizRef(),
      customer: {
        type: 'customer',
        id: 'CUST-001',
        attrs: {},
        constraints: [],
        sourceSystem: 'crm',
        snapshotAt: '2025-05-06T10:00:00Z',
      },
    }

    const input: UserMessageInput = {
      userText: 'Process order',
      intent,
      bizRefs,
    }

    const result = buildUserMessage(input)

    expect(result.content).toContain('BizRefs: ["order","customer"]')
  })
})

// ─── Tests: buildTools ─────────────────────────────────────────────────────

describe('buildTools', () => {
  test('filters tools to only those in bindings with channel=tool', () => {
    const adapter = createMockIndustryAdapter()
    const bindings: CapabilityBinding[] = [
      {
        channel: 'tool',
        capabilityName: 'create_order',
        permissionLevel: 'high',
        confirmLevel: 'explicit_confirm',
      },
      {
        channel: 'tool',
        capabilityName: 'update_order',
        permissionLevel: 'medium',
        confirmLevel: 'silent_confirm',
      },
      {
        channel: 'skill',
        capabilityName: 'some_skill',
        permissionLevel: 'low',
        confirmLevel: 'auto',
      },
    ]

    const result = buildTools(adapter, bindings)

    expect(result.bizTools).toHaveLength(2)
    expect(result.bizTools.map(t => t.name)).toEqual([
      'create_order',
      'update_order',
    ])
    expect(result.bizTools.some(t => t.name === 'cancel_order')).toBe(false)
  })

  test('returns correct capabilityCount equal to total bindings length', () => {
    const adapter = createMockIndustryAdapter()
    const bindings: CapabilityBinding[] = [
      {
        channel: 'tool',
        capabilityName: 'create_order',
        permissionLevel: 'high',
        confirmLevel: 'explicit_confirm',
      },
      {
        channel: 'skill',
        capabilityName: 'skill_1',
        permissionLevel: 'medium',
        confirmLevel: 'silent_confirm',
      },
      {
        channel: 'workflow',
        capabilityName: 'workflow_1',
        permissionLevel: 'low',
        confirmLevel: 'auto',
      },
      {
        channel: 'subagent',
        capabilityName: 'agent_1',
        permissionLevel: 'high',
        confirmLevel: 'supervisor_approval',
      },
    ]

    const result = buildTools(adapter, bindings)

    expect(result.capabilityCount).toBe(4)
  })

  test('handles empty bindings list', () => {
    const adapter = createMockIndustryAdapter()
    const bindings: CapabilityBinding[] = []

    const result = buildTools(adapter, bindings)

    expect(result.bizTools).toHaveLength(0)
    expect(result.capabilityCount).toBe(0)
  })

  test('ignores non-tool channel bindings', () => {
    const adapter = createMockIndustryAdapter()
    const bindings: CapabilityBinding[] = [
      {
        channel: 'skill',
        capabilityName: 'create_order', // tool name, but skill channel
        permissionLevel: 'low',
        confirmLevel: 'auto',
      },
      {
        channel: 'workflow',
        capabilityName: 'update_order', // tool name, but workflow channel
        permissionLevel: 'medium',
        confirmLevel: 'silent_confirm',
      },
    ]

    const result = buildTools(adapter, bindings)

    expect(result.bizTools).toHaveLength(0)
    expect(result.capabilityCount).toBe(2)
  })
})
