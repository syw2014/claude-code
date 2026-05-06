import type { Workflow, WorkflowStep } from '../../../src/types.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Inline minimal YAML parser ───────────────────────────────────────────────
// Handles the flat structure used in these workflow YAML files:
//   - Top-level scalar key: value
//   - steps: list of objects with scalar fields + nested params map

function trimQuotes(s: string): string {
  const t = s.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1)
  }
  return t
}

function parseScalarValue(raw: string): unknown {
  const s = raw.trim()
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null' || s === '~') return null
  if (s === '') return ''
  const n = Number(s)
  if (!Number.isNaN(n)) return n
  return trimQuotes(s)
}

function indentOf(line: string): number {
  let count = 0
  for (const ch of line) {
    if (ch === ' ') count++
    else break
  }
  return count
}

/**
 * Minimal YAML parser for the two-level workflow YAML structure.
 * Supports: top-level scalars, top-level arrays of objects, nested scalar maps.
 */
export function parseYaml(text: string): Record<string, unknown> {
  const lines = text.split('\n')
  const result: Record<string, unknown> = {}
  let i = 0

  function skipBlanks(): void {
    while (i < lines.length) {
      const t = lines[i]!.trim()
      if (t === '' || t.startsWith('#')) i++
      else break
    }
  }

  function parseMap(minIndent: number): Record<string, unknown> {
    const obj: Record<string, unknown> = {}
    while (i < lines.length) {
      skipBlanks()
      if (i >= lines.length) break
      const line = lines[i]!
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) { i++; continue }
      const ind = indentOf(line)
      if (ind < minIndent) break
      if (!trimmed.includes(':')) { i++; continue }
      const colonIdx = trimmed.indexOf(':')
      const key = trimmed.slice(0, colonIdx).trim()
      const rest = trimmed.slice(colonIdx + 1).trim()
      i++
      if (rest === '' || rest === '|' || rest === '>') {
        // Check if next non-blank line is a nested map or list
        skipBlanks()
        if (i < lines.length) {
          const nextLine = lines[i]!
          const nextTrimmed = nextLine.trim()
          if (nextTrimmed.startsWith('-')) {
            obj[key] = parseList(ind + 2)
          } else if (indentOf(nextLine) > ind) {
            obj[key] = parseMap(ind + 2)
          } else {
            obj[key] = null
          }
        } else {
          obj[key] = null
        }
      } else {
        obj[key] = parseScalarValue(rest)
      }
    }
    return obj
  }

  function parseList(minIndent: number): unknown[] {
    const items: unknown[] = []
    while (i < lines.length) {
      skipBlanks()
      if (i >= lines.length) break
      const line = lines[i]!
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) { i++; continue }
      const ind = indentOf(line)
      if (ind < minIndent - 2) break
      if (!trimmed.startsWith('-')) break

      // Parse list item: first field on same line as '-'
      const obj: Record<string, unknown> = {}
      const firstField = trimmed.slice(1).trim()
      if (firstField.includes(':')) {
        const fc = firstField.indexOf(':')
        const fk = firstField.slice(0, fc).trim()
        const fv = firstField.slice(fc + 1).trim()
        if (fv !== '') obj[fk] = parseScalarValue(fv)
      }
      const itemIndent = ind + 2
      i++

      // Parse remaining fields at itemIndent level
      while (i < lines.length) {
        skipBlanks()
        if (i >= lines.length) break
        const fieldLine = lines[i]!
        const fieldTrimmed = fieldLine.trim()
        if (fieldTrimmed === '' || fieldTrimmed.startsWith('#')) { i++; continue }
        const fieldInd = indentOf(fieldLine)
        if (fieldInd < itemIndent) break
        if (fieldTrimmed.startsWith('-')) break

        if (fieldTrimmed.includes(':')) {
          const fc = fieldTrimmed.indexOf(':')
          const fk = fieldTrimmed.slice(0, fc).trim()
          const fv = fieldTrimmed.slice(fc + 1).trim()
          if (fv === '' || fv === '|' || fv === '>') {
            // Nested map
            i++
            obj[fk] = parseMap(fieldInd + 2)
          } else {
            obj[fk] = parseScalarValue(fv)
            i++
          }
        } else {
          i++
        }
      }
      items.push(obj)
    }
    return items
  }

  // Bootstrap: parse top-level
  while (i < lines.length) {
    skipBlanks()
    if (i >= lines.length) break
    const line = lines[i]!
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) { i++; continue }
    if (indentOf(line) !== 0) { i++; continue }
    if (!trimmed.includes(':')) { i++; continue }

    const colonIdx = trimmed.indexOf(':')
    const key = trimmed.slice(0, colonIdx).trim()
    const rest = trimmed.slice(colonIdx + 1).trim()
    i++

    if (rest === '' || rest === '|' || rest === '>') {
      skipBlanks()
      if (i < lines.length) {
        const nextLine = lines[i]!
        const nextTrimmed = nextLine.trim()
        if (nextTrimmed.startsWith('-')) {
          result[key] = parseList(2)
        } else if (indentOf(nextLine) > 0) {
          result[key] = parseMap(2)
        } else {
          result[key] = null
        }
      } else {
        result[key] = null
      }
    } else {
      result[key] = parseScalarValue(rest)
    }
  }

  return result
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateWorkflow(raw: Record<string, unknown>, sourceName: string): Workflow {
  if (typeof raw.name !== 'string') {
    throw new Error(`[WorkflowLoader] ${sourceName}: missing or invalid 'name' field`)
  }
  if (typeof raw.description !== 'string') {
    throw new Error(`[WorkflowLoader] ${sourceName}: missing or invalid 'description' field`)
  }
  if (typeof raw.industry !== 'string') {
    throw new Error(`[WorkflowLoader] ${sourceName}: missing or invalid 'industry' field`)
  }
  if (!Array.isArray(raw.steps)) {
    throw new Error(`[WorkflowLoader] ${sourceName}: 'steps' must be an array`)
  }

  const steps: WorkflowStep[] = raw.steps.map((s: unknown, idx: number) => {
    if (typeof s !== 'object' || s === null) {
      throw new Error(`[WorkflowLoader] ${sourceName}: step[${idx}] is not an object`)
    }
    const step = s as Record<string, unknown>
    if (typeof step.id !== 'string') {
      throw new Error(`[WorkflowLoader] ${sourceName}: step[${idx}] missing 'id'`)
    }
    if (typeof step.tool !== 'string') {
      throw new Error(`[WorkflowLoader] ${sourceName}: step[${idx}] missing 'tool'`)
    }
    const params = (typeof step.params === 'object' && step.params !== null)
      ? (step.params as Record<string, unknown>)
      : {}
    const onError = step.onError as WorkflowStep['onError'] | undefined
    if (
      onError !== undefined &&
      onError !== 'abort' &&
      onError !== 'continue' &&
      onError !== 'retry'
    ) {
      throw new Error(
        `[WorkflowLoader] ${sourceName}: step[${idx}] invalid onError value '${String(onError)}'`
      )
    }
    return { id: step.id, tool: step.tool, params, onError }
  })

  return {
    name: raw.name,
    description: raw.description,
    industry: raw.industry,
    steps,
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export const WORKFLOW_NAMES = ['checkout-flow', 'return-flow', 'renew-flow'] as const
export type WorkflowName = (typeof WORKFLOW_NAMES)[number]

const __dir = dirname(fileURLToPath(import.meta.url))

export function loadWorkflow(name: WorkflowName): Workflow {
  const filePath = join(__dir, `${name}.yaml`)
  const text = readFileSync(filePath, 'utf8')
  const raw = parseYaml(text)
  return validateWorkflow(raw, name)
}

export function loadAllWorkflows(): Workflow[] {
  return WORKFLOW_NAMES.map(name => loadWorkflow(name))
}
