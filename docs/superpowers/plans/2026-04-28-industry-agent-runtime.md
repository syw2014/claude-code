# 行业 Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 Claude Code 代码库二次开发，构建支持多行业、高并发、全审计链路的 Agent Runtime 后端服务。

**Architecture:** 保留 Claude Code 现有 provider/tool/MCP 能力，新增 `packages/industry-adapter` workspace 包和 `src/runtime/`、`src/server/`、`src/persistence/`、`src/audit/` 四个模块目录。SessionContext 替换模块级单例实现高并发，ContextEnvelope 承载可序列化快照，IndustryAdapter 插拔式隔离行业差异。

**Tech Stack:** TypeScript strict, Bun workspace, bun:test, PostgreSQL 15, Redis 7, Milvus 2.x, Fastify

**Spec:** `docs/superpowers/specs/2026-04-27-industry-agent-runtime-design.md`

---

## 说明

本计划分 6 个阶段（A-F），与 spec §14.11 对应。**Phase A（本文档）完整 TDD 步骤**；Phase B-F 为任务骨架，在对应阶段开始前补全细节。

---

# Phase A：基础设施与契约

**交付物：** workspace 包骨架、全量 TypeScript 类型契约、PostgreSQL 13 张表迁移文件、Redis key builder、typecheck 零错误。

**前置条件：** 无（此阶段不依赖任何外部服务，无需真实 DB 连接）。

---

## 文件结构总览

```
packages/industry-adapter/          [新建 workspace 包]
  package.json
  tsconfig.json
  src/
    index.ts
    types.ts                        ← Task 3：行业域类型（IndustryAdapter, BizRef, NormalizedIntent 等）
    __tests__/types.test.ts

src/runtime/                        [新建]
  types.ts                          ← Task 4：运行时标量类型和状态枚举
  stores.ts                         ← Task 5：Store / Writer 接口
  context/
    ContextEnvelope.ts              ← Task 6：可序列化上下文快照
    SessionContext.ts               ← Task 7：运行时上下文对象
    __tests__/
      ContextEnvelope.test.ts
      SessionContext.test.ts

src/server/                         [新建]
  schemas/
    errors.ts                       ← Task 8
    api.ts                          ← Task 8
  sse/
    types.ts                        ← Task 9
    __tests__/sse-types.test.ts

src/audit/                          [新建]
  types.ts                          ← Task 10
  __tests__/types.test.ts

src/persistence/                    [新建]
  db/
    migrations/
      001_core.sql                  ← Task 11（sessions, tasks, messages）
      002_audit.sql                 ← Task 12（tool_calls, confirms, audit_events, summaries）
      003_content.sql               ← Task 13（memory, rules, prompts, knowledge, adapters）
    __tests__/migrations.test.ts
  redis/
    keys.ts                         ← Task 14
    __tests__/keys.test.ts

tsconfig.json                       [修改] 新增 paths + include
```

**依赖方向（无循环）：**
```
packages/industry-adapter/src/types.ts   ← 无项目内导入
src/runtime/types.ts                     ← 导入 @claude-code-best/industry-adapter
src/runtime/stores.ts                    ← 导入 src/runtime/types
src/runtime/context/ContextEnvelope.ts   ← 导入 runtime/types + industry-adapter
src/runtime/context/SessionContext.ts    ← 导入以上所有
src/server/schemas/*.ts                  ← 导入 runtime/types + industry-adapter
src/audit/types.ts                       ← 导入 runtime/types
```

---

## Task 1：注册 industry-adapter workspace 包

**Files:**
- Create: `packages/industry-adapter/package.json`
- Create: `packages/industry-adapter/tsconfig.json`
- Create: `packages/industry-adapter/src/index.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1：创建 package.json**

```json
// packages/industry-adapter/package.json
{
  "name": "@claude-code-best/industry-adapter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts"
  }
}
```

- [ ] **Step 2：创建 tsconfig.json**

```json
// packages/industry-adapter/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3：创建空导出入口**

```typescript
// packages/industry-adapter/src/index.ts
export * from './types.js'
```

- [ ] **Step 4：在根 tsconfig.json 添加路径映射**

在 `tsconfig.json` 的 `compilerOptions.paths` 中添加：

```json
"@claude-code-best/industry-adapter": ["./packages/industry-adapter/src/index.ts"],
"@claude-code-best/industry-adapter/*": ["./packages/industry-adapter/src/*"]
```

- [ ] **Step 5：验证包可解析**

```bash
bun install
bun run typecheck
```

Expected: typecheck 通过，无新增错误。

- [ ] **Step 6：Commit**

```bash
git add packages/industry-adapter/ tsconfig.json
git commit -m "feat: 注册 industry-adapter workspace 包"
```

---

## Task 2：创建 src 新目录骨架

**Files:**
- Create: `src/runtime/index.ts`
- Create: `src/server/index.ts`
- Create: `src/persistence/index.ts`
- Create: `src/audit/index.ts`

- [ ] **Step 1：创建四个骨架文件**

```typescript
// src/runtime/index.ts
export {}
```

```typescript
// src/server/index.ts
export {}
```

```typescript
// src/persistence/index.ts
export {}
```

```typescript
// src/audit/index.ts
export {}
```

- [ ] **Step 2：验证 typecheck 通过**

```bash
bun run typecheck
```

Expected: 零错误。

- [ ] **Step 3：Commit**

```bash
git add src/runtime/index.ts src/server/index.ts src/persistence/index.ts src/audit/index.ts
git commit -m "feat: 创建 runtime/server/persistence/audit 目录骨架"
```

---

## Task 3：行业域类型（industry-adapter/types.ts）

**Files:**
- Create: `packages/industry-adapter/src/types.ts`
- Create: `packages/industry-adapter/src/__tests__/types.test.ts`

这是整个类型系统的基础，不导入任何项目内模块。

- [ ] **Step 1：创建类型文件**

```typescript
// packages/industry-adapter/src/types.ts

// ─── 标量 ────────────────────────────────────────────────────────────────────

export type UUID = string

export type PermissionLevel = 'low' | 'medium' | 'high'

export type ConfirmLevel =
  | 'auto'
  | 'silent_confirm'
  | 'explicit_confirm'
  | 'supervisor_approval'

export type ApproverRole = 'user' | 'librarian' | 'supervisor' | 'admin'

// ─── 意图识别 ─────────────────────────────────────────────────────────────────

export interface NormalizedIntent {
  sceneCode: string
  actionCode: string
  confidence: number
  pathType: 'fast' | 'complex'
  requiredParams: string[]
  rawInput: string
}

export interface IntentTemplate {
  sceneCode: string
  pathType: 'fast' | 'complex'
  examples: string[]
  requiredParams: string[]
}

export interface ConfidenceScore {
  keywordMatch: number        // 关键词精确命中，0-1
  embeddingSimilarity: number // 意图模板余弦相似度，0-1
  structureMatch: number      // 必填参数完整度，0-1
  contextConsistency: number  // 会话历史一致性，0-1
}

// ─── 业务对象 ─────────────────────────────────────────────────────────────────

export interface BizRef {
  type: string
  id: string
  displayName?: string
  status?: string
  attrs: Record<string, unknown>
  constraints: string[]
  sourceSystem: string
  snapshotAt: string
}

export interface FactSet {
  facts: Record<string, unknown>
  sources: Array<{ key: string; source: string; confidence?: number }>
  builtAt: string
}

// ─── 规则引擎 ─────────────────────────────────────────────────────────────────

export interface RuleCheckInput {
  tenantId: string
  industryCode: string
  ruleVersion: string
  operation: string
  userId: string
  userRole: string
  bizRefs: Record<string, BizRef>
  factSet: FactSet
  context: Record<string, unknown>
}

export interface MatchedRule {
  ruleId: string
  severity: 'info' | 'warn' | 'block'
  reason: string
}

export interface RuleCheckResult {
  result: 'PASS' | 'WARN' | 'BLOCKED'
  ruleVersion: string
  matchedRules: MatchedRule[]
  warnings: string[]
  requiredConfirmLevel: ConfirmLevel
  requiredApproverRole?: ApproverRole
}

export interface RuleSet {
  version: string
  check(input: RuleCheckInput): RuleCheckResult
}

// ─── ContextEnvelope 绑定类型 ─────────────────────────────────────────────────

export interface RuleBinding {
  ruleId: string
  ruleVersion: string
  operation: string
  result: 'PASS' | 'WARN' | 'BLOCKED'
  reasons: string[]
}

export interface CapabilityBinding {
  channel: 'tool' | 'skill' | 'workflow' | 'subagent'
  capabilityName: string
  permissionLevel: PermissionLevel
  confirmLevel: ConfirmLevel
}

// ─── 能力对象 ─────────────────────────────────────────────────────────────────

export interface Skill {
  name: string
  description: string
  content: string
  industry: string
  requiresTools: string[]
  permissionLevel: PermissionLevel
}

export interface WorkflowStep {
  id: string
  tool: string
  params: Record<string, unknown>
  onError?: 'abort' | 'continue' | 'retry'
}

export interface Workflow {
  name: string
  description: string
  industry: string
  steps: WorkflowStep[]
}

// ─── Adapter 组件接口 ─────────────────────────────────────────────────────────

export interface SemanticMapper {
  /** 将用户输入映射为标准意图，含置信度计算（embedding + 关键词 + 结构 + 上下文）*/
  map(
    input: string,
    tenantId: string,
    sessionHistory?: NormalizedIntent[]
  ): Promise<NormalizedIntent>
}

export interface BizRefBuilder {
  /** 从行业业务系统拉取业务对象，构建 BizRef Map 和 FactSet */
  build(
    intent: NormalizedIntent,
    tenantId: string
  ): Promise<{ bizRefs: Record<string, BizRef>; factSet: FactSet }>
}

export interface CapabilityGateway {
  /** 根据意图和业务对象决定走哪个能力通道（tool/skill/workflow/subagent）*/
  route(
    intent: NormalizedIntent,
    bizRefs: Record<string, BizRef>
  ): CapabilityBinding[]
}

// ─── IndustryAdapter ─────────────────────────────────────────────────────────

export interface IndustryAdapter {
  industryCode: string
  semanticMapper: SemanticMapper
  bizRefBuilder: BizRefBuilder
  capabilityGateway: CapabilityGateway
  getBizTools(): unknown[]   // Tool[] — 避免循环依赖，使用时由调用方断言
  getBizSkills(): Skill[]
  getBizWorkflows(): Workflow[]
  getRules(): RuleSet
}
```

