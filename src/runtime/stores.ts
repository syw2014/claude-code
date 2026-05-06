// src/runtime/stores.ts
import type { UUID } from './types.js'
import type { NormalizedIntent } from '@claude-code-best/industry-adapter'

// ─── SessionStore（Redis 热状态）────────────────────────────────────────────

export interface SessionState {
  sessionId: UUID
  tenantId: string
  userId: string
  industryCode: string
  status: string
  currentTaskId?: UUID
  pendingConfirmId?: UUID
  updatedAt: string
}

export interface SessionStore {
  get(tenantId: string, sessionId: UUID): Promise<SessionState | null>
  set(tenantId: string, sessionId: UUID, state: SessionState): Promise<void>
  delete(tenantId: string, sessionId: UUID): Promise<void>
}

// ─── MemoryStore（长期记忆，PostgreSQL）─────────────────────────────────────

export interface MemoryItem {
  id: UUID
  memoryType: 'preference' | 'fact' | 'procedure' | 'summary'
  scope: 'user' | 'tenant' | 'industry'
  content: string
  metadata: Record<string, unknown>
}

export interface MemoryStore {
  recall(
    tenantId: string,
    userId: string,
    industryCode: string,
    limit?: number
  ): Promise<MemoryItem[]>
  save(tenantId: string, userId: string, industryCode: string, item: Omit<MemoryItem, 'id'>): Promise<UUID>
}

// ─── RuleStore（规则版本，Redis 热缓存 + PostgreSQL）─────────────────────────

export interface RuleStore {
  getActiveVersion(tenantId: string, industryCode: string): Promise<string>
  getRulesByVersion(tenantId: string, industryCode: string, version: string): Promise<unknown>
}

// ─── PromptStore（Prompt 模板，Redis 热缓存 + PostgreSQL）────────────────────

export interface PromptStore {
  getTemplate(tenantId: string, industryCode: string, templateKey: string): Promise<string>
  getIntentTemplates(industryCode: string): Promise<NormalizedIntent[]>
}

// ─── KnowledgeStore（向量检索，Milvus + PostgreSQL）──────────────────────────

export interface KnowledgeChunk {
  chunkId: string
  sourceId: string
  content: string
  score: number
}

export interface KnowledgeStore {
  query(
    tenantId: string,
    industryCode: string,
    queryText: string,
    topK?: number
  ): Promise<KnowledgeChunk[]>
}

// ─── AuditWriter（审计写入，Redis Stream）────────────────────────────────────

export interface AuditEventPayload {
  eventType: string
  severity: 'info' | 'warn' | 'error' | 'security'
  payload: Record<string, unknown>
  traceId: UUID
  sessionId: UUID
  taskId?: UUID
  toolCallId?: UUID
  confirmId?: UUID
  tenantId: string
  userId: string
  industryCode: string
}

export interface AuditWriter {
  record(event: AuditEventPayload): Promise<void>
  flush(): Promise<void>
}

// ─── SSEWriter（Server-Sent Events 推送）─────────────────────────────────────

export interface SSEEvent {
  type: string
  traceId: UUID
  sequence: number
  data: Record<string, unknown>
}

export interface SSEWriter {
  send(event: SSEEvent): void
  close(): void
}
