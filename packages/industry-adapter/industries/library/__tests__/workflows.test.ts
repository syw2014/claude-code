import { describe, test, expect } from 'bun:test'
import {
  loadWorkflow,
  loadAllWorkflows,
  parseYaml,
} from '../workflows/loader.js'

// ─── parseYaml ───────────────────────────────────────────────────────────────

describe('parseYaml', () => {
  test('parses top-level scalar fields', () => {
    const yaml = `
name: checkout-flow
description: 借书全流程
industry: library
`
    const result = parseYaml(yaml)
    expect(result.name).toBe('checkout-flow')
    expect(result.description).toBe('借书全流程')
    expect(result.industry).toBe('library')
  })

  test('parses steps array with scalar fields', () => {
    const yaml = `
name: test-flow
description: test
industry: library
steps:
  - id: step1
    tool: my_tool
    onError: abort
`
    const result = parseYaml(yaml)
    expect(Array.isArray(result.steps)).toBe(true)
    const steps = result.steps as unknown[]
    expect(steps).toHaveLength(1)
    const step = steps[0] as Record<string, unknown>
    expect(step.id).toBe('step1')
    expect(step.tool).toBe('my_tool')
    expect(step.onError).toBe('abort')
  })

  test('parses nested params map', () => {
    const yaml = `
name: test-flow
description: test
industry: library
steps:
  - id: step1
    tool: my_tool
    params:
      readerId: "{{readerId}}"
      bookId: "{{bookId}}"
    onError: abort
`
    const result = parseYaml(yaml)
    const steps = result.steps as unknown[]
    const step = steps[0] as Record<string, unknown>
    const params = step.params as Record<string, unknown>
    expect(params.readerId).toBe('{{readerId}}')
    expect(params.bookId).toBe('{{bookId}}')
  })

  test('parses multiple steps', () => {
    const yaml = `
name: test-flow
description: test
industry: library
steps:
  - id: step1
    tool: tool_a
    params:
      x: "{{x}}"
    onError: abort
  - id: step2
    tool: tool_b
    params:
      y: "{{y}}"
    onError: continue
`
    const result = parseYaml(yaml)
    const steps = result.steps as unknown[]
    expect(steps).toHaveLength(2)
    const s0 = steps[0] as Record<string, unknown>
    const s1 = steps[1] as Record<string, unknown>
    expect(s0.id).toBe('step1')
    expect(s1.id).toBe('step2')
    expect(s1.onError).toBe('continue')
  })

  test('handles missing optional fields gracefully', () => {
    const yaml = `
name: test-flow
description: test
industry: library
steps:
  - id: step1
    tool: tool_a
`
    const result = parseYaml(yaml)
    const steps = result.steps as unknown[]
    const step = steps[0] as Record<string, unknown>
    expect(step.onError).toBeUndefined()
    expect(step.params).toBeUndefined()
  })
})

// ─── loadWorkflow ─────────────────────────────────────────────────────────────

describe('loadWorkflow', () => {
  test('loads checkout-flow', () => {
    const w = loadWorkflow('checkout-flow')
    expect(w.name).toBe('checkout-flow')
    expect(w.industry).toBe('library')
    expect(w.description).toBeTypeOf('string')
    expect(w.description.length).toBeGreaterThan(0)
    expect(Array.isArray(w.steps)).toBe(true)
    expect(w.steps.length).toBeGreaterThan(0)
  })

  test('checkout-flow has query_reader as first step', () => {
    const w = loadWorkflow('checkout-flow')
    expect(w.steps[0]!.tool).toBe('query_reader')
    expect(w.steps[0]!.onError).toBe('abort')
  })

  test('checkout-flow has checkout_book step', () => {
    const w = loadWorkflow('checkout-flow')
    const checkoutStep = w.steps.find(s => s.tool === 'checkout_book')
    expect(checkoutStep).toBeDefined()
    expect(checkoutStep!.params).toMatchObject({
      bookId: '{{bookId}}',
      readerId: '{{readerId}}',
    })
  })

  test('loads return-flow', () => {
    const w = loadWorkflow('return-flow')
    expect(w.name).toBe('return-flow')
    expect(w.industry).toBe('library')
    const toolNames = w.steps.map(s => s.tool)
    expect(toolNames).toContain('return_book')
    expect(toolNames[0]).toBe('query_reader')
  })

  test('loads renew-flow', () => {
    const w = loadWorkflow('renew-flow')
    expect(w.name).toBe('renew-flow')
    expect(w.industry).toBe('library')
    const toolNames = w.steps.map(s => s.tool)
    expect(toolNames).toContain('renew_book')
  })

  test('each step has id, tool, and params fields', () => {
    const w = loadWorkflow('checkout-flow')
    for (const step of w.steps) {
      expect(typeof step.id).toBe('string')
      expect(step.id.length).toBeGreaterThan(0)
      expect(typeof step.tool).toBe('string')
      expect(step.tool.length).toBeGreaterThan(0)
      expect(typeof step.params).toBe('object')
      expect(step.params).not.toBeNull()
    }
  })

  test('step params use {{placeholder}} syntax', () => {
    const w = loadWorkflow('checkout-flow')
    for (const step of w.steps) {
      for (const val of Object.values(step.params)) {
        if (typeof val === 'string') {
          expect(val).toMatch(/^\{\{\w+\}\}$/)
        }
      }
    }
  })
})

// ─── loadAllWorkflows ─────────────────────────────────────────────────────────

describe('loadAllWorkflows', () => {
  test('returns array of 4 workflows', () => {
    const workflows = loadAllWorkflows()
    expect(workflows).toHaveLength(4)
  })

  test('includes checkout-flow, return-flow, renew-flow, dispute-flow', () => {
    const workflows = loadAllWorkflows()
    const names = workflows.map(w => w.name)
    expect(names).toContain('checkout-flow')
    expect(names).toContain('return-flow')
    expect(names).toContain('renew-flow')
    expect(names).toContain('dispute-flow')
  })

  test('all workflows belong to library industry', () => {
    const workflows = loadAllWorkflows()
    for (const w of workflows) {
      expect(w.industry).toBe('library')
    }
  })

  test('all workflows have at least 2 steps', () => {
    const workflows = loadAllWorkflows()
    for (const w of workflows) {
      expect(w.steps.length).toBeGreaterThanOrEqual(2)
    }
  })
})