- [ ] **Step 2：写类型兼容性测试**

```typescript
// packages/industry-adapter/src/__tests__/types.test.ts
import { describe, test, expect } from 'bun:test'
import type {
  NormalizedIntent,
  BizRef,
  FactSet,
  RuleCheckResult,
  IndustryAdapter,
  ConfirmLevel,
} from '../types.js'

describe('industry-adapter types', () => {
  test('NormalizedIntent 字段齐备', () => {
    const intent: NormalizedIntent = {
      sceneCode: 'CIRCULATION_CHECKOUT',
      actionCode: 'ACTION_INIT',
      confidence: 0.97,
      pathType: 'fast',
      requiredParams: ['readerId', 'copyId'],
      rawInput: '扫码借书，读者A，馆藏B',
    }
    expect(intent.pathType).toBe('fast')
    expect(intent.requiredParams).toHaveLength(2)
  })

  test('BizRef 字段齐备', () => {
    const ref: BizRef = {
      type: 'READER',
      id: 'reader_001',
      status: 'ACTIVE',
      attrs: { quota: 5, overdue: 0 },
      constraints: [],
      sourceSystem: 'library-ils',
      snapshotAt: new Date().toISOString(),
    }
    expect(ref.constraints).toEqual([])
  })

  test('RuleCheckResult 合法 severity 值', () => {
    const results: Array<RuleCheckResult['result']> = ['PASS', 'WARN', 'BLOCKED']
    expect(results).toHaveLength(3)
  })

  test('ConfirmLevel 合法值', () => {
    const levels: ConfirmLevel[] = [
      'auto',
      'silent_confirm',
      'explicit_confirm',
      'supervisor_approval',
    ]
    expect(levels).toHaveLength(4)
  })

  test('FactSet sources 含 confidence 可选字段', () => {
    const fs: FactSet = {
      facts: { overdueCount: 2 },
      sources: [
        { key: 'overdueCount', source: 'library-ils' },
        { key: 'quota', source: 'library-ils', confidence: 1.0 },
      ],
      builtAt: new Date().toISOString(),
    }
    expect(fs.sources[0].confidence).toBeUndefined()
    expect(fs.sources[1].confidence).toBe(1.0)
  })
})
```

- [ ] **Step 3：运行测试，确认通过**

```bash
bun test packages/industry-adapter/src/__tests__/types.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 4：Commit**

```bash
git add packages/industry-adapter/src/
git commit -m "feat: 定义 industry-adapter 行业域类型（IndustryAdapter, BizRef, NormalizedIntent 等）"
```

---

## Task 4：运行时标量类型和状态枚举（src/runtime/types.ts）

**Files:**
- Create: `src/runtime/types.ts`
- Create: `src/runtime/__tests__/types.test.ts`

- [ ] **Step 1：创建 src/runtime/types.ts**

```typescript
// src/runtime/types.ts
import type { BizRef, FactSet, ConfirmLevel, ApproverRole } from '@claude-code-best/industry-adapter'

export type UUID = string

// ─── 权限模式（原 bootstrap/state.ts permissionMode）────────────────────────

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'

// ─── 状态枚举 ─────────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'created'
  | 'active'
  | 'waiting_human'
  | 'closing'
  | 'closed'
  | 'failed'
  | 'expired'

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_confirm'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'timeout'
  | 'cancelled'

export type ToolCallStatus =
  | 'planned'
  | 'permission_checking'
  | 'waiting_confirm'
  | 'executing'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'timeout'
  | 'cancelled'

export type ConfirmStatus =
  | 'pending'
  | 'escalated'
  | 'approved'
  | 'rejected'
  | 'timeout'
  | 'cancelled'

// ─── 通用基础类型 ─────────────────────────────────────────────────────────────

export interface ApiError {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export interface TokenCounts {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface RunRef {
  type: 'session' | 'task' | 'tool_call' | 'workflow' | 'subagent'
  id: UUID
  traceId: UUID
}

// ─── ContextEnvelope 支持类型 ─────────────────────────────────────────────────

export interface MemoryRef {
  memoryId: UUID
  memoryType: 'preference' | 'fact' | 'procedure' | 'summary'
  scope: 'user' | 'tenant' | 'industry'
  summary: string
}

export interface ToolResultSummary {
  toolCallId: UUID
  toolName: string
  channel: 'common_tool' | 'biz_tool' | 'mcp_tool' | 'workflow_tool'
  status: ToolCallStatus
  outputSummary: string
  durationMs?: number
  turnId: UUID
}

/** priorToolResults 超过阈值时的压缩摘要（见 spec §14.2.4）*/
export interface CompactedSummary {
  type: 'compacted_summary'
  count: number
  rangeStartTurnId: UUID
  rangeEndTurnId: UUID
  summary: string
}

export interface PromptRef {
  templateKey: string
  version: string
  chunkIds?: string[]   // 知识库 chunk 引用，用于审计
}

export interface CostState {
  inputTokensTotal: number
  outputTokensTotal: number
  budgetInputTokens?: number
  budgetOutputTokens?: number
  budgetExceeded: boolean
}

export interface PlanStep {
  id: string
  description: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  toolName?: string
}

export interface PlanState {
  planId: UUID
  steps: PlanStep[]
  currentStepIndex: number
  createdAt: string
  updatedAt: string
}

// ─── TaskRun 和 ToolCallRecord ────────────────────────────────────────────────

export type TaskMode = 'fast' | 'agent' | 'workflow' | 'subagent'

export interface TaskRun {
  id: UUID
  sessionId: UUID
  traceId: UUID
  tenantId: string
  userId: string
  industryCode: string
  input: string
  mode: TaskMode
  status: TaskStatus
  startedAt?: string
  completedAt?: string
}

export interface ToolCallRecord {
  id: UUID
  taskId: UUID
  traceId: UUID
  name: string
  channel: 'common_tool' | 'biz_tool' | 'mcp_tool' | 'workflow_tool'
  status: ToolCallStatus
  input: unknown
  output?: unknown
  error?: ApiError
  durationMs?: number
}

// ─── ConfirmRequest ───────────────────────────────────────────────────────────

export interface ConfirmRequest {
  id: UUID
  sessionId: UUID
  taskId: UUID
  traceId: UUID
  operation: string
  confirmLevel: ConfirmLevel
  requiredApproverRole: ApproverRole
  bizRefs: Record<string, BizRef>
  factSet: FactSet
  ruleWarnings: string[]
  expiresAt: string
}

// Re-export from industry-adapter for callers that only import from runtime/types
export type { ConfirmLevel, ApproverRole, BizRef, FactSet } from '@claude-code-best/industry-adapter'
```

- [ ] **Step 2：写类型测试**

```typescript
// src/runtime/__tests__/types.test.ts
import { describe, test, expect } from 'bun:test'
import type {
  SessionStatus,
  TaskStatus,
  ToolCallStatus,
  ConfirmStatus,
  PermissionMode,
  TokenCounts,
  CostState,
  PlanState,
} from 'src/runtime/types'

describe('runtime types', () => {
  test('SessionStatus 覆盖所有合法值', () => {
    const all: SessionStatus[] = [
      'created', 'active', 'waiting_human', 'closing', 'closed', 'failed', 'expired',
    ]
    expect(all).toHaveLength(7)
  })

  test('TaskStatus 覆盖所有合法值', () => {
    const all: TaskStatus[] = [
      'queued', 'running', 'waiting_confirm', 'succeeded', 'failed', 'rejected', 'timeout', 'cancelled',
    ]
    expect(all).toHaveLength(8)
  })

  test('ToolCallStatus 覆盖所有合法值', () => {
    const all: ToolCallStatus[] = [
      'planned', 'permission_checking', 'waiting_confirm', 'executing',
      'retrying', 'succeeded', 'failed', 'blocked', 'timeout', 'cancelled',
    ]
    expect(all).toHaveLength(10)
  })

  test('TokenCounts 初始值合法', () => {
    const tc: TokenCounts = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    expect(Object.values(tc).every(v => v === 0)).toBe(true)
  })

  test('CostState budgetExceeded 默认 false', () => {
    const cs: CostState = {
      inputTokensTotal: 100,
      outputTokensTotal: 50,
      budgetExceeded: false,
    }
    expect(cs.budgetExceeded).toBe(false)
    expect(cs.budgetInputTokens).toBeUndefined()
  })
})
```

- [ ] **Step 3：运行测试**

```bash
bun test src/runtime/__tests__/types.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 4：Commit**

```bash
git add src/runtime/types.ts src/runtime/__tests__/types.test.ts
git commit -m "feat: 定义运行时标量类型和状态枚举（SessionStatus, TaskStatus, TokenCounts 等）"
```

---

## Task 5：Store / Writer 接口（src/runtime/stores.ts）

**Files:**
- Create: `src/runtime/stores.ts`

这些是依赖注入接口，无运行时值，无需独立测试文件（SessionContext 测试会覆盖）。

- [ ] **Step 1：创建接口文件**

```typescript
// src/runtime/stores.ts
import type { UUID, MemoryRef, TaskRun } from './types.js'
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
```

- [ ] **Step 2：验证 typecheck**

```bash
bun run typecheck
```

Expected: 零错误。

- [ ] **Step 3：Commit**

```bash
git add src/runtime/stores.ts
git commit -m "feat: 定义 SessionStore/MemoryStore/RuleStore/PromptStore/KnowledgeStore/AuditWriter/SSEWriter 接口"
```

---

## Task 6：ContextEnvelope（src/runtime/context/ContextEnvelope.ts）

**Files:**
- Create: `src/runtime/context/ContextEnvelope.ts`
- Create: `src/runtime/context/__tests__/ContextEnvelope.test.ts`

- [ ] **Step 1：创建 ContextEnvelope.ts**

```typescript
// src/runtime/context/ContextEnvelope.ts
import type { UUID, MemoryRef, ToolResultSummary, CompactedSummary, PromptRef, CostState, PlanState } from '../types.js'
import type { NormalizedIntent, BizRef, FactSet, RuleBinding, CapabilityBinding } from '@claude-code-best/industry-adapter'

export interface ContextEnvelope {
  schemaVersion: 1
  sessionId: UUID
  traceId: UUID
  taskId?: UUID
  tenantId: string
  userId: string
  industryCode: string
  turnId: UUID

  // 请求级业务数据
  currentIntent?: NormalizedIntent
  bizRefs: Record<string, BizRef>
  factSet: FactSet

  // 上下文绑定
  memoryRefs: MemoryRef[]
  ruleBindings: RuleBinding[]
  capabilityBindings: CapabilityBinding[]

  // 执行状态
  planState?: PlanState
  /** 工具结果历史，超过 20 条时压缩（见 spec §14.2.4）*/
  priorToolResults: Array<ToolResultSummary | CompactedSummary>

  // 资源引用
  promptRefs: PromptRef[]
  costState: CostState

  createdAt: string
  updatedAt: string
}

/** 创建空白 ContextEnvelope（用于新会话/新 turn 初始化）*/
export function createEnvelope(
  params: Pick<ContextEnvelope, 'sessionId' | 'traceId' | 'tenantId' | 'userId' | 'industryCode' | 'turnId'> & { taskId?: UUID }
): ContextEnvelope {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    ...params,
    bizRefs: {},
    factSet: { facts: {}, sources: [], builtAt: now },
    memoryRefs: [],
    ruleBindings: [],
    capabilityBindings: [],
    priorToolResults: [],
    promptRefs: [],
    costState: {
      inputTokensTotal: 0,
      outputTokensTotal: 0,
      budgetExceeded: false,
    },
    createdAt: now,
    updatedAt: now,
  }
}

/** priorToolResults 超过阈值时压缩（原地修改 envelope.priorToolResults）*/
export function compactPriorToolResults(
  envelope: ContextEnvelope,
  maxEntries = 20
): void {
  const results = envelope.priorToolResults
  if (results.length <= maxEntries) return

  const overflow = results.slice(0, results.length - maxEntries)
  const kept = results.slice(results.length - maxEntries)

  const firstOverflow = overflow[0]
  const lastOverflow = overflow[overflow.length - 1]
  const rangeStartTurnId =
    firstOverflow && 'turnId' in firstOverflow ? firstOverflow.turnId : 'unknown'
  const rangeEndTurnId =
    lastOverflow && 'turnId' in lastOverflow ? lastOverflow.turnId : 'unknown'

  const compacted: CompactedSummary = {
    type: 'compacted_summary',
    count: overflow.length,
    rangeStartTurnId,
    rangeEndTurnId,
    summary: overflow
      .filter((r): r is ToolResultSummary => 'outputSummary' in r)
      .map(r => `[${r.toolName}] ${r.outputSummary.slice(0, 100)}`)
      .join(' | '),
  }

  envelope.priorToolResults = [compacted, ...kept]
  envelope.updatedAt = new Date().toISOString()
}
```

- [ ] **Step 2：写测试**

```typescript
// src/runtime/context/__tests__/ContextEnvelope.test.ts
import { describe, test, expect } from 'bun:test'
import { createEnvelope, compactPriorToolResults } from 'src/runtime/context/ContextEnvelope'
import type { ContextEnvelope } from 'src/runtime/context/ContextEnvelope'
import type { ToolResultSummary } from 'src/runtime/types'

function makeEnvelope(): ContextEnvelope {
  return createEnvelope({
    sessionId: 'sess_001',
    traceId: 'trace_001',
    tenantId: 'tenant_001',
    userId: 'user_001',
    industryCode: 'library',
    turnId: 'turn_001',
  })
}

function makeToolResult(n: number): ToolResultSummary {
  return {
    toolCallId: `tc_${n}`,
    toolName: 'checkout_book',
    channel: 'biz_tool',
    status: 'succeeded',
    outputSummary: `借阅成功 #${n}`,
    durationMs: 100,
    turnId: `turn_${n}`,
  }
}

