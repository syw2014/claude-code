# 行业 Agent Runtime 架构设计

**日期**：2026-04-27  
**状态**：待实现  
**背景文档**：行业 Agent 架构方案设计 v0.0.2

---

## 1. 背景与目标

### 1.1 定位

基于当前 Claude Code 代码库做产品级二次开发，构建一个面向图书馆行业（后续扩展至烟草、水务等）的公共 Agent Runtime 后端服务。前端 Web 系统独立开发，通过 HTTP/WebSocket 接入本 Runtime。

### 1.2 核心设计目标

- **完整审计链路**：每次业务处理的全链路（请求、意图识别、工具调用、权限判定、人工确认、响应）均持久化，支持复查和合规审计
- **多行业可切换**：Industry Adapter 层纯插拔，切换行业只替换 Adapter 包，AgentRuntime 不感知行业差异
- **高并发多用户**：同进程支持大量并发会话，SessionContext 替换模块级单例，支持水平扩展
- **快路径直通**：高频确定性操作（借还书等）绕过 LLM，直接路由到 BizTool，Runtime 内部处理 ≤ 50ms，端到端（含 BizRefBuilder 外部调用）目标 ≤ 500ms
- **人机边界清晰**：高风险操作强制人工确认，确认结果纳入审计链路

---

## 2. 整体架构分层

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 6  前端 Web App（独立开发，通过 HTTP/WS 接入）         │
├─────────────────────────────────────────────────────────────┤
│  Layer 5  IndustryGateway                                    │
│           src/entrypoints/server.ts（新建）                  │
│           HTTP + WebSocket/SSE 服务入口                      │
│           会话管理、鉴权、行业路由、流式推送                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 4  Industry Adapter（可插拔行业中间层）                │
│           SemanticMapper | BizRefBuilder | CapabilityGateway │
│           packages/industry-adapter/<industry>/              │
├─────────────────────────────────────────────────────────────┤
│  Layer 3  AgentRuntime 核心（改造自现有 QueryEngine 体系）    │
│           QueryEngine | PlanningEngine | ToolLoop            │
│           PermissionGate | SubAgentSpawner | MemoryManager   │
│           StreamingDispatcher | SessionState | Logger        │
│           ErrorHandler | CostMonitor | CheckpointResume      │
├─────────────────────────────────────────────────────────────┤
│  Layer 2  Capability 层                                      │
│           通用：Tools / Skills / WorkflowTool / MCPTool      │
│           行业：BizTools / BizSkills / BizWorkflows / Rules  │
├─────────────────────────────────────────────────────────────┤
│  Layer 1  数据存储层                                          │
│           Memory 库 | 知识库（RAG）| 规则库 | Prompt 库       │
│           AuditStore（专用审计存储）                          │
└─────────────────────────────────────────────────────────────┘

AuditTrail（横切关注点，贯穿 Layer 2-5，写入 Layer 1 AuditStore）
```

---

## 3. SessionContext 重构（多并发核心）

### 3.1 问题

`src/bootstrap/state.ts` 现有模块级单例（sessionId、CWD、tokenCounts、permissionMode 等）导致同进程无法运行多个并发会话。

### 3.2 解决方案

将所有单例迁移至显式传递的 `SessionContext` 对象，QueryEngine 改为纯无状态服务。

工程实现中采用 `SessionContext + ContextEnvelope` 双对象模型：

- `SessionContext` 是运行时对象，承载依赖注入、连接句柄、writer、store、adapter、权限模式等不可直接持久化的资源。
- `ContextEnvelope` 是可序列化上下文快照，承载当前任务、业务对象引用、规则绑定、记忆引用、计划状态、工具结果摘要等，可写入 Redis、PostgreSQL 和 AuditTrail。
- Runtime 内部传递 `SessionContext`，跨进程恢复、审计回放、Prompt 构建和前端状态查询使用 `ContextEnvelope`。

```typescript
interface SessionContext {
  // 原 bootstrap/state.ts 单例迁入
  sessionId: UUID
  traceId: UUID
  taskId?: UUID
  cwd: string
  projectRoot: string
  tokenCounts: TokenCounts
  permissionMode: PermissionMode
  modelOverride?: string

  // 行业上下文
  industryCode: string            // "library" | "tobacco" | "water" | ...
  userId: string
  tenantId: string
  industryAdapter: IndustryAdapter
  ruleSet: RuleSet

  // 审计上下文
  auditWriter: AuditWriter

  // 外置存储访问（依赖注入，不可序列化）
  sessionStore: SessionStore      // Redis（会话级状态）
  memoryStore: MemoryStore        // 长期记忆（跨会话）
  ruleStore: RuleStore
  promptStore: PromptStore
  knowledgeStore: KnowledgeStore

  // Human-in-the-Loop 状态
  pendingConfirm?: ConfirmRequest
  sseWriter?: SSEWriter           // 流式推送给前端（非 SSE 模式下可缺省）

  // 可序列化上下文快照（请求级业务数据由此持有，跨节点恢复时重建 SessionContext 后挂载）
  envelope: ContextEnvelope
}
```

> **权威定义见 §14.2.1。** 此处为概念视图；请求级业务数据（currentIntent、bizRefs、factSet 等）属于 `ContextEnvelope` 字段（见 §14.2.2），不挂在 SessionContext 上，避免混淆运行时资源与可序列化快照。

### 3.3 调用链传递

```
IndustryGateway.handleRequest()
  → createSessionContext(request)
  → QueryEngine.run(prompt, ctx)
    → PlanningEngine.plan(task, ctx)
    → ToolLoop.execute(tool, input, ctx)
      → RuleEngine.check(operation, ctx)
      → PermissionGate.check(op, ctx)
      → BizTool.call(params, ctx)
      → AuditWriter.record(event, ctx)
```

### 3.4 改造范围

`bootstrap/state.ts` 的 getter/setter 散布约 30-40 个文件，采用逐步迁移策略：先加 `SessionContext` 参数重载，再替换调用，最后删除旧单例，可分期完成不影响主干。

### 3.5 水平扩展

```
                    负载均衡
                    /      \
          Server Node A    Server Node B
          /    |    \        /    |    \
        ctx  ctx   ctx    ctx  ctx   ctx
          \    |    /        \    |    /
           Redis（SessionStore / AuditBuffer / RuleStore）
                    |
              持久化 DB（AuditStore / MemoryStore / PromptStore）
```

节点间无共享内存，SessionStore 外置 Redis 支持会话跨节点恢复。

---

## 4. IndustryGateway（服务入口层）

### 4.1 新建文件

`src/entrypoints/server.ts` — 完全绕开 Ink/CLI 层，直接把 QueryEngine 作为服务核心对外暴露。

### 4.2 对外接口

```
POST   /api/v1/sessions                    — 创建会话（绑定 industryCode、userId）
DELETE /api/v1/sessions/:id                — 关闭会话
POST   /api/v1/sessions/:id/messages       — 发送消息（触发 Agent 处理）
GET    /api/v1/sessions/:id/stream         — SSE 流式推送（响应 + 工具状态 + 确认请求）
POST   /api/v1/sessions/:id/confirm        — 人工确认回调（Human-in-the-Loop）
GET    /api/v1/audit/traces                — 审计链路查询
GET    /api/v1/audit/traces/:traceId/events — 还原完整链路事件
GET    /api/v1/audit/sessions/:id/replay   — 逐步回放
```

### 4.3 会话生命周期

```
POST /sessions
  → 从 IndustryRegistry.load(industryCode) 加载对应 Adapter
  → 创建 SessionContext（含 traceId、auditWriter、sseWriter）
  → 注册 BizTools / BizSkills / BizWorkflows（行业工具集）
  → AuditTrail 开始记录

POST /sessions/:id/messages
  → Industry Adapter Pipeline（SemanticMapper → BizRefBuilder → CapabilityGateway）
  → 快路径判断 → 快路径直通 或 进入 QueryEngine
  → SSE 实时推送

DELETE /sessions/:id
  → AuditTrail flush → 写入 AuditStore
  → 清理会话资源
```

### 4.4 多租户隔离

每个会话独立 `SessionContext` 实例，行业上下文、用户信息、Token 计数全部在上下文内隔离，同进程并发运行互不干扰。

---

## 5. Industry Adapter 层

### 5.1 包结构

```
packages/industry-adapter/
  ├── src/
  │   ├── types.ts                    — IndustryAdapter 接口定义
  │   ├── registry.ts                 — IndustryRegistry（按 industryCode 加载）
  │   ├── pipeline.ts                 — 三层 Pipeline 串联执行
  │   └── base/
  │       ├── BaseSemanticMapper.ts
  │       ├── BaseBizRefBuilder.ts
  │       └── BaseCapabilityGateway.ts
  └── industries/
      ├── library/                    — 图书馆（Phase 2 实现）
      │   ├── SemanticMapper.ts
      │   ├── BizRefBuilder.ts
      │   ├── CapabilityGateway.ts
      │   ├── tools/                  — BizTools（API 封装）
      │   ├── skills/                 — BizSkills（Markdown）
      │   ├── workflows/              — BizWorkflows（YAML）
      │   └── rules/                  — 业务规则集
      ├── tobacco/                    — 烟草（Phase 5 验证实现）
      └── water/                      — 水务（Phase 5 验证实现）
```

### 5.2 IndustryAdapter 接口

```typescript
interface IndustryAdapter {
  industryCode: string
  semanticMapper: SemanticMapper
  bizRefBuilder: BizRefBuilder
  capabilityGateway: CapabilityGateway
  getBizTools(): Tool[]
  getBizSkills(): Skill[]
  getBizWorkflows(): Workflow[]
  getRules(): RuleSet
}
```

### 5.3 三层 Pipeline

**SemanticMapper** — 行业动词 → 标准 sceneCode + actionCode：

| 图书馆业务动词 | 标准 sceneCode | actionCode | pathType |
|-------------|--------------|-----------|---------|
| 扫码借书 | `CIRCULATION_CHECKOUT` | `ACTION_INIT` | fast |
| 柜台归还 | `CIRCULATION_RETURN` | `ACTION_INIT` | fast |
| 自助续期 | `CIRCULATION_RENEW` | `ACTION_INIT` | fast |
| 预约取书 | `CIRCULATION_RESERVE_FULFILL` | `ACTION_INIT` | fast |
| 状态争议处理 | `DISPUTE_STATUS` | `ACTION_INIT` | complex |
| 费用争议核查 | `DISPUTE_FEE` | `ACTION_INIT` | complex |
| 特殊授权审核 | `AUTH_SPECIAL` | `ACTION_INIT` | complex |
| 异常工单处理 | `INCIDENT_HANDLE` | `ACTION_INIT` | complex |

**置信度计算（三层）：**

置信度由三个分量加权合成，任一分量异常时整体置信度下降：

```typescript
interface ConfidenceScore {
  keywordMatch: number    // 关键词精确命中分数（0-1）：基于术语表精确/模糊匹配
  structureMatch: number  // 输入结构完整度（0-1）：必填参数（读者ID、馆藏号等）是否存在
  contextConsistency: number // 上下文一致性（0-1）：当前意图与会话历史是否连贯
}

