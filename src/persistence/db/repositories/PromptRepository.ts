import type { PromptStore } from 'src/runtime/stores.js'

export interface PromptTemplate {
  id: string
  industryCode: string
  version: number
  content: string // markdown template body
  isActive: boolean
  createdAt: string // ISO string
}

export interface PromptRepository extends PromptStore {
  // inherits: getTemplate(tenantId, industryCode, templateKey): Promise<string>
  // inherits: getIntentTemplates(industryCode): Promise<NormalizedIntent[]>

  upsert(template: Omit<PromptTemplate, 'createdAt'>): Promise<PromptTemplate>
  getById(id: string): Promise<PromptTemplate | null>
  setActive(id: string, isActive: boolean): Promise<void>
  listTemplates(industryCode: string): Promise<Array<{ id: string; version: number }>>
}

/**
 * In-memory PromptRepository.
 * Production: replace with PostgreSQL (prompt_templates table).
 */
export class InMemoryPromptRepository implements PromptRepository {
  private store = new Map<string, PromptTemplate>()

  async upsert(template: Omit<PromptTemplate, 'createdAt'>): Promise<PromptTemplate> {
    const existing = this.store.get(template.id)
    const now = new Date().toISOString()
    const result: PromptTemplate = {
      ...template,
      createdAt: existing?.createdAt ?? now,
    }
    this.store.set(template.id, result)
    return result
  }

  async getById(id: string): Promise<PromptTemplate | null> {
    return this.store.get(id) ?? null
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const existing = this.store.get(id)
    if (!existing) return
    this.store.set(id, {
      ...existing,
      isActive,
    })
  }

  async getTemplate(_tenantId: string, industryCode: string, templateKey: string): Promise<string> {
    // Find active template for this industry + key
    for (const template of this.store.values()) {
      if (template.industryCode === industryCode && template.id === templateKey && template.isActive) {
        return template.content
      }
    }
    // Return empty string if not found (consistent with store interface)
    return ''
  }

  async getIntentTemplates(_industryCode: string) {
    // Return empty array - this is a stub implementation
    // In production, this would return intent-specific templates
    return []
  }

  async listTemplates(industryCode: string): Promise<Array<{ id: string; version: number }>> {
    const results: Array<{ id: string; version: number }> = []
    for (const template of this.store.values()) {
      if (template.industryCode === industryCode) {
        results.push({ id: template.id, version: template.version })
      }
    }
    results.sort((a, b) => b.version - a.version)
    return results
  }

  size(): number {
    return this.store.size
  }
}