describe('createEnvelope', () => {
  test('返回 schemaVersion=1', () => {
    const e = makeEnvelope()
    expect(e.schemaVersion).toBe(1)
  })

  test('bizRefs 初始为空对象', () => {
    const e = makeEnvelope()
    expect(e.bizRefs).toEqual({})
  })

  test('costState.budgetExceeded 初始 false', () => {
    const e = makeEnvelope()
    expect(e.costState.budgetExceeded).toBe(false)
  })
})

describe('compactPriorToolResults', () => {
  test('条数不超过 maxEntries 时不压缩', () => {
    const e = makeEnvelope()
    e.priorToolResults = Array.from({ length: 20 }, (_, i) => makeToolResult(i))
    compactPriorToolResults(e, 20)
    expect(e.priorToolResults).toHaveLength(20)
    expect(e.priorToolResults[0]).not.toHaveProperty('type', 'compacted_summary')
  })

  test('超过 maxEntries 时压缩为 compacted_summary + kept', () => {
    const e = makeEnvelope()
    e.priorToolResults = Array.from({ length: 25 }, (_, i) => makeToolResult(i))
    compactPriorToolResults(e, 20)
    // 1 compacted + 20 kept = 21
    expect(e.priorToolResults).toHaveLength(21)
    expect(e.priorToolResults[0]).toHaveProperty('type', 'compacted_summary')
    const compacted = e.priorToolResults[0] as { type: string; count: number }
    expect(compacted.count).toBe(5)
  })

  test('压缩后 updatedAt 更新', () => {
    const e = makeEnvelope()
    const before = e.updatedAt
    e.priorToolResults = Array.from({ length: 25 }, (_, i) => makeToolResult(i))
    compactPriorToolResults(e, 20)
    expect(e.updatedAt >= before).toBe(true)
  })
})
```

- [ ] **Step 3：运行测试**

```bash
bun test src/runtime/context/__tests__/ContextEnvelope.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 4：Commit**

```bash
git add src/runtime/context/
git commit -m "feat: 定义 ContextEnvelope 接口和 createEnvelope/compactPriorToolResults 工具函数"
```

---

## Task 7：SessionContext（src/runtime/context/SessionContext.ts）

**Files:**
- Create: `src/runtime/context/SessionContext.ts`
- Create: `src/runtime/context/__tests__/SessionContext.test.ts`

- [ ] **Step 1：创建 SessionContext.ts**

```typescript
// src/runtime/context/SessionContext.ts
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
```

- [ ] **Step 2：写形状验证测试**

```typescript
// src/runtime/context/__tests__/SessionContext.test.ts
import { describe, test, expect } from 'bun:test'
import type { SessionContext } from 'src/runtime/context/SessionContext'
import { createEnvelope } from 'src/runtime/context/ContextEnvelope'
import type { IndustryAdapter, RuleSet } from '@claude-code-best/industry-adapter'
import type { SessionStore, MemoryStore, RuleStore, PromptStore, KnowledgeStore, AuditWriter } from 'src/runtime/stores'

// Minimal stub factories — only used to satisfy the interface at type-check time
function stubAdapter(): IndustryAdapter {
  return {
    industryCode: 'library',
    semanticMapper: { map: async () => ({ sceneCode: '', actionCode: '', confidence: 0, pathType: 'fast', requiredParams: [], rawInput: '' }) },
    bizRefBuilder: { build: async () => ({ bizRefs: {}, factSet: { facts: {}, sources: [], builtAt: '' } }) },
    capabilityGateway: { route: () => [] },
    getBizTools: () => [],
    getBizSkills: () => [],
    getBizWorkflows: () => [],
    getRules: () => stubRuleSet(),
  }
}

function stubRuleSet(): RuleSet {
  return {
    version: 'test-v1',
    check: () => ({ result: 'PASS', ruleVersion: 'test-v1', matchedRules: [], warnings: [], requiredConfirmLevel: 'auto' }),
  }
}

function stubStore<T>(): T {
  return {} as T
}

function stubAuditWriter(): AuditWriter {
  return { record: async () => {}, flush: async () => {} }
}

describe('SessionContext shape', () => {
  test('可以构造满足接口的对象', () => {
    const envelope = createEnvelope({
      sessionId: 'sess_001',
      traceId: 'trace_001',
      tenantId: 'tenant_001',
      userId: 'user_001',
      industryCode: 'library',
      turnId: 'turn_001',
    })

    const ctx: SessionContext = {
      sessionId: 'sess_001',
      traceId: 'trace_001',
      cwd: '/tmp',
      projectRoot: '/tmp',
      tokenCounts: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      permissionMode: 'default',
      industryCode: 'library',
      userId: 'user_001',
      tenantId: 'tenant_001',
      industryAdapter: stubAdapter(),
      ruleSet: stubRuleSet(),
      auditWriter: stubAuditWriter(),
      sessionStore: stubStore(),
      memoryStore: stubStore(),
      ruleStore: stubStore(),
      promptStore: stubStore(),
      knowledgeStore: stubStore(),
      envelope,
    }

    expect(ctx.sessionId).toBe('sess_001')
    expect(ctx.industryCode).toBe('library')
    expect(ctx.pendingConfirm).toBeUndefined()
    expect(ctx.sseWriter).toBeUndefined()
  })
})
```