function calcConfidence(scores: ConfidenceScore): number {
  return scores.keywordMatch * 0.5
       + scores.structureMatch * 0.3
       + scores.contextConsistency * 0.2
}
```

三级置信度分区：

| 置信度区间 | 处理策略 | 典型场景 |
|---------|---------|---------|
| `>= 0.95` | 进入快路径（pathType='fast' 时） | "扫码借书，读者A，馆藏B" |
| `0.7 - 0.95` | 进入慢路径，LLM 意图补全 | "帮我借一下那本书" |
| `< 0.7` | 慢路径 + 主动追问 | 含歧义或缺少关键实体的输入 |

置信度计算必须在 SemanticMapper 内同步完成（< 10ms），不得调用外部服务。术语表从 `ctx.promptStore` 加载（Redis 热缓存）。

**BizRefBuilder** — 行业对象 → BizRef + FactSet：

```
Reader { readerId, cardStatus, borrowQuota, overdueCount }
  → BizRef { type: "READER", id, status: ACTIVE/SUSPENDED,
             attrs: { quota, overdue, tier },
             constraints: [MAX_BORROW_EXCEEDED?, CARD_FROZEN?] }

BookCopy { copyId, isbn, location, copyStatus }
  → BizRef { type: "BOOK_COPY", id, status: AVAILABLE/ON_LOAN,
             attrs: { isbn, location, condition },
             constraints: [RESTRICTED_ACCESS?] }

→ FactSet: { overdue: true, feeOwed: 12.5, renewExhausted: false, ... }
```

**CapabilityGateway** — 三通道路由：

- **Tool 通道**：确定性直接 API 调用（快路径，同步执行，直接生效）
- **Skill 通道**：上下文注入 + 模型推理（非确定性，输出建议）
- **SubAgent 通道**：派生子 Agent（长流程、异步、争议分析、多轮核查）

### 5.4 多行业切换

```typescript
// IndustryRegistry 按 industryCode 动态加载
IndustryRegistry.load("library")  → LibraryAdapter
IndustryRegistry.load("tobacco")  → TobaccoAdapter
IndustryRegistry.load("water")    → WaterAdapter
```

切换行业只替换 Adapter 包，Layer 3 AgentRuntime 完全不感知行业差异。

---

## 6. 快路径（Fast Path）

### 6.1 命中条件（三者同时满足）

```typescript
function shouldUseFastPath(intent: NormalizedIntent, ctx: SessionContext): boolean {
  return (
    intent.confidence >= 0.95 &&           // 语义匹配置信度足够高
    intent.pathType === 'fast' &&           // SemanticMapper 标记为快路径
    intent.requiredParams.every(p =>        // 所有必要参数已齐备
      p in ctx.envelope.bizRefs)            // bizRefs 在 ContextEnvelope 中（见 §14.2.2）
  )
}
```

### 6.2 快路径执行流

```
Input → SemanticMapper（confidence=0.97, pathType='fast'）
  → BizRefBuilder（构建 BizRef + FactSet）
  → RuleEngine.check()（业务规则校验）
  → PermissionGate（按权限级别决定是否挂起）
  → BizTool.execute()（直接调用业务 API）
  → AuditTrail.record()（全链路写入）
  → SSE 推送结果
```

**无 LLM 参与。** 时间目标：
- SemanticMapper + RuleEngine 内部处理：≤ 50ms（纯计算，无外部 I/O）
- BizRefBuilder：调用行业业务系统读取读者/馆藏状态，受外部系统延迟影响，建议行业系统提供 ≤ 200ms 的查询 SLA
- 端到端快路径（前端收到结果）：目标 ≤ 500ms（不含网络传输和人工确认等待）
- 对比慢路径（含 LLM 推理）：2-5s

> BizRefBuilder 的网络 I/O 是快路径主要延迟来源。若行业系统不能满足 SLA，可考虑对高频对象（当班读者）加 Redis 缓存，TTL ≤ 30s。

### 6.3 降级条件

| 条件 | 降级策略 |
|-----|--------|
| confidence < 0.95 | 进入 QueryEngine，LLM 补全意图 |
| 必要参数缺失 | LLM 发起追问（AskUserQuestion） |
| RuleEngine 阻断 | Human-in-the-Loop 等待确认 |
| BizTool 执行失败 | ErrorHandler 决策 retry / escalate |

---

## 7. AgentRuntime 核心改造

所有模块均接收 `SessionContext` 作为参数，去掉模块级单例依赖。

| 模块 | 改造点 | 新增点 |
|-----|-------|-------|
| QueryEngine | 去掉 Ink 渲染依赖，输出改为 SSE 事件流 | 接收 ctx.industryAdapter 注入的 BizTools/BizSkills |
| PlanningEngine | 每次 tool call 后计划状态写入 ctx.sessionStore | plan 快照写入 AuditTrail |
| PermissionGate | 从 ctx.permissionMode 读取，不再从单例读 | 行业规则校验 + Human-in-the-Loop 挂起 |
| SubAgentSpawner | 子 Agent 继承父 SessionContext | 子 Agent 的 tool call 归入同一 traceId |
| MemoryManager | Memory 读写全部带 ctx 传递 | 短期→Redis，长期→DB，按 userId 隔离 |
| StreamingDispatcher | 输出目标从 Ink stdout 改为 ctx.sseWriter | 中断插入机制（前端注入人工指令） |
| ErrorHandler | 保留 retry/fallback/terminate 策略 | 异常事件写入 AuditTrail |
| CostMonitor | token 计数从 ctx.tokenCounts 读写 | 超限时推 SSE warning 事件 |

---

## 8. Capability 层

### 8.1 通用工具（复用现有，无需改造）

文件操作、BashTool、AgentTool、WorkflowTool、SkillTool、MCPTool、WebFetch 等均直接复用 `packages/builtin-tools/`。

### 8.2 行业 BizTools（图书馆初版）

```typescript
abstract class BizTool implements Tool {
  abstract name: string
  abstract permissionLevel: 'low' | 'medium' | 'high'
  abstract execute(input: unknown, ctx: SessionContext): Promise<ToolResult>
}
```

| Tool 名 | 领域服务 | 权限级别 |
|--------|---------|---------|
| `checkout_book` | 借阅服务 | medium |
| `return_book` | 借阅服务 | low |
| `renew_book` | 借阅服务 | low |
| `reserve_book` | 借阅服务 | low |
| `query_holdings` | 馆藏服务 | low |
| `query_reader` | 读者服务 | low |
| `waive_fee` | 费用服务 | high |
| `handle_dispute` | 规则引擎 | high |
| `special_auth` | 权限服务 | high |

### 8.3 行业 BizSkills（Markdown 驱动）

存储于 `industries/library/skills/`，头部元数据声明所需工具和权限级别：

```markdown
---
name: book-acquisition-flow
description: 图书采编完整流程（选书→报批→采购→编目）
industry: library
requires_tools: [query_holdings, submit_order, catalog_book]
permission_level: medium
---
```

### 8.4 行业 BizWorkflows（YAML 驱动）

存储于 `industries/library/workflows/`，复用现有 WorkflowTool 机制，执行状态写入 `ctx.sessionStore`，支持断点续跑。

### 8.5 Rule Engine

```typescript
interface RuleSet {
  check(operation: string, ctx: SessionContext): RuleCheckResult
  // 返回：{ result: 'PASS' | 'WARN' | 'BLOCKED', reason?: string, warnings?: string[] }
}
```

规则存储在 Redis（热加载）+ YAML 版本文件（源文件），支持灰度发布和回滚，变更无需重启服务。

---

## 9. Human-in-the-Loop 与 Permission Gate

### 9.1 三级权限模型

| 级别 | 行为 | 示例 |
|-----|-----|-----|
| low | 自动执行，仅 AuditTrail 记录 | 查询馆藏、查询读者、自助续期 |
| medium | RuleEngine PASS 则自动执行，WARN 则挂起确认 | 扫码借书（读者有逾期时） |
| high | 无论规则结果，强制人工确认 | 免除费用、特殊授权、异常工单 |

### 9.2 挂起与确认流程

```
PermissionGate 挂起
  → ctx.pendingConfirm = { operation, bizRefs, factSet, ruleWarnings, requiredApproverRole }
  → SSE 推送 { type: 'permission_required', payload }
  → 前端展示确认卡片
  → 馆员确认：POST /sessions/:id/confirm { decision: 'approve'|'reject', confirmedBy }
  → AuditTrail.record { type: 'human_confirm', decision, confirmedBy, timestamp }
  → 继续执行 或 终止
```

### 9.3 超时处理

挂起超过配置时长（默认 5 分钟）未确认，操作自动取消，SSE 推送 timeout 事件，AuditTrail 记录，会话保持存活。

### 9.4 审批角色链

不同操作配置 `requiredApproverRole: 'librarian' | 'supervisor' | 'admin'`，运行时校验 `ctx.userId` 的角色，无权则自动上报更高角色。

---

## 10. 数据存储层

### 10.1 Memory 库

| 类型 | 存储 | TTL | 隔离 |
|-----|-----|-----|-----|
| 短期记忆（会话级） | Redis | 会话存活时间 | 按 sessionId |
| 长期记忆（跨会话） | PostgreSQL/MongoDB | 永久 | 按 userId + industryCode |

### 10.2 知识库（RAG）

向量数据库（Qdrant / pgvector）+ 原文索引，封装为 `KnowledgeQueryTool`，按 `industryCode` 隔离知识空间，管理后台导入触发向量重建。

**检索触发模式（三种，按场景选择）：**

| 触发模式 | 时机 | 适用场景 |
|---------|-----|---------|
| **显式工具调用** | LLM 或规划引擎主动调用 `KnowledgeQueryTool` | 争议处理、特殊授权等复杂慢路径，LLM 判断何时需要查阅制度 |
| **上下文预注入** | `ContextEnvelopeBuilder` 在构建 envelope 时根据 `sceneCode` 自动检索并写入 `promptRefs` | 常见场景（借书、归还）的提示词中自动附带政策背景，无需 LLM 发起工具调用 |
| **按需混合** | 慢路径中先注入 top-K 粗排结果（置信度 < 阈值），LLM 决定是否精排追问 | 意图不明确但涉及业务规则的中等置信度场景 |

**检索约束：**
- 所有检索必须携带 `tenant_id` 和 `industry_code` 过滤条件（见 §14.3.15）。
- 检索结果 chunk 的 `chunk_id` 必须写入 `ContextEnvelope.promptRefs` 和对应审计事件（`knowledge_query`），保证可审计。
- 上下文预注入的 token 预算由 `CostMonitor` 控制，超预算时降级为不注入。

### 10.3 规则库

Redis（热数据）+ 版本化 YAML（源文件），支持灰度发布和回滚，新建会话使用最新版本，存量会话沿用旧版本至会话结束。

### 10.4 Prompt 库

```
prompts/
  library/
    ├── system.md              — 图书馆馆员助手系统提示词
    ├── scenes/
    │   ├── checkout.md        — 借阅场景模板
    │   ├── dispute.md         — 争议处理场景模板
    │   └── inventory.md       — 盘点场景模板
    └── glossary.json          — 图书馆术语 → 标准意图映射表
  tobacco/                     — 烟草（预留）
  water/                       — 水务（预留）
```

Redis 热加载，Git 版本管理源文件。

### 10.5 AuditStore（审计专用）

**写入链路（异步，不阻塞主流程）**：

```
AuditWriter.record() → Redis Stream（缓冲）
  → AuditConsumer（后台消费者）
  → PostgreSQL AuditLog 表（持久化）
