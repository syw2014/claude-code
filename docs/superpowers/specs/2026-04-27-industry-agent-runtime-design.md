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
- **快路径直通**：高频确定性操作（借还书等）绕过 LLM，直接路由到 BizTool，响应 < 200ms
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

```typescript
interface SessionContext {
  // 原 bootstrap/state.ts 单例迁入
  sessionId: UUID
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
  traceId: UUID
  auditWriter: AuditWriter

  // 外置存储访问
  sessionStore: SessionStore      // Redis（会话级状态）
  memoryStore: MemoryStore        // 长期记忆（跨会话）

  // Human-in-the-Loop 状态
  pendingConfirm?: ConfirmRequest
  sseWriter: SSEWriter            // 流式推送给前端

  // 请求级数据（每次 message 处理时由 Industry Adapter Pipeline 填充）
  currentIntent?: NormalizedIntent   // SemanticMapper 输出
  bizRefs?: Map<string, BizRef>      // BizRefBuilder 输出
  factSet?: FactSet                  // BizRefBuilder 输出
}
```

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
      ├── tobacco/                    — 烟草（Phase 5，占位）
      └── water/                      — 水务（Phase 5，占位）
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
      ctx.bizRefs.has(p))
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

**无 LLM 参与，响应时间 < 200ms**（对比慢路径 2-5s）。

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

### Phase 1 — Runtime 基础骨架

- SessionContext 重构（替换 `src/bootstrap/state.ts` 所有单例）
- `src/entrypoints/server.ts` + HTTP/WebSocket/SSE 服务
- 基础 AuditTrail（事件写入 Redis Stream）
- IndustryRegistry + IndustryAdapter 接口定义
- **验收标准**：Runtime 可启动，接受请求，返回基础响应

### Phase 2 — 图书馆行业能力

- LibraryAdapter 三层实现（SemanticMapper + BizRefBuilder + CapabilityGateway）
- 图书馆 BizTools（9 个，借还续查费用争议授权）
- 快路径路由逻辑
- RuleEngine + 图书馆规则集
- PermissionGate 三级权限 + Human-in-the-Loop
- **验收标准**：图书馆核心借还业务端到端可用

### Phase 3 — 数据存储层

- Memory 库（Redis 短期 + DB 长期）
- 知识库（向量检索 + KnowledgeQueryTool）
- Prompt 库（模板加载 + 图书馆术语表）
- AuditStore 持久化（PostgreSQL + 查询 API）
- **验收标准**：记忆、知识检索、完整审计链路可用

### Phase 4 — 高级 Runtime 能力

- BizSkills + BizWorkflows（采编流程、馆藏盘点等长流程）
- SubAgent 通道（争议分析、多轮核查）
- Checkpoint/Resume（断点续跑）
- CostMonitor（Token 预算控制）
- **验收标准**：复杂业务场景覆盖，长流程可中断恢复

### Phase 5 — 多行业扩展

- TobaccoAdapter（烟草行业）
- WaterAdapter（水务行业）
- IndustryRegistry 动态加载验证
- **验收标准**：多行业切换验证架构可扩展性

---

## 13. 关键技术决策记录

| 决策 | 选择 | 理由 |
|-----|-----|-----|
| 并发模型 | SessionContext 替换单例（方案 C） | 同进程高并发，无 Worker 线程开销 |
| 行业切换 | IndustryRegistry 插拔式加载 | Runtime 不感知行业差异，切换只换 Adapter |
| 快路径 | 绕过 LLM 直通 BizTool | 高频操作 < 200ms，LLM 仅用于复杂场景 |
| 审计 | 横切关注点 + Redis Stream 异步写入 | 不阻塞主流程，Redis 缓冲防止写入压力 |
| 规则热加载 | Redis + YAML 版本管理 | 规则变更无需重启，支持灰度发布 |
| Session 外置 | Redis SessionStore | 支持水平扩展，多节点会话可恢复 |