- [ ] **Step 3：运行测试**

```bash
bun test src/runtime/context/__tests__/SessionContext.test.ts
```

Expected: 1 test PASS

- [ ] **Step 4：Commit**

```bash
git add src/runtime/context/SessionContext.ts src/runtime/context/__tests__/SessionContext.test.ts
git commit -m "feat: 定义 SessionContext 接口（运行时上下文，含 envelope 字段挂载点）"
```

---

## Task 8：API Schema 类型（src/server/schemas/）

**Files:**
- Create: `src/server/schemas/errors.ts`
- Create: `src/server/schemas/api.ts`
- Create: `src/server/schemas/__tests__/api.test.ts`

- [ ] **Step 1：创建 errors.ts**

```typescript
// src/server/schemas/errors.ts
export { ApiError } from 'src/runtime/types'

export const RuntimeErrorCode = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_STATE_CONFLICT: 'SESSION_STATE_CONFLICT',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  CONFIRM_NOT_FOUND: 'CONFIRM_NOT_FOUND',
  CONFIRM_EXPIRED: 'CONFIRM_EXPIRED',
  CONFIRM_ALREADY_RESOLVED: 'CONFIRM_ALREADY_RESOLVED',
  INDUSTRY_NOT_REGISTERED: 'INDUSTRY_NOT_REGISTERED',
  RULE_BLOCKED: 'RULE_BLOCKED',
  AUDIT_WRITE_FAILED: 'AUDIT_WRITE_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type RuntimeErrorCode = typeof RuntimeErrorCode[keyof typeof RuntimeErrorCode]
```

- [ ] **Step 2：创建 api.ts**

```typescript
// src/server/schemas/api.ts
import type { UUID, TaskStatus, SessionStatus, PermissionMode, TaskMode } from 'src/runtime/types'
import type { NormalizedIntent } from '@claude-code-best/industry-adapter'

// ─── 通用响应包装 ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  requestId: string
  traceId?: string
  serverTime: string
  data: T
}

export interface ApiErrorResponse {
  requestId: string
  traceId?: string
  serverTime: string
  error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> }
}

export interface PageInfo {
  limit: number
  cursor: string | null
  hasMore: boolean
}

// ─── 14.4.1 创建会话 ──────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  tenantId: string
  userId: string
  industryCode: string
  permissionMode?: PermissionMode
  modelOverride?: string | null
  metadata?: Record<string, unknown>
}

export interface CreateSessionData {
  sessionId: UUID
  status: SessionStatus
  industryCode: string
  streamUrl: string
  createdAt: string
}

// ─── 14.4.2 查询会话 ──────────────────────────────────────────────────────────

export interface SessionData {
  sessionId: UUID
  status: SessionStatus
  industryCode: string
  currentTaskId?: UUID
  pendingConfirmId?: UUID
  createdAt: string
  updatedAt: string
}

// ─── 14.4.3 关闭会话 ──────────────────────────────────────────────────────────

export interface CloseSessionRequest {
  reason?: string
}

export interface CloseSessionData {
  sessionId: UUID
  status: 'closed'
  closedAt: string
}

// ─── 14.4.4 发送消息 ──────────────────────────────────────────────────────────

export interface SendMessageRequest {
  input: string
  mode?: 'auto' | TaskMode
  attachments?: unknown[]
  clientMessageId?: string
  metadata?: Record<string, unknown>
}

export interface SendMessageData {
  taskId: UUID
  sessionId: UUID
  status: 'queued'
  mode: TaskMode
  streamUrl: string
}

// ─── 14.4.5 查询任务状态 ─────────────────────────────────────────────────────

export interface TaskStatusData {
  taskId: UUID
  sessionId: UUID
  status: TaskStatus
  mode: TaskMode
  currentIntent?: NormalizedIntent
  pendingConfirmId?: UUID
  updatedAt: string
}

// ─── 14.4.7 人工确认回调 ─────────────────────────────────────────────────────

export interface ConfirmDecisionRequest {
  confirmId: UUID
  decision: 'approve' | 'reject'
  confirmedBy: string
  confirmedRole: string
  comment?: string
  clientDecisionId?: string
}

export interface ConfirmDecisionData {
  confirmId: UUID
  taskId: UUID
  status: 'approved' | 'rejected'
  nextTaskStatus: TaskStatus
}

// ─── 14.4.8-10 审计接口 ───────────────────────────────────────────────────────

export interface AuditTraceSummaryItem {
  traceId: UUID
  sessionId: UUID
  rootTaskId?: UUID
  userId: string
  industryCode: string
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  eventCount: number
  hasHumanConfirm: boolean
  hasHighRisk: boolean
  firstEventAt: string
  lastEventAt: string
  summary: Record<string, unknown>
}

export interface AuditTraceSummaryData {
  items: AuditTraceSummaryItem[]
  page: PageInfo
}

export interface AuditEventItem {
  sequence: number
  eventType: string
  severity: 'info' | 'warn' | 'error' | 'security'
  payload: Record<string, unknown>
  createdAt: string
}

export interface AuditTraceEventsData {
  traceId: UUID
  events: AuditEventItem[]
}

export interface ReplayStep {
  sequence: number
  kind: string
  title: string
  snapshot: Record<string, unknown>
}

export interface ReplayData {
  sessionId: UUID
  traceId: UUID
  steps: ReplayStep[]
}
```

- [ ] **Step 3：写形状测试**

```typescript
// src/server/schemas/__tests__/api.test.ts
import { describe, test, expect } from 'bun:test'
import type { CreateSessionRequest, SendMessageRequest, ConfirmDecisionRequest } from 'src/server/schemas/api'
import { RuntimeErrorCode } from 'src/server/schemas/errors'

describe('API schema types', () => {
  test('CreateSessionRequest 必填字段', () => {
    const req: CreateSessionRequest = {
      tenantId: 'tenant_001',
      userId: 'user_001',
      industryCode: 'library',
    }
    expect(req.industryCode).toBe('library')
    expect(req.permissionMode).toBeUndefined()
  })

  test('SendMessageRequest mode 默认 auto', () => {
    const req: SendMessageRequest = { input: '扫码借书' }
    expect(req.mode).toBeUndefined()  // auto 由 server 填充默认值
  })

  test('ConfirmDecisionRequest decision 只允许 approve/reject', () => {
    const req: ConfirmDecisionRequest = {
      confirmId: 'confirm_001',
      decision: 'approve',
      confirmedBy: 'librarian_001',
      confirmedRole: 'librarian',
    }
    expect(req.decision).toBe('approve')
  })

  test('RuntimeErrorCode 包含 SESSION_NOT_FOUND', () => {
    expect(RuntimeErrorCode.SESSION_NOT_FOUND).toBe('SESSION_NOT_FOUND')
    expect(Object.keys(RuntimeErrorCode)).toHaveLength(13)
  })
})
```

- [ ] **Step 4：运行测试**

```bash
bun test src/server/schemas/__tests__/api.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5：Commit**

```bash
git add src/server/schemas/
git commit -m "feat: 定义 HTTP API 请求/响应类型和错误码（14 个接口全覆盖）"
```

---

## Task 9：SSE 事件类型（src/server/sse/types.ts）

**Files:**
- Create: `src/server/sse/types.ts`
- Create: `src/server/sse/__tests__/sse-types.test.ts`

- [ ] **Step 1：创建 sse/types.ts**

```typescript
// src/server/sse/types.ts
import type { UUID } from 'src/runtime/types'
import type { NormalizedIntent } from '@claude-code-best/industry-adapter'

export const SSEEventType = {
  SESSION_READY: 'session_ready',
  TASK_QUEUED: 'task_queued',
  INTENT_DETECTED: 'intent_detected',
  CONTEXT_BUILT: 'context_built',
  PLAN_CREATED: 'plan_created',
  MESSAGE_DELTA: 'message_delta',
  TOOL_STARTED: 'tool_started',
  TOOL_COMPLETED: 'tool_completed',
  PERMISSION_REQUIRED: 'permission_required',
  PERMISSION_RESOLVED: 'permission_resolved',
  WARNING: 'warning',
  ERROR: 'error',
  DONE: 'done',
} as const

export type SSEEventType = typeof SSEEventType[keyof typeof SSEEventType]

// ─── 事件基础字段 ─────────────────────────────────────────────────────────────

interface SSEBase {
  traceId: UUID
  sequence: number
  sessionId: UUID
  taskId?: UUID
}

// ─── 具体事件类型 ─────────────────────────────────────────────────────────────

export interface SSESessionReady extends SSEBase {
  type: 'session_ready'
}

export interface SSETaskQueued extends SSEBase {
  type: 'task_queued'
  taskId: UUID
  mode: string
}

export interface SSEIntentDetected extends SSEBase {
  type: 'intent_detected'
  intent: NormalizedIntent
}

export interface SSEContextBuilt extends SSEBase {
  type: 'context_built'
  bizRefsCount: number
}

export interface SSEPlanCreated extends SSEBase {
  type: 'plan_created'
  stepCount: number
}

export interface SSEMessageDelta extends SSEBase {
  type: 'message_delta'
  delta: string
}

export interface SSEToolStarted extends SSEBase {
  type: 'tool_started'
  toolCallId: UUID
  toolName: string
  channel: string
}

export interface SSEToolCompleted extends SSEBase {
  type: 'tool_completed'
  toolCallId: UUID
  toolName: string
  status: 'succeeded' | 'failed'
  durationMs: number
}