```

**AuditEvent 类型**：

```typescript
type AuditEvent =
  | { type: 'request_received';  input: string; normalizedIntent: NormalizedIntent }
  | { type: 'plan_created';      steps: PlanStep[] }
  | { type: 'tool_call';         tool: string; input: unknown; output: unknown; durationMs: number }
  | { type: 'permission_check';  operation: string; result: 'allowed'|'denied'|'pending_human' }
  | { type: 'human_confirm';     operation: string; confirmedBy: string; decision: string }
  | { type: 'subagent_spawned';  subAgentId: string; task: string }
  | { type: 'error';             tool: string; error: string; retryCount: number }
  | { type: 'permission_timeout';operation: string }
  | { type: 'response_sent';     output: string; tokensUsed: number }

// 每个事件的公共字段
interface AuditEventBase {
  traceId: UUID
  sessionId: UUID
  userId: string
  tenantId: string
  industryCode: string
  timestamp: number
}
```

**查询接口**：

```
GET /api/v1/audit/traces?sessionId=&userId=&from=&to=
GET /api/v1/audit/traces/:traceId/events
GET /api/v1/audit/sessions/:sessionId/replay
```

---

## 11. 完整请求链路示例

以「扫码借书，读者有逾期记录」为例：

```
① 前端：POST /sessions/:id/messages { input: "扫码借书，读者A，馆藏B" }

② SemanticMapper
   confidence=0.97 → CIRCULATION_CHECKOUT, pathType='fast'

③ BizRefBuilder
   Reader BizRef { constraints: [OVERDUE_WARNING] }
   BookCopy BizRef { status: AVAILABLE }

④ 快路径判断
   shouldUseFastPath → true（confidence 高，参数齐备）

⑤ RuleEngine.check('checkout_book')
   → WARN（读者有逾期记录）

⑥ PermissionGate（medium + WARN）
   → 挂起，SSE 推送 { type: 'permission_required' }

⑦ 前端展示确认卡片，馆员点击「确认借出」

⑧ POST /sessions/:id/confirm { decision: 'approve', confirmedBy: 'librarian_001' }

⑨ CheckoutBookTool.execute({ readerId: 'A', copyId: 'B' }, ctx)
   → libraryApi.checkout()

⑩ AuditTrail 写入完整事件链（步骤②~⑨每跳均记录）

⑪ SSE 推送借阅成功结果
```

---

## 12. 分层开发路线

详细开发阶段划分（阶段 A-F）及各阶段交付物见 §14.11 任务规划映射。

---

## 13. 关键技术决策记录

| 决策 | 选择 | 理由 |
|-----|-----|-----|
| 并发模型 | SessionContext 替换单例（方案 C） | 同进程高并发，无 Worker 线程开销 |
| 行业切换 | IndustryRegistry 插拔式加载 | Runtime 不感知行业差异，切换只换 Adapter |
| 快路径 | 绕过 LLM 直通 BizTool | 内部 ≤ 50ms，端到端目标 ≤ 500ms（受行业系统 SLA 约束），LLM 仅用于复杂场景 |
| 审计 | 横切关注点 + Redis Stream 异步写入 | 不阻塞主流程，Redis 缓冲防止写入压力 |
| 规则热加载 | Redis + YAML 版本管理 | 规则变更无需重启，支持灰度发布 |
| Session 外置 | Redis SessionStore | 支持水平扩展，多节点会话可恢复 |

---

## 14. 工程化落地规格

本章是后续开发的工程契约，补齐运行模型、数据库表结构、数据模型、API 入参与出参、审计数据访问、状态机、规则权限、测试验收和任务映射。前文保持总体架构视角，本章作为实现时的准入标准。

### 14.1 默认技术栈与数据职责

默认采用 PostgreSQL + Redis + Milvus/向量库：

| 组件 | 职责 | 是否事实源 |
|-----|-----|-----------|
| PostgreSQL | 会话、任务、消息、工具调用、人工确认、审计事件、规则版本、Prompt 模板、Memory 元数据、知识源元数据 | 是 |
| Redis | SessionStore、任务队列、SSE 连接索引、Audit Redis Stream、热规则缓存、短期记忆、幂等键 | 否，除短期状态外均可从 PostgreSQL 重建 |
| Milvus/向量库 | 知识库向量索引、embedding 检索 | 否，原文和元数据在 PostgreSQL，向量可重建 |
| 行业业务系统 | 读者、馆藏、借阅、费用、工单等业务事实 | 是，Runtime 只保存引用、快照和审计链 |

数据来源原则：

- 当前会话进度优先读 Redis SessionStore，持久化查询读 PostgreSQL。
- 审计查询和回放以 PostgreSQL `agent_audit_events` 为事实源，不直接读取 Redis Stream。
- 知识检索先查 Milvus 获取候选，再按 `source_id/chunk_id` 回 PostgreSQL 获取原文和权限元数据。
- 业务对象当前状态从行业业务系统读取，业务对象历史状态从审计事件快照读取，避免 replay 被当前状态污染。

### 14.2 核心运行模型

#### 14.2.1 SessionContext

`SessionContext` 只在进程内流转，不直接入库。

```typescript
interface SessionContext {
  sessionId: UUID
  traceId: UUID
  taskId?: UUID
  tenantId: string
  userId: string
  industryCode: string
  cwd: string
  projectRoot: string
  permissionMode: PermissionMode
  tokenCounts: TokenCounts
  modelOverride?: string
  industryAdapter: IndustryAdapter
  ruleSet: RuleSet
  auditWriter: AuditWriter
  sessionStore: SessionStore
  memoryStore: MemoryStore
  ruleStore: RuleStore
  promptStore: PromptStore
  knowledgeStore: KnowledgeStore
  sseWriter?: SSEWriter
  pendingConfirm?: ConfirmRequest
  envelope: ContextEnvelope
}
```

#### 14.2.2 ContextEnvelope

`ContextEnvelope` 是上下文快照，必须可 JSON 序列化。

```typescript
interface ContextEnvelope {
  schemaVersion: 1
  sessionId: UUID
  traceId: UUID
  taskId?: UUID
  tenantId: string
  userId: string
  industryCode: string
  turnId: UUID
  currentIntent?: NormalizedIntent
  bizRefs: Record<string, BizRef>
  factSet: FactSet
  memoryRefs: MemoryRef[]
  ruleBindings: RuleBinding[]
  capabilityBindings: CapabilityBinding[]
  planState?: PlanState
  priorToolResults: ToolResultSummary[]
  promptRefs: PromptRef[]
  costState: CostState
  createdAt: string
  updatedAt: string
}
```

#### 14.2.3 其他核心模型

```typescript
type UUID = string

interface TaskRun {
  id: UUID
  sessionId: UUID
  traceId: UUID
  tenantId: string
  userId: string
  industryCode: string
  input: string
  mode: 'fast' | 'agent' | 'workflow' | 'subagent'
  status: TaskStatus
  envelope: ContextEnvelope
  startedAt?: string
  completedAt?: string
}

interface RunRef {
  type: 'session' | 'task' | 'tool_call' | 'workflow' | 'subagent'
  id: UUID
  traceId: UUID
}

interface BizRef {
  type: string
  id: string
  displayName?: string
  status?: string
  attrs: Record<string, unknown>
  constraints: string[]
  sourceSystem: string
  snapshotAt: string
}

interface FactSet {
  facts: Record<string, unknown>
  sources: Array<{ key: string; source: string; confidence?: number }>
  builtAt: string
}

interface RuleBinding {
  ruleId: string
  ruleVersion: string
  operation: string
  result: 'PASS' | 'WARN' | 'BLOCKED'
  reasons: string[]
}

interface CapabilityBinding {
  channel: 'tool' | 'skill' | 'workflow' | 'subagent'
  capabilityName: string
  permissionLevel: 'low' | 'medium' | 'high'
  confirmLevel: ConfirmLevel
}

