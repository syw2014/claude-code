import type { UUID, PermissionMode, TokenCounts, ConfirmRequest } from '../types.js'
import type { IndustryAdapter, RuleSet } from '@claude-code-best/industry-adapter'
import type { SessionStore, MemoryStore, RuleStore, PromptStore, KnowledgeStore, AuditWriter, SSEWriter } from '../stores.js'
import type { ContextEnvelope } from './ContextEnvelope.js'

/**
 * 运行时上下文对象。只在进程内流转，不可直接序列化入库。
 * 权威定义见 spec §14.2.1。请求级业务数据存于 envelope 字段。
 */
export interface SessionContext {
  // ── 原 bootstrap/state.ts 单例迁入 ──────────────────────────────────────
  sessionId: UUID
  traceId: UUID
  taskId?: UUID
  cwd: string
  projectRoot: string
  tokenCounts: TokenCounts
  permissionMode: PermissionMode
  modelOverride?: string

  // ── 行业上下文 ────────────────────────────────────────────────────────────
  industryCode: string
  userId: string
  tenantId: string
  industryAdapter: IndustryAdapter
  ruleSet: RuleSet

  // ── 审计上下文 ────────────────────────────────────────────────────────────
  auditWriter: AuditWriter

  // ── 外置存储访问（依赖注入，不可序列化）────────────────────────────────────
  sessionStore: SessionStore
  memoryStore: MemoryStore
  ruleStore: RuleStore
  promptStore: PromptStore
  knowledgeStore: KnowledgeStore

  // ── HITL 状态 ─────────────────────────────────────────────────────────────
  pendingConfirm?: ConfirmRequest
  sseWriter?: SSEWriter

  // ── 可序列化上下文快照（跨节点恢复时重建 SessionContext 后挂载）────────────
  envelope: ContextEnvelope
}