export interface SSEPermissionRequired extends SSEBase {
  type: 'permission_required'
  confirmId: UUID
  operation: string
  confirmLevel: string
  requiredApproverRole: string
  ruleWarnings: string[]
  expiresAt: string
}

export interface SSEPermissionResolved extends SSEBase {
  type: 'permission_resolved'
  confirmId: UUID
  decision: 'approve' | 'reject' | 'timeout'
}

export interface SSEWarning extends SSEBase {
  type: 'warning'
  warningCode: string
  message: string
}

export interface SSEError extends SSEBase {
  type: 'error'
  errorCode: string
  message: string
  retryable: boolean
}

export interface SSEDone extends SSEBase {
  type: 'done'
  taskId: UUID
  taskStatus: string
  tokensUsed: number
}

export type SSEEvent =
  | SSESessionReady
  | SSETaskQueued
  | SSEIntentDetected
  | SSEContextBuilt
  | SSEPlanCreated
  | SSEMessageDelta
  | SSEToolStarted
  | SSEToolCompleted
  | SSEPermissionRequired
  | SSEPermissionResolved
  | SSEWarning
  | SSEError
  | SSEDone
```

- [ ] **Step 2：写测试**

```typescript
// src/server/sse/__tests__/sse-types.test.ts
import { describe, test, expect } from 'bun:test'
import { SSEEventType } from 'src/server/sse/types'
import type { SSEEvent, SSEPermissionRequired } from 'src/server/sse/types'

describe('SSE 事件类型', () => {
  test('SSEEventType 枚举包含所有 13 个事件', () => {
    expect(Object.keys(SSEEventType)).toHaveLength(13)
  })

  test('permission_required 事件字段齐备', () => {
    const event: SSEPermissionRequired = {
      type: 'permission_required',
      traceId: 'trace_001',
      sequence: 7,
      sessionId: 'sess_001',
      taskId: 'task_001',
      confirmId: 'confirm_001',
      operation: 'checkout_book',
      confirmLevel: 'explicit_confirm',
      requiredApproverRole: 'librarian',
      ruleWarnings: ['读者有 2 本逾期未还'],
      expiresAt: '2026-04-27T10:16:00.000Z',
    }
    expect(event.type).toBe('permission_required')
    expect(event.ruleWarnings).toHaveLength(1)
  })

  test('SSEEvent union 的 type 字段可作为类型收窄', () => {
    const events: SSEEvent[] = [
      { type: 'session_ready', traceId: 't', sequence: 1, sessionId: 's' },
      { type: 'done', traceId: 't', sequence: 99, sessionId: 's', taskId: 'task_001', taskStatus: 'succeeded', tokensUsed: 100 },
    ]
    for (const e of events) {
      expect(typeof e.type).toBe('string')
      expect(typeof e.sequence).toBe('number')
    }
  })
})
```

- [ ] **Step 3：运行测试**

```bash
bun test src/server/sse/__tests__/sse-types.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 4：Commit**

```bash
git add src/server/sse/
git commit -m "feat: 定义 SSE 事件类型 union（13 种事件，含 permission_required/resolved）"
```

---

## Task 10：AuditEvent 类型（src/audit/types.ts）

**Files:**
- Create: `src/audit/types.ts`
- Create: `src/audit/__tests__/types.test.ts`

- [ ] **Step 1：创建 audit/types.ts**

```typescript
// src/audit/types.ts
import type { UUID } from 'src/runtime/types'

export type AuditEventType =
  | 'session_created'
  | 'session_closed'
  | 'request_received'
  | 'intent_detected'
  | 'context_built'
  | 'plan_created'
  | 'tool_call_started'
  | 'tool_call_completed'
  | 'permission_check'
  | 'permission_required'
  | 'human_confirm'
  | 'permission_timeout'
  | 'subagent_spawned'
  | 'memory_read'
  | 'memory_write'
  | 'knowledge_query'
  | 'rule_check'
  | 'error'
  | 'response_sent'

export type AuditSeverity = 'info' | 'warn' | 'error' | 'security'

export interface AuditEvent {
  id: UUID
  traceId: UUID
  /** trace 内严格递增，由 AuditSequence 模块在写入 Redis Stream 前分配 */
  sequence: number
  sessionId: UUID
  taskId?: UUID
  toolCallId?: UUID
  confirmId?: UUID
  tenantId: string
  userId: string
  industryCode: string
  eventType: AuditEventType
  severity: AuditSeverity
  /** 脱敏后的事件详情，禁止写入 API key/token/密码/证件号等敏感字段 */
  payload: Record<string, unknown>
  createdAt: string
}

/** Redis Stream 消息格式，AuditWriter 写入，AuditConsumer 消费 */
export interface AuditStreamMessage {
  auditEvent: AuditEvent
  /** requireAuditDurability=true 时，Consumer 需确认落库后才 ACK */
  requireDurability: boolean
}
```

- [ ] **Step 2：写测试**

```typescript
// src/audit/__tests__/types.test.ts
import { describe, test, expect } from 'bun:test'
import type { AuditEventType, AuditEvent } from 'src/audit/types'

describe('AuditEvent 类型', () => {
  test('AuditEventType 覆盖 19 种事件', () => {
    const all: AuditEventType[] = [
      'session_created', 'session_closed', 'request_received', 'intent_detected',
      'context_built', 'plan_created', 'tool_call_started', 'tool_call_completed',
      'permission_check', 'permission_required', 'human_confirm', 'permission_timeout',
      'subagent_spawned', 'memory_read', 'memory_write', 'knowledge_query',
      'rule_check', 'error', 'response_sent',
    ]
    expect(all).toHaveLength(19)
  })

  test('AuditEvent 可包含 toolCallId 和 confirmId', () => {
    const event: AuditEvent = {
      id: 'audit_001',
      traceId: 'trace_001',
      sequence: 7,
      sessionId: 'sess_001',
      taskId: 'task_001',
      toolCallId: 'tc_001',
      confirmId: 'confirm_001',
      tenantId: 'tenant_001',
      userId: 'user_001',
      industryCode: 'library',
      eventType: 'human_confirm',
      severity: 'security',
      payload: { decision: 'approve', confirmedBy: 'librarian_001' },
      createdAt: new Date().toISOString(),
    }
    expect(event.severity).toBe('security')
    expect(event.sequence).toBe(7)
  })
})
```

- [ ] **Step 3：运行测试**

```bash
bun test src/audit/__tests__/types.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 4：Commit**

```bash
git add src/audit/
git commit -m "feat: 定义 AuditEvent 类型（19 种事件类型，含脱敏说明）"
```

---

## Task 11：PostgreSQL 迁移 — 核心表（001_core.sql）

**Files:**
- Create: `src/persistence/db/migrations/001_core.sql`
- Create: `src/persistence/db/__tests__/migrations.test.ts`

- [ ] **Step 1：创建 001_core.sql**

```sql
-- src/persistence/db/migrations/001_core.sql
-- agent_sessions, agent_tasks, agent_messages

-- ─── agent_sessions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_sessions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    user_id          TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN (
                                   'created','active','waiting_human',
                                   'closing','closed','failed','expired')),
    permission_mode  TEXT        NOT NULL DEFAULT 'default',
    model_override   TEXT        NULL,
    current_trace_id UUID        NULL,
    metadata         JSONB       NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at        TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_tenant_user
    ON agent_sessions (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_tenant_industry_status
    ON agent_sessions (tenant_id, industry_code, status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_trace
    ON agent_sessions (current_trace_id);

-- ─── agent_tasks ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_tasks (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID        NOT NULL REFERENCES agent_sessions(id),
    trace_id         UUID        NOT NULL,
    tenant_id        TEXT        NOT NULL,
    user_id          TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    parent_task_id   UUID        NULL,
    input_text       TEXT        NOT NULL,
    mode             TEXT        NOT NULL CHECK (mode IN ('fast','agent','workflow','subagent')),
    status           TEXT        NOT NULL CHECK (status IN (
                                   'queued','running','waiting_confirm',
                                   'succeeded','failed','rejected','timeout','cancelled')),
    envelope         JSONB       NOT NULL DEFAULT '{}',
    idempotency_key  TEXT        NULL,
    started_at       TIMESTAMPTZ NULL,
    completed_at     TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_idempotency
    ON agent_tasks (tenant_id, session_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_session
    ON agent_tasks (tenant_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_trace
    ON agent_tasks (tenant_id, trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_status
    ON agent_tasks (tenant_id, status, created_at);

-- ─── agent_messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_messages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        NOT NULL REFERENCES agent_sessions(id),
    task_id     UUID        NULL,
    trace_id    UUID        NOT NULL,
    tenant_id   TEXT        NOT NULL,
    role        TEXT        NOT NULL CHECK (role IN ('user','assistant','system','tool')),
    content     JSONB       NOT NULL,
    sequence    BIGINT      NOT NULL,
    token_count INTEGER     NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_messages_sequence
    ON agent_messages (tenant_id, session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_agent_messages_task
    ON agent_messages (tenant_id, task_id, sequence);
CREATE INDEX IF NOT EXISTS idx_agent_messages_trace
    ON agent_messages (tenant_id, trace_id, sequence);
```

- [ ] **Step 2：创建迁移内容验证测试（无需数据库连接）**

```typescript
// src/persistence/db/__tests__/migrations.test.ts
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const migrationsDir = join(import.meta.dir, '../migrations')

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf-8')
}

describe('Migration 001_core.sql', () => {
  const sql = readMigration('001_core.sql')

  test('包含 agent_sessions 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_sessions')
    expect(sql).toContain('tenant_id')
    expect(sql).toContain('industry_code')
    expect(sql).toContain('gen_random_uuid()')
  })

  test('agent_sessions status CHECK 包含所有合法值', () => {
    expect(sql).toContain("'created','active','waiting_human'")
    expect(sql).toContain("'closing','closed','failed','expired'")
  })

  test('包含 agent_tasks 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_tasks')
    expect(sql).toContain('envelope         JSONB')
    expect(sql).toContain('idempotency_key')
  })

  test('agent_tasks 幂等键索引使用 WHERE 条件', () => {
    expect(sql).toContain('WHERE idempotency_key IS NOT NULL')
  })

  test('包含 agent_messages 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_messages')
    expect(sql).toContain("CHECK (role IN ('user','assistant','system','tool'))")
    expect(sql).toContain('sequence    BIGINT')
  })
})
```

- [ ] **Step 3：运行测试**

```bash
bun test src/persistence/db/__tests__/migrations.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 4：Commit**