interface ToolCallRecord {
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

interface ConfirmRequest {
  id: UUID
  sessionId: UUID
  taskId: UUID
  traceId: UUID
  operation: string
  confirmLevel: ConfirmLevel
  requiredApproverRole: 'user' | 'librarian' | 'supervisor' | 'admin'
  bizRefs: Record<string, BizRef>
  factSet: FactSet
  ruleWarnings: string[]
  expiresAt: string
}

type ConfirmLevel =
  | 'auto'
  | 'silent_confirm'
  | 'explicit_confirm'
  | 'supervisor_approval'

interface ApiError {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}
```

#### 14.2.4 ContextEnvelope 压缩策略

`priorToolResults: ToolResultSummary[]` 随 turn 数量累积会无界增长，需要主动压缩：

- **最大保留条数**：默认保留最近 **20 条** ToolResultSummary。
- **压缩触发时机**：每次 `turnId` 更新（即新一轮用户输入开始）时，由 `ContextEnvelopeBuilder` 检查并执行压缩。
- **压缩策略**：
  - 保留最近 20 条完整 ToolResultSummary。
  - 超出部分聚合为一条 `{ type: 'compacted_summary', count: N, rangeStart: turnId, rangeEnd: turnId, summary: string }` 追加到头部。
  - 聚合摘要由 LLM 生成或取 output 字段前 200 字符拼接。
- **持久化保证**：压缩前的完整 ToolResultSummary 已写入 `agent_audit_events`，压缩只影响 envelope 快照，不影响审计链路。

#### 14.2.5 跨节点 HITL 恢复机制

PermissionGate 触发 HITL 时，确认回调可能到达不同的服务节点。节点间无共享内存，依赖 Redis 队列实现跨节点恢复：

**挂起流程（触发节点）：**

```
PermissionGate.suspend()
  → 将当前 ContextEnvelope（含 suspendPoint: { toolCallId, resumeAfterConfirm }）
    写入 Redis task:{tenantId}:{taskId}（更新 suspendPoint 字段）
  → UPDATE agent_tasks SET status='waiting_confirm', envelope=... WHERE id=taskId
  → INSERT agent_human_confirms(status='pending', expires_at=now()+5min, ...)
  → SSE 推送 { type: 'permission_required', confirmId, ... }
  → Task Handler 返回（不阻塞线程，连接释放）
```

**确认回调（任意节点）：**

```
POST /sessions/:id/confirm
  → 校验 confirmId 存在且 status='pending'，校验 confirmedRole 权限
  → UPDATE agent_human_confirms SET status='approved'/'rejected', confirmed_by=...
  → XADD task_resume_queue:{tenantId} { taskId, sessionId, confirmId, decision,
      confirmedBy, confirmedRole, traceId }
  → 写 agent_audit_events(human_confirm)
  → SSE 推送 { type: 'permission_resolved', decision }
  → 返回 202 Accepted（不等待 Task 完成）
```

**工作节点恢复（任意空闲节点）：**

```
TaskWorker.consumeResumeQueue()
  → XREADGROUP task_resume_queue:{tenantId} GROUP workers consumer_id
  → 读 Redis task:{tenantId}:{taskId} 获取 TaskRun + ContextEnvelope + suspendPoint
  → 如 Redis 缺失，从 agent_tasks.envelope 重建
  → 重建 SessionContext（从 SessionStore + IndustryRegistry + 依赖注入）
  → ctx.envelope = 恢复的 ContextEnvelope
  → 从 suspendPoint.toolCallId 之后继续 ToolLoop
  → AuditTrail 记录 tool_call_started（接续原 traceId, sequence 递增）
```

**超时处理：**

- 定时任务每分钟扫描 `agent_human_confirms WHERE status='pending' AND expires_at < now()`。
- 对每条超时记录 XADD 超时 resume 消息（decision='timeout'）。
- TaskWorker 收到后将 task 标记为 `timeout`，写 `permission_timeout` 审计事件。

**Redis 新增 Key：**

| Key | 类型 | TTL | 说明 |
|-----|-----|-----|-----|
| `task_resume_queue:{tenantId}` | stream | 消费后 24h | 跨节点 HITL 恢复消息队列，TaskWorker XREADGROUP 消费 |

### 14.3 PostgreSQL 表结构设计

所有业务表必须包含 `tenant_id`，跨租户查询默认禁止。时间字段统一使用 `timestamptz`。JSON 扩展字段统一使用 `jsonb`。主键默认 `uuid`。

#### 14.3.1 `agent_sessions`

会话事实表。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | sessionId |
| tenant_id | text not null | 租户 |
| user_id | text not null | 用户 |
| industry_code | text not null | 行业 |
| status | text not null | SessionStatus |
| permission_mode | text not null | 权限模式 |
| model_override | text null | 模型覆盖 |
| current_trace_id | uuid null | 当前 trace |
| metadata | jsonb not null default '{}' | 扩展信息 |
| created_at | timestamptz not null | 创建时间 |
| updated_at | timestamptz not null | 更新时间 |
| closed_at | timestamptz null | 关闭时间 |

索引：

- `(tenant_id, user_id, created_at desc)`
- `(tenant_id, industry_code, status)`
- `(current_trace_id)`

#### 14.3.2 `agent_tasks`

一次用户输入或工作流触发生成一个 task。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | taskId |
| session_id | uuid not null | 会话 |
| trace_id | uuid not null | 审计链 |
| tenant_id | text not null | 租户 |
| user_id | text not null | 用户 |
| industry_code | text not null | 行业 |
| parent_task_id | uuid null | 子任务父级 |
| input_text | text not null | 原始输入 |
| mode | text not null | fast/agent/workflow/subagent |
| status | text not null | TaskStatus |
| envelope | jsonb not null | ContextEnvelope 快照 |
| idempotency_key | text null | 幂等键 |
| started_at | timestamptz null | 开始时间 |
| completed_at | timestamptz null | 完成时间 |
| created_at | timestamptz not null | 创建时间 |
| updated_at | timestamptz not null | 更新时间 |

约束与索引：

- `unique (tenant_id, session_id, idempotency_key)` where `idempotency_key is not null`
- `(tenant_id, session_id, created_at desc)`
- `(tenant_id, trace_id)`
- `(tenant_id, status, created_at)`

#### 14.3.3 `agent_messages`

保存用户、助手、系统和工具结果消息。大字段可按生命周期归档。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | messageId |
| session_id | uuid not null | 会话 |
| task_id | uuid null | 所属任务 |
| trace_id | uuid not null | 审计链 |
| tenant_id | text not null | 租户 |
| role | text not null | user/assistant/system/tool |
| content | jsonb not null | 标准消息体 |
| sequence | bigint not null | 会话内递增 |
| token_count | integer null | token 数 |
| created_at | timestamptz not null | 创建时间 |

索引：

- `unique (tenant_id, session_id, sequence)`
- `(tenant_id, task_id, sequence)`
- `(tenant_id, trace_id, sequence)`

#### 14.3.4 `agent_tool_calls`

工具调用事实表。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | toolCallId |
| session_id | uuid not null | 会话 |
| task_id | uuid not null | 任务 |
| trace_id | uuid not null | 审计链 |
| tenant_id | text not null | 租户 |
| tool_name | text not null | 工具名 |
| channel | text not null | common_tool/biz_tool/mcp_tool/workflow_tool |
| permission_level | text not null | low/medium/high |
| status | text not null | ToolCallStatus |
| input | jsonb not null | 输入 |
| output | jsonb null | 输出 |
| error | jsonb null | ApiError |
| started_at | timestamptz null | 开始 |
| completed_at | timestamptz null | 完成 |
| duration_ms | integer null | 耗时 |
| created_at | timestamptz not null | 创建 |

索引：

- `(tenant_id, task_id, created_at)`
- `(tenant_id, trace_id, created_at)`
- `(tenant_id, tool_name, created_at desc)`

#### 14.3.5 `agent_human_confirms`

人工确认与升级审批表。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | confirmId |
| session_id | uuid not null | 会话 |
| task_id | uuid not null | 任务 |
| trace_id | uuid not null | 审计链 |
| tenant_id | text not null | 租户 |
| operation | text not null | 操作 |
| confirm_level | text not null | ConfirmLevel |
| required_role | text not null | 需要角色 |
| status | text not null | ConfirmStatus |
| request_payload | jsonb not null | 展示给前端的确认卡数据 |
| decision | text null | approve/reject |
| confirmed_by | text null | 确认人 |
| confirmed_role | text null | 确认人角色 |
| confirmed_ip | inet null | 来源 IP |
| expires_at | timestamptz not null | 过期时间 |
| resolved_at | timestamptz null | 处理时间 |
| created_at | timestamptz not null | 创建时间 |

索引：

- `(tenant_id, session_id, status)`
- `(tenant_id, trace_id, created_at)`
- `(tenant_id, expires_at)` where `status = 'pending'`

#### 14.3.6 `agent_audit_events`

审计事实源，所有审计查询和 replay 默认从此表读取。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | auditEventId |
| trace_id | uuid not null | 审计链 |
| sequence | bigint not null | trace 内严格递增 |
| session_id | uuid not null | 会话 |
| task_id | uuid null | 任务 |
| tool_call_id | uuid null | 工具调用 |
| confirm_id | uuid null | 人工确认 |
| tenant_id | text not null | 租户 |
| user_id | text not null | 用户 |
| industry_code | text not null | 行业 |
| event_type | text not null | AuditEventType |
| severity | text not null | info/warn/error/security |
| payload | jsonb not null | 脱敏后的事件详情 |
| raw_ref | jsonb null | 原始数据引用，不保存敏感明文 |
| created_at | timestamptz not null | 事件时间 |

约束与索引：

- `unique (tenant_id, trace_id, sequence)`
- `(tenant_id, trace_id, sequence)`
- `(tenant_id, session_id, created_at desc)`
- `(tenant_id, event_type, created_at desc)`
- `gin (payload)`

#### 14.3.7 `agent_audit_trace_summaries`

审计列表页和管理后台筛选用的物化摘要表，由 AuditConsumer 异步维护，可从 `agent_audit_events` 重建。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| trace_id | uuid pk | 审计链 |
| tenant_id | text not null | 租户 |
| session_id | uuid not null | 会话 |
| root_task_id | uuid null | 根任务 |
| user_id | text not null | 用户 |
| industry_code | text not null | 行业 |
| status | text not null | running/succeeded/failed/cancelled |
| first_event_at | timestamptz not null | 首事件 |
| last_event_at | timestamptz not null | 末事件 |
| event_count | integer not null | 事件数 |
| has_human_confirm | boolean not null | 是否人工确认 |
| has_high_risk | boolean not null | 是否高风险 |
| summary | jsonb not null | 摘要 |

索引：

- `(tenant_id, last_event_at desc)`
- `(tenant_id, user_id, last_event_at desc)`
- `(tenant_id, industry_code, status)`

#### 14.3.8 `agent_memory_items`

长期记忆元数据与正文。短期记忆在 Redis 中，过期后不保证存在。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | memoryId |
| tenant_id | text not null | 租户 |
| user_id | text not null | 用户 |
| industry_code | text not null | 行业 |
| memory_type | text not null | preference/fact/procedure/summary |
| scope | text not null | user/tenant/industry |
| content | text not null | 可审计正文 |
| metadata | jsonb not null | 来源、置信度、标签 |
| source_trace_id | uuid null | 来源 trace |
| expires_at | timestamptz null | 过期 |
| created_at | timestamptz not null | 创建 |
| updated_at | timestamptz not null | 更新 |

索引：

- `(tenant_id, user_id, industry_code, memory_type)`
- `(tenant_id, source_trace_id)`
- `gin (metadata)`

#### 14.3.9 `agent_rule_versions`

规则版本事实表。Redis 只缓存当前生效版本。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | ruleVersionId |
| tenant_id | text not null | 租户 |
| industry_code | text not null | 行业 |
| version | text not null | 规则版本 |
| status | text not null | draft/active/retired |
| rules | jsonb not null | 规则 DSL 或结构化规则 |
| checksum | text not null | 内容校验 |
| published_by | text null | 发布人 |
| published_at | timestamptz null | 发布时间 |
| created_at | timestamptz not null | 创建 |

约束：

- `unique (tenant_id, industry_code, version)`
- 同一 `(tenant_id, industry_code)` 只能有一个 `active` 版本。

#### 14.3.10 `agent_prompt_templates`

Prompt 模板版本表。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | promptTemplateId |
| tenant_id | text not null | 租户 |
| industry_code | text not null | 行业 |
| template_key | text not null | system/scenes/checkout 等 |
| version | text not null | 版本 |
| status | text not null | draft/active/retired |
| content | text not null | 模板正文 |
| metadata | jsonb not null | cache 配置、变量声明 |
| checksum | text not null | 内容校验 |
| created_at | timestamptz not null | 创建 |
| published_at | timestamptz null | 发布 |

约束：

- `unique (tenant_id, industry_code, template_key, version)`

#### 14.3.11 `agent_knowledge_sources`

知识库原文与向量索引元数据。向量本体在 Milvus。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | sourceId |
| tenant_id | text not null | 租户 |
| industry_code | text not null | 行业 |
| title | text not null | 标题 |
| source_type | text not null | file/url/manual/api |
| uri | text null | 来源 |
| status | text not null | indexing/ready/failed/retired |
| chunk_count | integer not null | 分块数 |
| milvus_collection | text not null | collection |
| metadata | jsonb not null | 权限、标签、版本 |
| created_at | timestamptz not null | 创建 |
| updated_at | timestamptz not null | 更新 |

索引：

- `(tenant_id, industry_code, status)`
- `gin (metadata)`

#### 14.3.12 `agent_knowledge_chunks`

知识分块原文，用于检索结果回填和审计。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| id | uuid pk | chunkId |
| source_id | uuid not null | 来源 |
| tenant_id | text not null | 租户 |
| industry_code | text not null | 行业 |
| chunk_index | integer not null | 分块序号 |
| content | text not null | 原文 |
| content_hash | text not null | 哈希 |
| embedding_id | text not null | Milvus 主键 |
| metadata | jsonb not null | 页码、段落、权限 |

约束：

- `unique (source_id, chunk_index)`
- `unique (tenant_id, embedding_id)`

#### 14.3.13 `agent_industry_adapters`

行业适配器注册表。

| 字段 | 类型 | 说明 |
|-----|-----|-----|
| industry_code | text pk | 行业 |
| package_name | text not null | 包名 |
| version | text not null | 版本 |
| status | text not null | active/disabled |
| capability_manifest | jsonb not null | 工具、技能、工作流声明 |
| created_at | timestamptz not null | 创建 |
| updated_at | timestamptz not null | 更新 |

#### 14.3.14 Redis Key 设计

| Key | 类型 | TTL | 说明 |
|-----|-----|-----|-----|
| `session:{tenantId}:{sessionId}` | hash/json | 会话结束后 24h | SessionState 热状态 |
| `task:{tenantId}:{taskId}` | hash/json | 完成后 24h | TaskRun 热状态 |
| `sse:{tenantId}:{sessionId}` | set | 连接存活 | SSE 连接索引 |
| `audit_stream:{tenantId}` | stream | 按容量裁剪 | 审计写入缓冲 |
| `rule:{tenantId}:{industryCode}:active` | string/json | 无固定 TTL | 当前规则版本 |
| `idem:{tenantId}:{idempotencyKey}` | string/json | 24h | API 幂等结果 |
| `memory:short:{tenantId}:{sessionId}` | hash/json | 会话结束 | 短期记忆 |
| `task_resume_queue:{tenantId}` | stream | 消费后 24h | 跨节点 HITL 恢复消息队列（见 §14.2.5） |
| `audit_seq:{tenantId}:{traceId}` | string | trace 结束后 24h | trace 内 sequence 原子计数器 |

#### 14.3.15 Milvus Collection 设计

每个行业可独立 collection，也可按租户分区。默认：

- collection: `knowledge_{industryCode}`
- partition: `tenant_{tenantId}`
- primary key: `embedding_id`
- scalar fields: `tenant_id`, `industry_code`, `source_id`, `chunk_id`, `access_level`, `version`
- vector field: `embedding`

检索必须带 `tenant_id` 和 `industry_code` 过滤条件。

### 14.4 API 入参与出参设计

通用约定：

- 所有写接口支持 `Idempotency-Key` header。
- 所有响应包含 `requestId`、`traceId`、`serverTime`。
- 错误统一返回 `ApiErrorResponse`。
- 时间使用 ISO 8601。

```typescript
interface ApiResponse<T> {
  requestId: string
  traceId?: string
  serverTime: string
  data: T
}

interface ApiErrorResponse {
  requestId: string
  traceId?: string
  serverTime: string
  error: ApiError
}
```

#### 14.4.1 创建会话

`POST /api/v1/sessions`

Request:

```json
{
  "tenantId": "tenant_001",
  "userId": "user_001",
  "industryCode": "library",
  "permissionMode": "default",
  "modelOverride": null,
  "metadata": {
    "client": "web",
    "locale": "zh-CN"
  }
}
```

Response:

```json
{
  "requestId": "req_001",
  "traceId": "trace_001",
  "serverTime": "2026-04-27T10:00:00.000Z",
  "data": {
    "sessionId": "session_001",
    "status": "active",
    "industryCode": "library",
    "streamUrl": "/api/v1/sessions/session_001/stream",
    "createdAt": "2026-04-27T10:00:00.000Z"
  }
}
```

读写：

- 写 `agent_sessions`
- 写 `agent_audit_events(request_received/session_created)`
- 写 Redis `session:{tenantId}:{sessionId}`

#### 14.4.2 查询会话

`GET /api/v1/sessions/:sessionId`

Response:

```json
{
  "requestId": "req_002",
  "traceId": "trace_001",
  "serverTime": "2026-04-27T10:00:01.000Z",
  "data": {
    "sessionId": "session_001",
    "status": "active",
    "industryCode": "library",
    "currentTaskId": "task_001",
    "pendingConfirmId": null,
    "createdAt": "2026-04-27T10:00:00.000Z",
    "updatedAt": "2026-04-27T10:00:01.000Z"
  }
}
```

数据源：

- 优先 Redis SessionStore
- Redis 缺失时读 `agent_sessions` + 最新 `agent_tasks`

#### 14.4.3 关闭会话

`DELETE /api/v1/sessions/:sessionId`

Request:

```json
{
  "reason": "user_closed"
}
```

Response:

```json
{
  "requestId": "req_003",
  "traceId": "trace_001",
  "serverTime": "2026-04-27T10:10:00.000Z",
  "data": {
    "sessionId": "session_001",
    "status": "closed",
    "closedAt": "2026-04-27T10:10:00.000Z"
  }
}
```

读写：

- 更新 `agent_sessions`
- 取消未完成 `agent_tasks`
- 写 `agent_audit_events(session_closed)`
- 清理 Redis SSE 连接索引

#### 14.4.4 发送消息

`POST /api/v1/sessions/:sessionId/messages`

Request:

```json
{
  "input": "扫码借书，读者A，馆藏B",
  "mode": "auto",
  "attachments": [],
  "clientMessageId": "client_msg_001",
  "metadata": {
    "source": "circulation-desk"
  }
}
```

Response:

```json
{
  "requestId": "req_004",
  "traceId": "trace_002",
  "serverTime": "2026-04-27T10:11:00.000Z",
  "data": {
    "taskId": "task_001",
    "sessionId": "session_001",
    "status": "queued",
    "mode": "auto",
    "streamUrl": "/api/v1/sessions/session_001/stream"
  }
}
```

读写：

- 写 `agent_messages(role=user)`
- 写 `agent_tasks`
- 写 Redis `task:{tenantId}:{taskId}`
- 写 `agent_audit_events(request_received)`
- 推送 SSE `task_queued`

#### 14.4.5 查询任务状态

`GET /api/v1/tasks/:taskId`

Response:

```json
{
  "requestId": "req_005",
  "traceId": "trace_002",
  "serverTime": "2026-04-27T10:11:02.000Z",
  "data": {
    "taskId": "task_001",
    "sessionId": "session_001",
    "status": "waiting_confirm",
    "mode": "fast",
    "currentIntent": {
      "sceneCode": "CIRCULATION_CHECKOUT",
      "actionCode": "ACTION_INIT",
      "confidence": 0.97,
      "pathType": "fast"
    },
    "pendingConfirmId": "confirm_001",
    "updatedAt": "2026-04-27T10:11:02.000Z"
  }
}
```

数据源：

- 优先 Redis TaskState
- Redis 缺失时读 `agent_tasks`

#### 14.4.6 SSE 流式订阅

`GET /api/v1/sessions/:sessionId/stream`

事件格式：

```text
event: permission_required
id: trace_002:7
data: {"traceId":"trace_002","sequence":7,"taskId":"task_001","payload":{}}
```

标准事件：

| 事件 | 说明 |
|-----|-----|
| `session_ready` | SSE 连接建立 |
| `task_queued` | 任务已入队 |
| `intent_detected` | 语义识别完成 |
| `context_built` | ContextEnvelope 构建完成 |
| `plan_created` | 计划生成 |
| `message_delta` | 模型 token 增量 |
| `tool_started` | 工具开始 |
| `tool_completed` | 工具完成 |
| `permission_required` | 需要人工确认 |
| `permission_resolved` | 确认完成 |
| `warning` | 成本、规则、降级等警告 |
| `error` | 可展示错误 |
| `done` | 任务结束 |

SSE `id` 必须使用 `{traceId}:{sequence}`，前端重连时通过 `Last-Event-ID` 补发缺失事件。补发数据从 PostgreSQL `agent_audit_events` 读取，不从 Redis Stream 读取。

#### 14.4.7 人工确认回调

`POST /api/v1/sessions/:sessionId/confirm`

Request:

```json
{
  "confirmId": "confirm_001",
  "decision": "approve",
  "confirmedBy": "librarian_001",
  "confirmedRole": "librarian",
  "comment": "允许本次借出",
  "clientDecisionId": "client_decision_001"
}
```

Response:

```json
{
  "requestId": "req_006",
  "traceId": "trace_002",
  "serverTime": "2026-04-27T10:11:20.000Z",
  "data": {
    "confirmId": "confirm_001",
    "taskId": "task_001",
    "status": "approved",
    "nextTaskStatus": "running"
  }
}
```

读写：

- 更新 `agent_human_confirms`
- 更新 Redis TaskState
- 写 `agent_audit_events(human_confirm)`
- 推送 SSE `permission_resolved`
- 若 approve，恢复挂起的 ToolLoop

#### 14.4.8 审计 trace 列表

`GET /api/v1/audit/traces?tenantId=&userId=&industryCode=&from=&to=&status=&hasHumanConfirm=`

Response:

```json
{
  "requestId": "req_007",
  "serverTime": "2026-04-27T10:12:00.000Z",
  "data": {
    "items": [
      {
        "traceId": "trace_002",
        "sessionId": "session_001",
        "rootTaskId": "task_001",
        "userId": "user_001",
        "industryCode": "library",
        "status": "succeeded",
        "eventCount": 12,
        "hasHumanConfirm": true,
        "hasHighRisk": false,
        "firstEventAt": "2026-04-27T10:11:00.000Z",
        "lastEventAt": "2026-04-27T10:11:22.000Z",
        "summary": {
          "input": "扫码借书，读者A，馆藏B",
          "result": "借阅成功"
        }
      }
    ],
    "page": {
      "limit": 20,
      "cursor": null,
      "hasMore": false
    }
  }
}
```

数据源：

- 默认读 `agent_audit_trace_summaries`
- 摘要缺失时从 `agent_audit_events` 聚合补偿

#### 14.4.9 审计事件查询

`GET /api/v1/audit/traces/:traceId/events`

Response:

```json
{
  "requestId": "req_008",
  "traceId": "trace_002",
  "serverTime": "2026-04-27T10:12:01.000Z",
  "data": {
    "traceId": "trace_002",
    "events": [
      {
        "sequence": 1,
        "eventType": "request_received",
        "severity": "info",
        "payload": {
          "input": "扫码借书，读者A，馆藏B"
        },
        "createdAt": "2026-04-27T10:11:00.000Z"
      }
    ]
  }
}
```

数据源：

- 直接读 `agent_audit_events where trace_id = ? order by sequence`

#### 14.4.10 审计 replay

`GET /api/v1/audit/sessions/:sessionId/replay?traceId=`

Response:

```json
{
  "requestId": "req_009",
  "traceId": "trace_002",
  "serverTime": "2026-04-27T10:12:02.000Z",
  "data": {
    "sessionId": "session_001",
    "traceId": "trace_002",
    "steps": [
      {
        "sequence": 1,
        "kind": "request",
        "title": "收到用户请求",
        "snapshot": {}
      },
      {
        "sequence": 7,
        "kind": "human_confirm",
        "title": "馆员确认借出",
        "snapshot": {}
      }
    ]
  }
}
```

Replay 只做展示还原，禁止重新执行 BizTool、MCPTool 或外部副作用操作。

#### 14.4.11 规则版本查询与发布

`GET /api/v1/rules/:industryCode/versions`

`POST /api/v1/rules/:industryCode/versions`

Publish Request:

```json
{
  "version": "library-rules-2026-04-27",
  "rules": {},
  "publish": true,
  "publishedBy": "admin_001"
}
```

Publish Response:

```json
{
  "requestId": "req_010",
  "serverTime": "2026-04-27T10:13:00.000Z",
  "data": {
    "ruleVersionId": "rule_version_001",
    "industryCode": "library",
    "version": "library-rules-2026-04-27",
    "status": "active",
    "checksum": "sha256:..."
  }
}
```

发布写 `agent_rule_versions`，刷新 Redis `rule:{tenantId}:{industryCode}:active`。已创建的 session 沿用创建时绑定的 ruleVersion。

#### 14.4.12 Prompt 模板查询与发布

`GET /api/v1/prompts/:industryCode/templates`

`POST /api/v1/prompts/:industryCode/templates`

Request:

```json
{
  "templateKey": "scenes/checkout",
  "version": "2026-04-27",
  "content": "你是图书馆借阅场景助手...",
  "metadata": {
    "cacheable": true,
    "variables": ["reader", "bookCopy"]
  },
  "publish": true
}
```

Response:

```json
{
  "requestId": "req_011",
  "serverTime": "2026-04-27T10:14:00.000Z",
  "data": {
    "promptTemplateId": "prompt_001",
    "templateKey": "scenes/checkout",
    "version": "2026-04-27",
    "status": "active",
    "checksum": "sha256:..."
  }
}
```

#### 14.4.13 行业能力查询

`GET /api/v1/industries/:industryCode/capabilities`

Response:

```json
{
  "requestId": "req_012",
  "serverTime": "2026-04-27T10:15:00.000Z",
  "data": {
    "industryCode": "library",
    "adapterVersion": "0.1.0",
    "tools": [
      {
        "name": "checkout_book",
        "permissionLevel": "medium",
        "confirmLevel": "explicit_confirm"
      }
    ],
    "skills": [],
    "workflows": []
  }
}
```

数据源：

- `agent_industry_adapters.capability_manifest`
- Adapter 包运行时 manifest 校验结果

### 14.5 审计读写架构

#### 14.5.1 写入路径

```
Runtime / ToolLoop / PermissionGate
  → AuditWriter.record()
  → Redis Stream audit_stream:{tenantId}
  → AuditConsumer
  → PostgreSQL agent_audit_events
  → agent_audit_trace_summaries 异步更新
```

写入策略：

- 普通事件异步写入 Redis Stream，主流程不等待 PostgreSQL。
- 高风险副作用操作可配置为 `requireAuditDurability=true`，必须确认 `agent_audit_events` 落库成功后才返回业务成功。
- Redis Stream 写入失败时，当前 task 标记为 `failed`，不得继续执行高风险工具。
- AuditConsumer 必须幂等消费，依据 `(tenant_id, trace_id, sequence)` 去重。

**sequence 分配与顺序保证：**

- `sequence` 由 `AuditSequence` 模块在 **写入 Redis Stream 之前** 分配，使用 Redis 原子命令 `INCR audit_seq:{tenantId}:{traceId}`。
- 同一 traceId 的所有事件在进入 Stream 前已携带递增 sequence，Stream 消息本身保持 FIFO 顺序。
- 多个 AuditConsumer 并发消费同一 Stream 时，使用 `XREADGROUP` Consumer Group，每条消息只被一个消费者处理，PostgreSQL 写入用 `INSERT ... ON CONFLICT (tenant_id, trace_id, sequence) DO NOTHING` 保证幂等。
- 审计查询时按 `sequence ASC` 排序，不依赖 `created_at`（写入时间可能因消费者延迟差异而乱序）。
- `AuditSequence` 计数器 Redis Key 为 `audit_seq:{tenantId}:{traceId}`，TTL = trace 结束后 24h（见 §14.3.14）。

#### 14.5.2 查询路径

| 查询 | 数据来源 |
|-----|---------|
| trace 列表 | `agent_audit_trace_summaries`，缺失时聚合 `agent_audit_events` |
| trace 事件 | `agent_audit_events` |
| session replay | `agent_audit_events` 为主，join `agent_messages/tool_calls/human_confirms` 补展示字段 |
| 实时进度 | Redis SessionStore + SSE |
| 业务当前状态 | 行业业务系统 |
| 业务历史状态 | 审计 payload 中的 BizRef/FactSet 快照 |

#### 14.5.3 AuditEvent 类型

```typescript
type AuditEventType =
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
  | 'response_sent';

interface AuditEvent {
  id: UUID
  traceId: UUID
  sequence: number
  sessionId: UUID
  taskId?: UUID
  toolCallId?: UUID
  confirmId?: UUID
  tenantId: string
  userId: string
  industryCode: string
  eventType: AuditEventType
  severity: 'info' | 'warn' | 'error' | 'security'
  payload: Record<string, unknown>
  createdAt: string
}
```

脱敏要求：

- API key、token、密码、手机号、证件号等敏感字段不得进入 `payload` 明文。
- 可审计需要保留时写入 hash、尾号、或加密引用。
- `raw_ref` 只保存外部对象引用，不保存未脱敏原文。

### 14.6 状态机

#### 14.6.1 SessionStatus

| 状态 | 可进入状态 | 说明 |
|-----|-----------|-----|
| `created` | `active`, `failed` | 已创建，资源初始化中 |
| `active` | `waiting_human`, `closing`, `failed`, `expired` | 可接收任务 |
| `waiting_human` | `active`, `closing`, `expired`, `failed` | 存在挂起确认 |
| `closing` | `closed`, `failed` | 正在 flush 审计和释放资源 |
| `closed` | 无 | 正常关闭 |
| `failed` | 无 | 异常终止 |
| `expired` | 无 | 超时清理 |

非法转换必须返回 `SESSION_STATE_CONFLICT`。

#### 14.6.2 TaskStatus

| 状态 | 可进入状态 |
|-----|-----------|
| `queued` | `running`, `cancelled` |
| `running` | `waiting_confirm`, `succeeded`, `failed`, `cancelled` |
| `waiting_confirm` | `running`, `rejected`, `timeout`, `cancelled` |
| `succeeded` | 无 |
| `failed` | 无 |
| `rejected` | 无 |
| `timeout` | 无 |
| `cancelled` | 无 |

#### 14.6.3 ToolCallStatus

| 状态 | 可进入状态 |
|-----|-----------|
| `planned` | `permission_checking`, `executing`, `blocked`, `cancelled` |
| `permission_checking` | `waiting_confirm`, `executing`, `blocked` |
| `waiting_confirm` | `executing`, `blocked`, `timeout` |
| `executing` | `succeeded`, `failed`, `retrying` |
| `retrying` | `executing`, `failed` |
| `succeeded` | 无 |
| `failed` | 无 |
| `blocked` | 无 |
| `timeout` | 无 |
| `cancelled` | 无 |

#### 14.6.4 ConfirmStatus

| 状态 | 可进入状态 |
|-----|-----------|
| `pending` | `approved`, `rejected`, `timeout`, `escalated`, `cancelled` |
| `escalated` | `approved`, `rejected`, `timeout`, `cancelled` |
| `approved` | 无 |
| `rejected` | 无 |
| `timeout` | 无 |
| `cancelled` | 无 |

### 14.7 规则与权限契约

权限模型同时兼容原三级风险和任务规划中的四级确认升级。

| permissionLevel | 默认 confirmLevel | 行为 |
|----------------|----------------------|-----|
| `low` | `auto` | 自动执行，仅审计 |
| `medium` + Rule PASS | `auto` | 自动执行 |
| `medium` + Rule WARN | `explicit_confirm` | 前端确认 |
| `high` | `supervisor_approval` | 强制审批 |
| 任意 + Rule BLOCKED | 无 | 禁止执行 |

```typescript
interface RuleCheckInput {
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

interface RuleCheckResult {
  result: 'PASS' | 'WARN' | 'BLOCKED'
  ruleVersion: string
  matchedRules: Array<{
    ruleId: string
    severity: 'info' | 'warn' | 'block'
    reason: string
  }>
  warnings: string[]
  requiredConfirmLevel: ConfirmLevel
  requiredApproverRole?: 'user' | 'librarian' | 'supervisor' | 'admin'
}
```

**规则 DSL 格式（`agent_rule_versions.rules` jsonb 结构）：**

```json
{
  "version": "library-rules-2026-04-27",
  "industry": "library",
  "rules": [
    {
      "id": "LIB-001",
      "name": "读者逾期借书警告",
      "operation": "checkout_book",
      "condition": {
        "type": "expr",
        "expr": "facts.overdueCount > 0"
      },
      "severity": "warn",
      "reason": "读者有 {{facts.overdueCount}} 本逾期未还，借出前需馆员确认",
      "confirmLevel": "explicit_confirm",
      "requiredApproverRole": "librarian"
    },
    {
      "id": "LIB-002",
      "name": "读者借阅上限阻断",
      "operation": "checkout_book",
      "condition": {
        "type": "expr",
        "expr": "facts.currentBorrowCount >= facts.borrowQuota"
      },
      "severity": "block",
      "reason": "读者已达借阅上限（{{facts.borrowQuota}} 册），无法继续借出"
    },
    {
      "id": "LIB-003",
      "name": "高价值馆藏特殊授权",
      "operation": "checkout_book",
      "condition": {
        "type": "expr",
        "expr": "refs.bookCopy.attrs.restricted === true"
      },
      "severity": "block",
      "reason": "该馆藏已标记为限制访问，需特殊授权",
      "confirmLevel": "supervisor_approval",
      "requiredApproverRole": "supervisor"
    }
  ]
}
```

DSL 规范：
- `condition.expr` 是基于 `facts`（FactSet.facts）和 `refs`（BizRef map）的 JavaScript 表达式子集，由 `RuleEvaluator` 安全沙盒执行（禁止调用函数、网络、I/O）。
- `severity`：`"warn"` 触发 `WARN` 并按 `confirmLevel` 升级确认；`"block"` 触发 `BLOCKED`，操作直接阻断。
- `reason` 支持 `{{expr}}` 模板插值，渲染时注入 facts 值。
- 规则按数组顺序执行，全部 `warn` 和 `block` 规则均会运行，结果取最高 severity 合并。

规则版本绑定：

- Session 创建时绑定当前 active ruleVersion。
- 同一 session 内 ruleVersion 不随 Redis 热更新变化。
- 新 session 使用最新 active ruleVersion。
- 规则发布写 PostgreSQL，成功后刷新 Redis。

### 14.8 快路径与慢路径决策表

| 条件 | 决策 | 审计事件 | 用户可见结果 |
|-----|-----|---------|-------------|
| `confidence >= 0.95` 且 `pathType=fast` 且参数齐备 | 进入快路径 | `intent_detected`, `context_built` | 快速处理 |
| `confidence < 0.95` | 进入 QueryEngine 慢路径 | `intent_detected` | Agent 澄清或规划 |
| 必要参数缺失 | 慢路径追问，不执行工具 | `context_built`, `response_sent` | 请求补充信息 |
| Rule PASS + low/medium | 执行 BizTool | `rule_check`, `tool_call_started` | 返回执行结果 |
| Rule WARN + medium | 挂起确认 | `rule_check`, `permission_required` | 前端确认卡 |
| Rule BLOCKED | 阻断 | `rule_check`, `permission_check` | 返回阻断原因 |
| high 权限工具 | 强制审批 | `permission_required` | 上级审批 |
| 人工 approve | 恢复执行 | `human_confirm`, `tool_call_started` | 继续处理 |
| 人工 reject | 终止 task | `human_confirm`, `response_sent` | 返回已拒绝 |
| 确认超时 | 取消 task | `permission_timeout` | 返回超时 |
| BizTool 可重试失败 | ErrorHandler retry | `error`, `tool_call_started` | 可能延迟 |
| BizTool 不可重试失败 | task failed | `error`, `response_sent` | 返回失败原因 |
| Audit 写入失败且高风险 | 阻断 | `error` | 返回审计不可用 |

### 14.9 Claude Code 复用边界

| 类别 | 模块 | 策略 |
|-----|-----|-----|
| 直接复用 | `Tool` interface、builtin tools、provider adapters、MCP client/server 基础能力 | 保持接口，补 ctx 适配层 |
| 改造复用 | `QueryEngine`、`query()`、ToolLoop、Permission 相关类型、Cost 统计 | 去 Ink/CLI 依赖，显式传 `SessionContext` |
| 参考复用 | REPL 消息流、Todo/Plan 展示、Checkpoint 思路 | 转为 SSE 和持久化状态 |
| 不进入 Runtime | Ink UI、终端 permission UI、CLI bootstrap 快路径、模块级 `bootstrap/state.ts` 单例 | 服务端入口不得依赖 |
| 必须替换 | 全局 sessionId、cwd、permissionMode、tokenCounts getter/setter | 迁入 `SessionContext` |

新增服务入口 `src/entrypoints/server.ts` 必须绕开 Ink/CLI 层，不能从 `src/main.tsx` 反向启动。

### 14.10 测试与验收矩阵

| 范围 | 验收标准 |
|-----|---------|
| API 契约 | 所有核心接口有 request/response schema 测试，错误码稳定 |
| SSE | 支持断线重连，`Last-Event-ID` 可从 `agent_audit_events` 补发 |
| 并发 Session | 同进程多 session 并发运行，ContextEnvelope 不串数据 |
| 快路径 | 图书馆借书/还书/续借在参数齐备时绕过 LLM |
| 慢路径 | 参数缺失、低置信度、复杂争议进入 QueryEngine |
| 权限确认 | WARN 挂起、approve 继续、reject 终止、timeout 取消 |
| 高风险审批 | high 工具无论规则结果均需审批 |
| 跨节点 HITL | 确认回调在不同节点触发后，任意节点可从 Redis 恢复并继续 Task |
| 审计链路 | 每个 task 有完整 trace，sequence 连续，replay 不触发副作用 |
| 审计顺序 | 同一 traceId 事件按 sequence ASC 查询，顺序与运行时一致 |
| 规则版本 | session 内规则版本固定，新 session 使用最新版本 |
| 知识库 | Milvus 检索结果可回 PostgreSQL 原文，租户隔离生效 |
| 行业切换 | 引入第二行业 Adapter 时 Runtime 主干不修改 |
| 异常恢复 | Redis 热状态丢失时可从 PostgreSQL 恢复可查询状态 |
| 成本监控 | token 超预算产生 SSE warning 并写审计 |
| envelope 压缩 | priorToolResults 超过 20 条时压缩生效，审计完整性不受影响 |

**性能 SLA（测试环境基准，需在集成测试中覆盖）：**

| 指标 | 目标值 | 测试方法 |
|-----|-------|---------|
| 快路径内部处理（SemanticMapper + RuleEngine，不含外部 I/O） | P99 ≤ 50ms | 单元/集成基准测试，mock 外部调用 |
| 快路径端到端（含 BizRefBuilder 外部调用，行业系统 mock 100ms）| P99 ≤ 500ms | 集成测试，行业系统 stub 固定 100ms 延迟 |
| SSE 第一个事件（task_queued）延迟 | P99 ≤ 100ms | 消息发送到 SSE 事件收到的时间差 |
| AuditConsumer 消费延迟（Redis Stream → PostgreSQL）| P99 ≤ 5s | 写入 Redis 到 agent_audit_events 落库时间差 |
| 慢路径（含 LLM，模型 mock 1s 固定延迟）| P50 ≤ 3s | 集成测试，LLM mock 固定 1s 延迟 |
| 并发 100 session，快路径吞吐 | ≥ 50 req/s | 负载测试 |

图书馆核心场景至少覆盖：

- 扫码借书：正常读者 + 可借馆藏 → 快路径成功。
- 扫码借书：读者有逾期 → WARN + 人工确认后成功。
- 柜台归还：正常归还 → low 权限自动执行。
- 自助续期：续借次数未耗尽 → 自动执行。
- 预约取书：预约存在且馆藏到馆 → 自动执行或按规则确认。
- 状态争议：进入慢路径，生成核查计划。
- 费用争议：涉及减免时 high 权限审批。
- 特殊授权：强制 supervisor/admin 审批。
- 异常工单：可创建 task/workflow，支持断点续跑。

### 14.11 任务规划映射

结合 `docs/indus-agent/行业Agent任务规划.xlsx`，完整平台开发阶段按依赖关系组织如下。

#### 阶段 A：基础设施与契约

- 研发策略确认：明确 Claude Code、Hermes、OpenClaw 的复用/改造/自研边界。
- 代码结构和脚手架设计。
- PostgreSQL、Redis、Milvus 基础组件准备。
- 数据库表结构和数据模型设计。
- OpenAPI/SSE 契约设计。
- `SessionContext` / `ContextEnvelope` 核心类型定义。

#### 阶段 B：Runtime 主干

- `src/entrypoints/server.ts` 服务入口。
- Session 注册、生命周期管理、多 Session 并发调度。
- QueryEngine 服务化改造。
- PlanningEngine、ToolLoop、StreamingDispatcher。
- PermissionGate、Human-in-the-Loop。
- ErrorHandler、Logger、CostMonitor。
- Checkpoint/Resume。

#### 阶段 C：上下文与配置资产

- `build_system_prompt()`。
- `build_user_message()`。
- `build_tools()`。
- Prompt 库。
- MemoryManager。
- RuleEngine 与规则版本发布。

#### 阶段 D：行业 Adapter 与图书馆能力

- IndustryRegistry。
- Library SemanticMapper。
- Library BizRefBuilder。
- Library CapabilityGateway。
- 图书馆领域服务 MCP/BizTool 对接。
- 图书馆业务 Tools、Skills、Workflows、Templates。

#### 阶段 E：复杂业务与扩展能力

- 借阅全流程 Agent。
- 争议处理 Agent。
- 采编快工作流。
- 通用快工作流框架。
- SubAgentSpawner。
- OutputValidator。

#### 阶段 F：治理、测试与上线

- 审计链路和治理验证。
- 端到端链路联调。
- 图书馆场景回归测试。
- 行业切换验证。
- 性能与 Cost 监控。
- Docker 部署方案和运维手册。

### 14.12 项目目录结构设计

本项目不是完全复用现有 Claude Code，也不是从零重写。目录结构采用“上游 Claude Code 主干保留 + Runtime 服务端新增 + 关键模块二次开发”的混合策略。

设计目标：

- 保留 Claude Code 已恢复的 provider、tool、MCP、workflow、skill、subagent 等可复用资产。
- 避免行业 Runtime 直接依赖 CLI、Ink、REPL 和模块级单例状态。
- 新增行业 Runtime 代码拥有清晰边界，后续可独立演进为后端服务。
- 对需要二次开发的 Claude Code 模块建立 adapter/facade，避免在原文件中散乱打补丁。

#### 14.12.1 目录标记图例

目录树中使用统一标记：

| 标记 | 含义 | 开发策略 |
|-----|-----|---------|
| `[直接复用]` | 现有 Claude Code 能力可直接作为依赖使用 | 不改或少量配置 |
| `[二次开发]` | 基于现有 Claude Code 模块改造 | 增加参数化、依赖注入、服务端 adapter |
| `[新增]` | 行业 Runtime 新增能力 | 从本设计实现 |
| `[保留不用]` | 保留现有 CLI/Ink/周边能力，但 Runtime 不依赖 | 不删除，服务端禁止 import |
| `[参考]` | 可参考设计思想，不直接作为 Runtime 依赖 | 仅借鉴模式 |

#### 14.12.2 建议项目目录树

```text
.
├── src/
│   ├── entrypoints/
│   │   ├── cli.tsx                                      # [保留不用] Claude Code CLI 原入口
│   │   ├── init.ts                                      # [保留不用] CLI 初始化路径
│   │   └── server.ts                                    # [新增] IndustryGateway HTTP/SSE 服务入口
│   │
│   ├── server/                                          # [新增] 对外 API 服务层
│   │   ├── http/
│   │   │   ├── createServer.ts                          # [新增] Fastify/Express 初始化
│   │   │   ├── routes/
│   │   │   │   ├── sessions.ts                          # [新增] /api/v1/sessions
│   │   │   │   ├── messages.ts                          # [新增] /api/v1/sessions/:id/messages
│   │   │   │   ├── confirms.ts                          # [新增] /api/v1/sessions/:id/confirm
│   │   │   │   ├── audit.ts                             # [新增] /api/v1/audit/*
│   │   │   │   ├── rules.ts                             # [新增] /api/v1/rules/*
│   │   │   │   ├── prompts.ts                           # [新增] /api/v1/prompts/*
│   │   │   │   └── industries.ts                        # [新增] /api/v1/industries/*
│   │   │   └── middleware/
│   │   │       ├── auth.ts                              # [新增] 鉴权
│   │   │       ├── tenant.ts                            # [新增] 租户解析
│   │   │       ├── idempotency.ts                       # [新增] 幂等键
│   │   │       └── errors.ts                            # [新增] ApiErrorResponse
│   │   ├── sse/
│   │   │   ├── SseConnectionRegistry.ts                 # [新增] SSE 连接索引
│   │   │   ├── SseEventWriter.ts                        # [新增] 标准事件写入
│   │   │   └── replayFromAudit.ts                       # [新增] Last-Event-ID 补发
│   │   └── schemas/
│   │       ├── api.ts                                   # [新增] API request/response schema
│   │       └── errors.ts                                # [新增] 标准错误码 schema
│   │
│   ├── runtime/                                         # [新增] 行业 Agent Runtime 主干
│   │   ├── context/
│   │   │   ├── SessionContext.ts                        # [新增] 运行时上下文对象
│   │   │   ├── ContextEnvelope.ts                       # [新增] 可序列化上下文快照
│   │   │   └── ContextEnvelopeBuilder.ts                # [新增] envelope 构建器
│   │   ├── engine/
│   │   │   ├── AgentRuntime.ts                          # [新增] Runtime 编排入口
│   │   │   ├── QueryRuntime.ts                          # [新增] QueryEngine 服务化 facade
│   │   │   ├── PlanningEngine.ts                        # [新增] 计划生成与持久化
│   │   │   ├── ToolLoop.ts                              # [二次开发] 基于 Claude Code ToolLoop 改造
│   │   │   ├── StreamingDispatcher.ts                   # [新增] SSE 事件分发
│   │   │   ├── MemoryManager.ts                         # [新增] 记忆调度
│   │   │   ├── CostMonitor.ts                           # [二次开发] 复用 Claude Code token/cost 统计思想
│   │   │   └── ErrorHandler.ts                          # [新增] retry/fallback/terminate
│   │   ├── permission/
│   │   │   ├── PermissionGate.ts                        # [二次开发] 基于 Claude Code 权限模型服务化
│   │   │   └── HumanConfirmManager.ts                   # [新增] 挂起、恢复、超时、升级
│   │   ├── state/
│   │   │   ├── SessionStateStore.ts                     # [新增] Redis-backed session state
│   │   │   ├── TaskStateStore.ts                        # [新增] Redis-backed task state
│   │   │   └── CheckpointStore.ts                       # [新增] 断点续跑
│   │   └── types.ts                                     # [新增] Runtime 内部公共类型
│   │
│   ├── adapters/
│   │   └── claude-code/                                 # [新增] Claude Code 二次封装层
│   │       ├── ClaudeQueryAdapter.ts                    # [二次开发] 包装 query()/QueryEngine
│   │       ├── ClaudeToolAdapter.ts                     # [二次开发] Tool 与 Runtime Tool/BizTool 适配
│   │       ├── ClaudePermissionAdapter.ts               # [二次开发] 权限类型接入 PermissionGate
│   │       ├── ClaudeProviderAdapter.ts                 # [直接复用] provider selection 封装
│   │       ├── ClaudeMcpAdapter.ts                      # [直接复用] MCP client/server 封装
│   │       └── ClaudeCostAdapter.ts                     # [二次开发] token/cost 统计封装
│   │
│   ├── persistence/                                     # [新增] PostgreSQL/Redis/Milvus 访问层
│   │   ├── db/
│   │   │   ├── client.ts                                # [新增] PostgreSQL 连接
│   │   │   ├── migrations/                              # [新增] SQL migration
│   │   │   └── repositories/
│   │   │       ├── SessionRepository.ts                 # [新增]
│   │   │       ├── TaskRepository.ts                    # [新增]
│   │   │       ├── MessageRepository.ts                 # [新增]
│   │   │       ├── ToolCallRepository.ts                # [新增]
│   │   │       ├── HumanConfirmRepository.ts            # [新增]
│   │   │       ├── AuditRepository.ts                   # [新增]
│   │   │       ├── MemoryRepository.ts                  # [新增]
│   │   │       ├── RuleRepository.ts                    # [新增]
│   │   │       ├── PromptRepository.ts                  # [新增]
│   │   │       ├── KnowledgeRepository.ts               # [新增]
│   │   │       └── IndustryAdapterRepository.ts         # [新增]
│   │   ├── redis/
│   │   │   ├── client.ts                                # [新增] Redis 连接
│   │   │   ├── SessionStore.ts                          # [新增]
│   │   │   ├── TaskStore.ts                             # [新增]
│   │   │   ├── AuditStream.ts                           # [新增]
│   │   │   ├── IdempotencyStore.ts                      # [新增]
│   │   │   ├── RuleCache.ts                             # [新增]
│   │   │   └── ShortMemoryStore.ts                      # [新增]
│   │   └── vector/
│   │       ├── MilvusClient.ts                          # [新增]
│   │       └── KnowledgeVectorStore.ts                  # [新增]
│   │
│   ├── audit/                                           # [新增] 审计横切模块
│   │   ├── AuditWriter.ts                               # [新增] 写 Redis Stream
│   │   ├── AuditConsumer.ts                             # [新增] 消费 Stream 落 PostgreSQL
│   │   ├── AuditSequence.ts                             # [新增] trace 内 sequence 分配
│   │   ├── AuditRedactor.ts                             # [新增] 脱敏
│   │   ├── AuditReplayBuilder.ts                        # [新增] replay 视图构建
│   │   ├── AuditTraceSummaryProjector.ts                # [新增] trace summary 物化
│   │   └── types.ts                                     # [新增]
│   │
│   ├── rules/                                           # [新增] 通用规则引擎
│   │   ├── RuleEngine.ts                                # [新增]
│   │   ├── RuleEvaluator.ts                             # [新增]
│   │   ├── RuleVersionResolver.ts                       # [新增]
│   │   └── types.ts                                     # [新增]
│   │
│   ├── prompts/                                         # [新增] Prompt 构建与版本加载
│   │   ├── PromptTemplateStore.ts                       # [新增]
│   │   ├── buildSystemPrompt.ts                         # [新增]
│   │   ├── buildUserMessage.ts                          # [新增]
│   │   ├── buildTools.ts                                # [二次开发] 复用 Claude Code tools schema
│   │   └── types.ts                                     # [新增]
│   │
│   ├── knowledge/                                       # [新增] 知识库检索抽象
│   │   ├── KnowledgeQueryTool.ts                        # [新增] Runtime tool
│   │   ├── KnowledgeIndexer.ts                          # [新增]
│   │   ├── KnowledgeRetriever.ts                        # [新增]
│   │   └── types.ts                                     # [新增]
│   │
│   ├── query.ts                                         # [二次开发] 保留模型流能力，移除单例依赖
│   ├── QueryEngine.ts                                   # [二次开发] 服务化改造，接收 SessionContext
│   ├── Tool.ts                                          # [直接复用] Tool 类型基础
│   ├── tools.ts                                         # [二次开发] 通过 adapter 注入 Runtime tools
│   ├── services/api/                                    # [直接复用] Anthropic/OpenAI/Gemini/Grok provider
│   ├── services/mcp/                                    # [直接复用] MCP 相关服务
│   ├── utils/model/                                     # [直接复用] provider/model 选择
│   ├── bootstrap/state.ts                               # [保留不用] CLI 兼容，Runtime 禁止依赖
│   ├── main.tsx                                         # [保留不用] CLI commander
│   ├── screens/                                         # [保留不用] Ink REPL UI
│   ├── components/                                      # [保留不用] Ink 组件
│   ├── ink.ts                                           # [保留不用] Ink render wrapper
│   ├── bridge/                                          # [参考] Remote Control/Bridge，可参考通信模式
│   ├── daemon/                                          # [参考] 长驻进程模式，可参考 worker 管理
│   └── services/acp/                                    # [参考] ACP agent，可参考协议接入
│
├── packages/
│   ├── builtin-tools/                                   # [直接复用] 内置工具集，必要时加 Runtime adapter
│   │   └── src/tools/                                   # [直接复用] File/Bash/Web/MCP/Agent 等工具
│   ├── industry-adapter/                                # [新增] 行业 Adapter workspace 包
│   │   ├── src/
│   │   │   ├── types.ts                                 # [新增] IndustryAdapter/SemanticMapper/BizRefBuilder
│   │   │   ├── registry.ts                              # [新增] IndustryRegistry
│   │   │   ├── pipeline.ts                              # [新增] Adapter pipeline
│   │   │   └── base/
│   │   │       ├── BaseSemanticMapper.ts                # [新增]
│   │   │       ├── BaseBizRefBuilder.ts                 # [新增]
│   │   │       └── BaseCapabilityGateway.ts             # [新增]
│   │   └── industries/
│   │       ├── library/
│   │       │   ├── index.ts                             # [新增]
│   │       │   ├── SemanticMapper.ts                    # [新增]
│   │       │   ├── BizRefBuilder.ts                     # [新增]
│   │       │   ├── CapabilityGateway.ts                 # [新增]
│   │       │   ├── tools/                               # [新增] 图书馆 BizTools
│   │       │   ├── skills/                              # [新增] 图书馆 BizSkills
│   │       │   ├── workflows/                           # [新增] 图书馆 BizWorkflows
│   │       │   ├── rules/                               # [新增] 图书馆规则源文件
│   │       │   └── prompts/                             # [新增] 图书馆 Prompt 模板
│   │       ├── tobacco/                                 # [新增] 第二行业验证实现
│   │       └── water/                                   # [新增] 第三行业验证实现
│   ├── mcp-client/                                      # [直接复用] MCP 客户端库
│   ├── mcp-server/                                      # [直接复用] MCP 服务端库
│   ├── @ant/ink/                                        # [保留不用] CLI UI 框架
│   ├── @ant/computer-use-mcp/                           # [直接复用] 如行业场景需要桌面控制
│   ├── acp-link/                                        # [参考] ACP WebSocket 桥接
│   ├── remote-control-server/                           # [参考] 可参考 Web UI/服务部署，不作为主入口
│   └── */                                               # [按需评估] 其他包逐个判断复用边界
│
├── docs/
│   ├── superpowers/specs/                               # [新增/维护] Runtime 主规格与实施计划
│   └── indus-agent/                                     # [参考] 行业架构 PDF 和任务规划原始资料
│
├── tests/
│   ├── runtime/                                         # [新增] Runtime 单元/集成测试
│   ├── server/                                          # [新增] API/SSE 契约测试
│   ├── audit/                                           # [新增] 审计链路测试
│   ├── industry-adapter/                                # [新增] 行业 Adapter 测试
│   └── integration/                                     # [二次开发] 扩展现有集成测试
│
└── scripts/
    ├── defines.ts                                      # [二次开发] 如需新增 SERVER/RUNTIME feature flags
    └── dev.ts                                          # [保留不用] CLI dev；server dev 另建脚本
```

#### 14.12.3 Claude Code 封装原则

- Runtime 只依赖 adapter 输出的稳定接口，不直接依赖 Claude Code 内部易变实现。
- 原 Claude Code 模块如果需要修改，优先做参数化和依赖注入，不把行业概念写进通用模块。
- 所有对 `bootstrap/state.ts` 的旧调用必须被 adapter 层截断，改为从 `SessionContext` 读取。
- `src/entrypoints/server.ts` 只负责加载配置、初始化依赖、启动 `src/server/http/createServer.ts`，不得包含业务逻辑。
- `src/runtime` 不允许 import `src/screens/*`、`src/components/*`、`src/main.tsx`。需要复用 Claude Code 能力时，只能通过 `src/adapters/claude-code/*`。
- Repository 层只暴露结构化方法，不把 SQL 拼接散落到 Runtime 逻辑中。
- Redis Store 只承载热状态和队列，不作为长期审计查询源。
- 审计模块是横切能力，但不反向依赖具体行业 Adapter。行业信息通过 `AuditEvent.payload` 和 `ContextEnvelope` 进入审计链。
- 行业包可以依赖 Runtime 暴露的稳定类型，但 Runtime 主干不得 import 某个具体行业实现。加载必须通过 `IndustryRegistry.load(industryCode)`。

#### 14.12.4 保留、复用、二次开发、自研边界

| 区域 | 策略 | 说明 |
|-----|-----|-----|
| `src/entrypoints/cli.tsx`, `src/main.tsx` | 保留 | CLI 继续可用，不作为 Runtime 服务入口 |
| `src/screens`, `src/components`, `packages/@ant/ink` | 保留但隔离 | 仅 CLI/Ink 使用 |
| `src/query.ts`, `src/QueryEngine.ts` | 二次开发 | 抽出服务端可用 Query/ToolLoop 能力 |
| `src/bootstrap/state.ts` | 保留兼容，Runtime 禁止依赖 | CLI 旧路径可继续使用 |
| `packages/builtin-tools` | 复用 + adapter | 通用工具通过 ctx adapter 接入 |
| `packages/mcp-client`, `packages/mcp-server` | 复用 | 行业服务可通过 MCP 暴露 |
| `src/runtime`, `src/server`, `src/persistence`, `src/audit` | 自研 | 行业 Runtime 后端主干 |
| `packages/industry-adapter` | 自研 | 行业差异隔离层 |

#### 14.12.5 依赖方向规则

允许依赖：

```text
entrypoints/server → server → runtime → adapters/claude-code → existing Claude Code modules
runtime → industry/types
runtime → persistence/audit/rules/prompts/knowledge
industry-adapter/* → industry-adapter/src/types
industry-adapter/* → runtime exposed types
```

禁止依赖：

```text
runtime → screens/components/main.tsx
runtime → concrete industry implementations
existing generic Claude Code modules → industry-adapter/industries/*
persistence repositories → runtime engine
audit → concrete industry implementations
```

#### 14.12.6 目录结构验收标准

- `src/entrypoints/server.ts` 可独立启动，不加载 Ink/REPL 组件。
- Runtime 核心代码 import 图中不得出现 `src/screens`、`src/components`、`src/main.tsx`。
- 行业切换新增 Adapter 包时，不修改 `src/runtime` 主干。
- PostgreSQL/Redis/Milvus 访问只能通过 `src/persistence`。
- 审计查询只能通过 `src/audit` 和 `AuditRepository`。
- Claude Code 内部模块复用必须经过 `src/adapters/claude-code`。

### 14.13 开发准入规则

- 新增 Runtime 代码不得读取 `src/bootstrap/state.ts` 的模块级运行态。
- 任意外部副作用工具调用前必须经过 RuleEngine 和 PermissionGate。
- 任意正式业务 task 必须生成 `traceId`，且至少包含 `request_received` 和 `response_sent` 审计事件。
- 任意 API 写操作必须支持幂等键或显式说明不可幂等。
- 任意跨租户查询必须带 `tenant_id` 条件。
- 任意 replay 能力不得重新执行工具。
- 任意 Milvus 查询必须带租户和行业过滤条件。