```bash
git add src/persistence/db/migrations/001_core.sql src/persistence/db/__tests__/migrations.test.ts
git commit -m "feat: PostgreSQL 迁移 001 — agent_sessions/tasks/messages 三表"
```

---

## Task 12：PostgreSQL 迁移 — 审计表（002_audit.sql）

**Files:**
- Create: `src/persistence/db/migrations/002_audit.sql`

- [ ] **Step 1：创建 002_audit.sql**

```sql
-- src/persistence/db/migrations/002_audit.sql
-- agent_tool_calls, agent_human_confirms, agent_audit_events, agent_audit_trace_summaries

-- ─── agent_tool_calls ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_tool_calls (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID        NOT NULL,
    task_id          UUID        NOT NULL,
    trace_id         UUID        NOT NULL,
    tenant_id        TEXT        NOT NULL,
    tool_name        TEXT        NOT NULL,
    channel          TEXT        NOT NULL CHECK (channel IN (
                                   'common_tool','biz_tool','mcp_tool','workflow_tool')),
    permission_level TEXT        NOT NULL CHECK (permission_level IN ('low','medium','high')),
    status           TEXT        NOT NULL CHECK (status IN (
                                   'planned','permission_checking','waiting_confirm',
                                   'executing','retrying','succeeded','failed',
                                   'blocked','timeout','cancelled')),
    input            JSONB       NOT NULL,
    output           JSONB       NULL,
    error            JSONB       NULL,
    started_at       TIMESTAMPTZ NULL,
    completed_at     TIMESTAMPTZ NULL,
    duration_ms      INTEGER     NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_task
    ON agent_tool_calls (tenant_id, task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_trace
    ON agent_tool_calls (tenant_id, trace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_name
    ON agent_tool_calls (tenant_id, tool_name, created_at DESC);

-- ─── agent_human_confirms ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_human_confirms (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID        NOT NULL,
    task_id          UUID        NOT NULL,
    trace_id         UUID        NOT NULL,
    tenant_id        TEXT        NOT NULL,
    operation        TEXT        NOT NULL,
    confirm_level    TEXT        NOT NULL CHECK (confirm_level IN (
                                   'auto','silent_confirm','explicit_confirm','supervisor_approval')),
    required_role    TEXT        NOT NULL CHECK (required_role IN (
                                   'user','librarian','supervisor','admin')),
    status           TEXT        NOT NULL CHECK (status IN (
                                   'pending','escalated','approved','rejected','timeout','cancelled')),
    request_payload  JSONB       NOT NULL,
    decision         TEXT        NULL CHECK (decision IN ('approve','reject','timeout')),
    confirmed_by     TEXT        NULL,
    confirmed_role   TEXT        NULL,
    confirmed_ip     INET        NULL,
    expires_at       TIMESTAMPTZ NOT NULL,
    resolved_at      TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_confirms_session_status
    ON agent_human_confirms (tenant_id, session_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_confirms_trace
    ON agent_human_confirms (tenant_id, trace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_confirms_pending_expires
    ON agent_human_confirms (tenant_id, expires_at)
    WHERE status = 'pending';

-- ─── agent_audit_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_audit_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id        UUID        NOT NULL,
    sequence        BIGINT      NOT NULL,
    session_id      UUID        NOT NULL,
    task_id         UUID        NULL,
    tool_call_id    UUID        NULL,
    confirm_id      UUID        NULL,
    tenant_id       TEXT        NOT NULL,
    user_id         TEXT        NOT NULL,
    industry_code   TEXT        NOT NULL,
    event_type      TEXT        NOT NULL,
    severity        TEXT        NOT NULL CHECK (severity IN ('info','warn','error','security')),
    payload         JSONB       NOT NULL,
    raw_ref         JSONB       NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sequence 顺序由 AuditSequence 模块在写 Redis Stream 前用 INCR 分配，此处保证唯一性
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_sequence
    ON agent_audit_events (tenant_id, trace_id, sequence);
CREATE INDEX IF NOT EXISTS idx_audit_events_session
    ON agent_audit_events (tenant_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_type
    ON agent_audit_events (tenant_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_payload
    ON agent_audit_events USING GIN (payload);

-- ─── agent_audit_trace_summaries ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_audit_trace_summaries (
    trace_id         UUID        PRIMARY KEY,
    tenant_id        TEXT        NOT NULL,
    session_id       UUID        NOT NULL,
    root_task_id     UUID        NULL,
    user_id          TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN (
                                   'running','succeeded','failed','cancelled')),
    first_event_at   TIMESTAMPTZ NOT NULL,
    last_event_at    TIMESTAMPTZ NOT NULL,
    event_count      INTEGER     NOT NULL DEFAULT 0,
    has_human_confirm BOOLEAN    NOT NULL DEFAULT FALSE,
    has_high_risk    BOOLEAN     NOT NULL DEFAULT FALSE,
    summary          JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_trace_summaries_tenant_last
    ON agent_audit_trace_summaries (tenant_id, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_summaries_user
    ON agent_audit_trace_summaries (tenant_id, user_id, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_summaries_industry_status
    ON agent_audit_trace_summaries (tenant_id, industry_code, status);
```

- [ ] **Step 2：添加 002 迁移验证测试**（追加到已有测试文件）

```typescript
// 追加到 src/persistence/db/__tests__/migrations.test.ts

describe('Migration 002_audit.sql', () => {
  const sql = readMigration('002_audit.sql')

  test('包含 agent_tool_calls 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_tool_calls')
    expect(sql).toContain("'common_tool','biz_tool','mcp_tool','workflow_tool'")
    expect(sql).toContain('duration_ms      INTEGER')
  })

  test('包含 agent_human_confirms 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_human_confirms')
    expect(sql).toContain('expires_at       TIMESTAMPTZ NOT NULL')
    expect(sql).toContain("WHERE status = 'pending'")
  })

  test('agent_audit_events 含 GIN 索引', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_audit_events')
    expect(sql).toContain('USING GIN (payload)')
    expect(sql).toContain('sequence        BIGINT      NOT NULL')
  })

  test('audit_events sequence 唯一约束存在', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_sequence')
    expect(sql).toContain('(tenant_id, trace_id, sequence)')
  })

  test('包含 agent_audit_trace_summaries 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_audit_trace_summaries')
    expect(sql).toContain('has_human_confirm BOOLEAN')
    expect(sql).toContain('has_high_risk    BOOLEAN')
  })
})
```

- [ ] **Step 3：运行测试**

```bash
bun test src/persistence/db/__tests__/migrations.test.ts
```

Expected: 10 tests PASS（含 Task 11 的 5 个）

- [ ] **Step 4：Commit**

```bash
git add src/persistence/db/migrations/002_audit.sql src/persistence/db/__tests__/migrations.test.ts
git commit -m "feat: PostgreSQL 迁移 002 — tool_calls/human_confirms/audit_events/trace_summaries"
```

---

## Task 13：PostgreSQL 迁移 — 内容表（003_content.sql）

**Files:**
- Create: `src/persistence/db/migrations/003_content.sql`

- [ ] **Step 1：创建 003_content.sql**

```sql
-- src/persistence/db/migrations/003_content.sql
-- agent_memory_items, agent_rule_versions, agent_prompt_templates,
-- agent_knowledge_sources, agent_knowledge_chunks, agent_industry_adapters

-- ─── agent_memory_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memory_items (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    user_id          TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    memory_type      TEXT        NOT NULL CHECK (memory_type IN (
                                   'preference','fact','procedure','summary')),
    scope            TEXT        NOT NULL CHECK (scope IN ('user','tenant','industry')),
    content          TEXT        NOT NULL,
    metadata         JSONB       NOT NULL DEFAULT '{}',
    source_trace_id  UUID        NULL,
    expires_at       TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_tenant_user
    ON agent_memory_items (tenant_id, user_id, industry_code, memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_trace
    ON agent_memory_items (tenant_id, source_trace_id);
CREATE INDEX IF NOT EXISTS idx_memory_metadata
    ON agent_memory_items USING GIN (metadata);

-- ─── agent_rule_versions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_rule_versions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    version          TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN ('draft','active','retired')),
    rules            JSONB       NOT NULL,
    checksum         TEXT        NOT NULL,
    published_by     TEXT        NULL,
    published_at     TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_versions_unique
    ON agent_rule_versions (tenant_id, industry_code, version);
-- 同一 (tenant_id, industry_code) 只能有一个 active 版本
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_versions_active_one
    ON agent_rule_versions (tenant_id, industry_code)
    WHERE status = 'active';

-- ─── agent_prompt_templates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_prompt_templates (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    template_key     TEXT        NOT NULL,
    version          TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN ('draft','active','retired')),
    content          TEXT        NOT NULL,
    metadata         JSONB       NOT NULL DEFAULT '{}',
    checksum         TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at     TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_templates_unique
    ON agent_prompt_templates (tenant_id, industry_code, template_key, version);

-- ─── agent_knowledge_sources ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_knowledge_sources (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          TEXT        NOT NULL,
    industry_code      TEXT        NOT NULL,
    title              TEXT        NOT NULL,
    source_type        TEXT        NOT NULL CHECK (source_type IN ('file','url','manual','api')),
    uri                TEXT        NULL,
    status             TEXT        NOT NULL CHECK (status IN ('indexing','ready','failed','retired')),
    chunk_count        INTEGER     NOT NULL DEFAULT 0,
    milvus_collection  TEXT        NOT NULL,
    metadata           JSONB       NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_tenant
    ON agent_knowledge_sources (tenant_id, industry_code, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_metadata
    ON agent_knowledge_sources USING GIN (metadata);

-- ─── agent_knowledge_chunks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_knowledge_chunks (
    id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id      UUID    NOT NULL REFERENCES agent_knowledge_sources(id),
    tenant_id      TEXT    NOT NULL,
    industry_code  TEXT    NOT NULL,
    chunk_index    INTEGER NOT NULL,
    content        TEXT    NOT NULL,
    content_hash   TEXT    NOT NULL,
    embedding_id   TEXT    NOT NULL,
    metadata       JSONB   NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_chunks_source_idx
    ON agent_knowledge_chunks (source_id, chunk_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON agent_knowledge_chunks (tenant_id, embedding_id);

-- ─── agent_industry_adapters ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_industry_adapters (
    industry_code        TEXT        PRIMARY KEY,
    package_name         TEXT        NOT NULL,
    version              TEXT        NOT NULL,
    status               TEXT        NOT NULL CHECK (status IN ('active','disabled')),
    capability_manifest  JSONB       NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2：添加 003 迁移验证测试**（追加到已有测试文件）

```typescript
// 追加到 src/persistence/db/__tests__/migrations.test.ts

describe('Migration 003_content.sql', () => {
  const sql = readMigration('003_content.sql')

  test('包含 agent_memory_items 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_memory_items')
    expect(sql).toContain("CHECK (memory_type IN (")
    expect(sql).toContain("'preference','fact','procedure','summary'")
  })

  test('agent_rule_versions active 唯一约束', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_versions_active_one')
    expect(sql).toContain("WHERE status = 'active'")
  })

  test('包含 agent_knowledge_sources 和 agent_knowledge_chunks 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_knowledge_sources')
    expect(sql).toContain('milvus_collection  TEXT        NOT NULL')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_knowledge_chunks')
    expect(sql).toContain('embedding_id   TEXT    NOT NULL')
  })

  test('包含 agent_industry_adapters 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_industry_adapters')
    expect(sql).toContain('capability_manifest  JSONB')
  })

  test('全部 13 张表在三个迁移文件中', () => {
    const sql001 = readMigration('001_core.sql')
    const sql002 = readMigration('002_audit.sql')
    const allSql = sql001 + sql002 + sql
    const tableNames = [
      'agent_sessions', 'agent_tasks', 'agent_messages',
      'agent_tool_calls', 'agent_human_confirms',
      'agent_audit_events', 'agent_audit_trace_summaries',
      'agent_memory_items', 'agent_rule_versions', 'agent_prompt_templates',
      'agent_knowledge_sources', 'agent_knowledge_chunks', 'agent_industry_adapters',
    ]
    for (const name of tableNames) {
      expect(allSql).toContain(`CREATE TABLE IF NOT EXISTS ${name}`)
    }
  })
})
```

- [ ] **Step 3：运行全部迁移测试**

```bash
bun test src/persistence/db/__tests__/migrations.test.ts
```

Expected: 15 tests PASS（含前两个迁移文件的 10 个）

- [ ] **Step 4：Commit**

```bash
git add src/persistence/db/migrations/003_content.sql src/persistence/db/__tests__/migrations.test.ts
git commit -m "feat: PostgreSQL 迁移 003 — memory/rules/prompts/knowledge/adapters 六表，共 13 表完整"
```

---

## Task 14：Redis Key Builder 和 Milvus Schema（src/persistence/redis/keys.ts）

**Files:**
- Create: `src/persistence/redis/keys.ts`
- Create: `src/persistence/redis/__tests__/keys.test.ts`
- Create: `src/persistence/vector/schema.ts`

- [ ] **Step 1：创建 keys.ts**

```typescript
// src/persistence/redis/keys.ts

/**
 * 类型安全的 Redis key 构建器。
 * 所有 key 格式与 spec §14.3.14 保持一致。
 */

/** session:{tenantId}:{sessionId} — SessionState 热状态，TTL 会话结束后 24h */
export const sessionKey = (tenantId: string, sessionId: string): string =>
  `session:${tenantId}:${sessionId}`

/** task:{tenantId}:{taskId} — TaskRun 热状态 + suspendPoint，TTL 完成后 24h */
export const taskKey = (tenantId: string, taskId: string): string =>
  `task:${tenantId}:${taskId}`

/** sse:{tenantId}:{sessionId} — SSE 连接索引 set，TTL 连接存活 */
export const sseKey = (tenantId: string, sessionId: string): string =>
  `sse:${tenantId}:${sessionId}`

/** audit_stream:{tenantId} — 审计写入缓冲 stream，按容量裁剪 */
export const auditStreamKey = (tenantId: string): string =>
  `audit_stream:${tenantId}`

/** rule:{tenantId}:{industryCode}:active — 当前规则版本，无固定 TTL */
export const ruleActiveKey = (tenantId: string, industryCode: string): string =>
  `rule:${tenantId}:${industryCode}:active`

/** idem:{tenantId}:{idempotencyKey} — API 幂等结果，TTL 24h */
export const idempotencyKey = (tenantId: string, key: string): string =>
  `idem:${tenantId}:${key}`

/** memory:short:{tenantId}:{sessionId} — 短期记忆，TTL 会话结束 */
export const shortMemoryKey = (tenantId: string, sessionId: string): string =>
  `memory:short:${tenantId}:${sessionId}`

/** task_resume_queue:{tenantId} — 跨节点 HITL 恢复消息队列 stream，TTL 消费后 24h */
export const taskResumeQueueKey = (tenantId: string): string =>
  `task_resume_queue:${tenantId}`

/** audit_seq:{tenantId}:{traceId} — trace 内 sequence 原子计数器，TTL trace 结束后 24h */
export const auditSeqKey = (tenantId: string, traceId: string): string =>
  `audit_seq:${tenantId}:${traceId}`
```

- [ ] **Step 2：创建 Milvus Schema 常量**

```typescript
// src/persistence/vector/schema.ts

/**
 * Milvus collection 设计与 spec §14.3.15 对应。
 * 每个行业可独立 collection，按租户分区。
 */
export function milvusCollectionName(industryCode: string): string {
  return `knowledge_${industryCode}`
}

export function milvusPartitionName(tenantId: string): string {
  return `tenant_${tenantId}`
}

/** Milvus scalar fields（查询时必须携带 tenant_id 和 industry_code 过滤） */
export const MILVUS_SCALAR_FIELDS = [
  'tenant_id',
  'industry_code',
  'source_id',
  'chunk_id',
  'access_level',
  'version',
] as const

export type MilvusScalarField = typeof MILVUS_SCALAR_FIELDS[number]
```

- [ ] **Step 3：写 key builder 测试**

```typescript
// src/persistence/redis/__tests__/keys.test.ts
import { describe, test, expect } from 'bun:test'
import {
  sessionKey,
  taskKey,
  sseKey,
  auditStreamKey,
  ruleActiveKey,
  idempotencyKey,
  shortMemoryKey,
  taskResumeQueueKey,
  auditSeqKey,
} from 'src/persistence/redis/keys'

describe('Redis key builders', () => {
  test('sessionKey', () => {
    expect(sessionKey('tenant1', 'sess1')).toBe('session:tenant1:sess1')
  })

  test('taskKey', () => {
    expect(taskKey('t1', 'task1')).toBe('task:t1:task1')
  })

  test('sseKey', () => {
    expect(sseKey('t1', 's1')).toBe('sse:t1:s1')
  })

  test('auditStreamKey', () => {
    expect(auditStreamKey('tenant_001')).toBe('audit_stream:tenant_001')
  })

  test('ruleActiveKey', () => {
    expect(ruleActiveKey('t1', 'library')).toBe('rule:t1:library:active')
  })

  test('idempotencyKey', () => {
    expect(idempotencyKey('t1', 'client_msg_001')).toBe('idem:t1:client_msg_001')
  })

  test('shortMemoryKey', () => {
    expect(shortMemoryKey('t1', 's1')).toBe('memory:short:t1:s1')
  })

  test('taskResumeQueueKey', () => {
    expect(taskResumeQueueKey('tenant_001')).toBe('task_resume_queue:tenant_001')
  })

  test('auditSeqKey', () => {
    expect(auditSeqKey('t1', 'trace_001')).toBe('audit_seq:t1:trace_001')
  })

  test('所有 key 包含 tenantId 防止跨租户冲突', () => {
    const keys = [
      sessionKey('t1', 's1'),
      taskKey('t1', 'task1'),
      sseKey('t1', 's1'),
      auditStreamKey('t1'),
      ruleActiveKey('t1', 'lib'),
      idempotencyKey('t1', 'k1'),
      shortMemoryKey('t1', 's1'),
      taskResumeQueueKey('t1'),
      auditSeqKey('t1', 'tr1'),
    ]
    for (const k of keys) {
      expect(k).toContain('t1')
    }
  })
})
```

- [ ] **Step 4：运行测试**

```bash
bun test src/persistence/redis/__tests__/keys.test.ts
```

Expected: 10 tests PASS

- [ ] **Step 5：Commit**

```bash
git add src/persistence/redis/ src/persistence/vector/
git commit -m "feat: Redis key builder（9 种 key）和 Milvus collection schema 常量"
```

---

## Task 15：Phase A 验收 — 全量 typecheck + 测试

- [ ] **Step 1：运行 typecheck**

```bash
bun run typecheck
```

Expected: 零错误。如有错误，根据错误信息定位文件修复。

- [ ] **Step 2：运行全部 Phase A 测试**

```bash
bun test packages/industry-adapter/src/__tests__/ \
         src/runtime/__tests__/ \
         src/runtime/context/__tests__/ \
         src/server/schemas/__tests__/ \
         src/server/sse/__tests__/ \
         src/audit/__tests__/ \
         src/persistence/db/__tests__/ \
         src/persistence/redis/__tests__/
```

Expected: 全部通过（约 40 个测试）。

- [ ] **Step 3：验证 industry-adapter 包可在主 src 中导入**

```bash
# 临时验证脚本
echo "import type { IndustryAdapter } from '@claude-code-best/industry-adapter'; const _: IndustryAdapter = null as any; console.log('OK')" | bun run --
```

Expected: 无类型错误。

- [ ] **Step 4：最终 Commit**

```bash
git add .
git commit -m "feat: Phase A 完成 — 类型契约/DB Schema/Redis Keys 全量验收通过"
```

---

# Phase B 任务骨架：Runtime 主干

> Phase A 验收通过后开始。此骨架将在 Phase B 启动时补全为完整 TDD 步骤。

**新增文件（来自 spec §14.12.2）：**

| Task | 文件 | 说明 |
|------|------|------|
| B1 | `src/entrypoints/server.ts` | Fastify 服务入口，加载配置、初始化依赖、启动 createServer |
| B2 | `src/server/http/createServer.ts` | Fastify 实例创建，注册中间件和路由 |
| B3 | `src/server/http/middleware/auth.ts` | JWT 鉴权中间件 |
| B3 | `src/server/http/middleware/tenant.ts` | 租户解析（从 JWT 或 header 提取 tenantId） |
| B3 | `src/server/http/middleware/idempotency.ts` | 幂等键检查（Redis `idem:*` key） |
| B4 | `src/server/http/routes/sessions.ts` | POST/GET/DELETE /api/v1/sessions/:id |
| B4 | `src/server/http/routes/messages.ts` | POST /api/v1/sessions/:id/messages |
| B4 | `src/server/http/routes/confirms.ts` | POST /api/v1/sessions/:id/confirm |
| B5 | `src/server/sse/SseConnectionRegistry.ts` | SSE 连接注册表（Redis sse:* key） |
| B5 | `src/server/sse/SseEventWriter.ts` | SSEWriter 实现，写入 Fastify Response |
| B5 | `src/server/sse/replayFromAudit.ts` | Last-Event-ID 补发（从 agent_audit_events 读） |
| B6 | `src/runtime/engine/AgentRuntime.ts` | 任务编排入口，快/慢路径分发 |
| B7 | `src/runtime/engine/QueryRuntime.ts` | QueryEngine 服务化 facade（去 Ink 依赖） |
| B8 | `src/runtime/engine/ToolLoop.ts` | ToolLoop 改造（接收 SessionContext，写 AuditTrail） |
| B9 | `src/runtime/permission/PermissionGate.ts` | 三级权限 + HITL 挂起（写 task_resume_queue） |
| B9 | `src/runtime/permission/HumanConfirmManager.ts` | 确认生命周期管理（创建/超时/升级） |
| B10 | `src/runtime/engine/ErrorHandler.ts` | retry/fallback/terminate 策略 |
| B10 | `src/runtime/engine/CostMonitor.ts` | token 计数 + 预算超限 SSE warning |
| B11 | `src/runtime/state/SessionStateStore.ts` | Redis-backed session state |
| B11 | `src/runtime/state/TaskStateStore.ts` | Redis-backed task state |
| B11 | `src/runtime/state/CheckpointStore.ts` | 断点续跑 envelope 持久化 |
| B12 | `src/persistence/db/client.ts` | PostgreSQL 连接池（pg/postgres.js） |
| B12 | `src/persistence/redis/client.ts` | Redis 连接（ioredis） |
| B12 | `src/persistence/db/repositories/SessionRepository.ts` | CRUD |
| B12 | `src/persistence/db/repositories/TaskRepository.ts` | CRUD + 状态机转换 |
| B13 | `src/adapters/claude-code/ClaudeQueryAdapter.ts` | 包装 query()/QueryEngine |
| B13 | `src/adapters/claude-code/ClaudeToolAdapter.ts` | Tool ↔ BizTool 适配 |

**Phase B 验收标准（来自 spec §14.11 阶段 B）：**
- `src/entrypoints/server.ts` 可独立启动，不加载 Ink/REPL 组件
- POST /sessions → 202，POST /sessions/:id/messages → 202，GET /sessions/:id/stream → SSE 连接建立
- Runtime import 图中不出现 `src/screens`、`src/components`、`src/main.tsx`
- 并发 10 个 session 同进程运行不互相干扰

---

# Phase C 任务骨架：上下文与配置资产

| Task | 文件 | 说明 |
|------|------|------|
| C1 | `src/runtime/context/ContextEnvelopeBuilder.ts` | 从 AdapterPipeline 输出填充 ContextEnvelope |
| C2 | `src/prompts/buildSystemPrompt.ts` | 行业系统提示词组装（含知识预注入） |
| C2 | `src/prompts/buildUserMessage.ts` | 用户消息组装 |
| C2 | `src/prompts/buildTools.ts` | BizTools + 通用 Tools schema 组装 |
| C3 | `src/persistence/db/repositories/PromptRepository.ts` | |
| C4 | `src/runtime/engine/MemoryManager.ts` | 短期（Redis）+ 长期（DB）记忆读写 |
| C5 | `src/rules/RuleEngine.ts` | 基于 DSL JSON 的规则求值 |
| C5 | `src/rules/RuleEvaluator.ts` | condition.expr 沙盒执行（禁止 I/O） |
| C5 | `src/rules/RuleVersionResolver.ts` | session 绑定版本解析 |
| C6 | `src/persistence/db/repositories/RuleRepository.ts` | 规则版本 CRUD + 发布 |
| C7 | `src/server/http/routes/rules.ts` | GET/POST /api/v1/rules/:industry/versions |
| C7 | `src/server/http/routes/prompts.ts` | GET/POST /api/v1/prompts/:industry/templates |

---

# Phase D 任务骨架：行业 Adapter 与图书馆能力

| Task | 文件 | 说明 |
|------|------|------|
| D1 | `packages/industry-adapter/src/registry.ts` | IndustryRegistry.load(code) 动态加载 |
| D1 | `packages/industry-adapter/src/pipeline.ts` | SemanticMapper → BizRefBuilder → CapabilityGateway 串联 |
| D2 | `packages/industry-adapter/src/base/BaseSemanticMapper.ts` | embedding 计算框架（意图模板向量预热） |
| D2 | `packages/industry-adapter/src/base/BaseBizRefBuilder.ts` | |
| D2 | `packages/industry-adapter/src/base/BaseCapabilityGateway.ts` | |
| D3 | `packages/industry-adapter/industries/library/SemanticMapper.ts` | 图书馆意图识别 + 置信度计算 |
| D3 | `packages/industry-adapter/industries/library/BizRefBuilder.ts` | 读者/馆藏 BizRef 构建（含 BizRef 缓存） |
| D3 | `packages/industry-adapter/industries/library/CapabilityGateway.ts` | 快/慢路径路由 |
| D4 | `packages/industry-adapter/industries/library/tools/checkout_book.ts` | |
| D4 | `packages/industry-adapter/industries/library/tools/return_book.ts` | |
| D4 | `packages/industry-adapter/industries/library/tools/renew_book.ts` | |
| D4 | `packages/industry-adapter/industries/library/tools/reserve_book.ts` | |
| D4 | `packages/industry-adapter/industries/library/tools/query_holdings.ts` | |
| D4 | `packages/industry-adapter/industries/library/tools/query_reader.ts` | |
| D4 | `packages/industry-adapter/industries/library/tools/waive_fee.ts` | |
| D4 | `packages/industry-adapter/industries/library/tools/handle_dispute.ts` | |
| D4 | `packages/industry-adapter/industries/library/tools/special_auth.ts` | |
| D5 | `packages/industry-adapter/industries/library/rules/library-rules-base.json` | 初版规则 DSL（LIB-001/002/003 等） |
| D5 | `packages/industry-adapter/industries/library/prompts/system.md` | |

**Phase D 验收标准：** 扫码借书（正常读者）、读者有逾期 WARN → 人工确认、柜台归还、自助续期 4 个场景端到端联调通过。

---

# Phase E 任务骨架：复杂业务与扩展能力

| Task | 文件 | 说明 |
|------|------|------|
| E1 | 图书馆借阅全流程 BizWorkflow YAML | 断点续跑 |
| E2 | 争议处理 SubAgent | SubAgentSpawner 实现 |
| E3 | 采编快工作流 | WorkflowTool 行业扩展 |
| E4 | `src/runtime/engine/StreamingDispatcher.ts` | SSE 事件分发 + 中断注入 |
| E5 | OutputValidator | 输出合规性检查 |

---

# Phase F 任务骨架：治理、测试与上线

| Task | 文件 | 说明 |
|------|------|------|
| F1 | 审计链路全链路验证 + replay 测试 | |
| F2 | 行业切换集成测试（LibraryAdapter + TobaccoAdapter stub） | |
| F3 | 性能基准测试（快路径 P99 ≤ 500ms，AuditConsumer lag ≤ 5s） | |
| F4 | `Dockerfile` + `docker-compose.yml` | PostgreSQL + Redis + Milvus + Runtime |
| F5 | 运维手册 | 启动、扩容、规则发布、审计查询指南 |
