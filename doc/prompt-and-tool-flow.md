# Claude Code 源码分析：Prompt 组装与工具选择/调用

本文基于当前仓库源码，按一次真实 turn 的执行顺序，拆解两个核心问题：

1. 工具是如何选择和调用的
2. prompt 有哪些构成，是如何组装和使用的

为了避免把实现讲成零散知识点，本文始终围绕一条主链路展开：

1. 准备 prompt 和上下文
2. 准备可见工具
3. 发起模型请求
4. 接收模型流式输出
5. 如果出现 `tool_use`，执行工具
6. 将 `tool_result` 回填给模型
7. 继续下一轮，直到不再需要工具

主循环入口在 [src/query.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/query.ts)。

## 1. 先看整体：一次请求到底发了什么

从 [src/query.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/query.ts) 看，真正调用模型时，核心入参是三部分：

- `systemPrompt`
- `messages`
- `tools`

但这三部分在发请求前都已经被组装过。

其中：

- `systemPrompt` 不是单一字符串，而是分段数组
- `messages` 前面会插入一条系统生成的 context reminder
- `tools` 不是代码对象本身，而是转换后的 API schema

所以从运行时视角看，模型实际看到的是：

- 一份完整的 system prompt
- 一段补充性质的 user context
- 当前对话历史
- 当前允许使用的工具说明和参数 schema

## 2. Prompt 组装总入口

prompt 相关的三块内容统一由 [src/utils/queryContext.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/queryContext.ts) 的 `fetchSystemPromptParts()` 获取：

- `defaultSystemPrompt`
- `userContext`
- `systemContext`

逻辑很直接：

1. 如果没有自定义 prompt，调用 `getSystemPrompt(...)` 生成默认 system prompt
2. 调 `getUserContext()` 读取用户上下文
3. 调 `getSystemContext()` 读取系统上下文

也就是说，当前实现不是只维护一份大 prompt 文本，而是把上下文拆成：

- 主 system prompt
- 用户级上下文
- 系统级上下文

后面再分别注入到不同通道。

## 3. 默认 System Prompt 是怎么生成的

默认 system prompt 的核心实现在 [src/constants/prompts.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/constants/prompts.ts) 的 `getSystemPrompt()`。

这个函数本质上是一个 prompt 装配器。

### 3.1 `getSystemPrompt()` 的输入

它会接收：

- 当前工具列表 `tools`
- 当前主模型 `model`
- 额外工作目录 `additionalWorkingDirectories`
- MCP clients `mcpClients`

也就是说，system prompt 不是纯静态模板，而是会根据当前环境变化。

### 3.2 `getSystemPrompt()` 的执行流程

主要分为几步：

1. 检查是否启用了极简模式 `CLAUDE_CODE_SIMPLE`
2. 收集动态依赖：
   - `getSkillToolCommands(cwd)`
   - `getOutputStyleConfig()`
   - `computeSimpleEnvInfo(model, additionalWorkingDirectories)`
   - 当前 settings
   - 当前启用工具集合
3. 如果是 proactive/kairos 模式，走另一套 prompt
4. 否则组装标准 prompt
5. 返回 `string[]`

这里有一个关键点：

`getSystemPrompt()` 返回的是字符串数组，而不是一个拼好的大字符串。

这说明系统在 prompt 级别就是“分段管理”的，后面还要做缓存切分和 block 组装。

## 4. 默认 System Prompt 里到底有什么

标准路径下，`getSystemPrompt()` 返回内容可以分成两部分：

- 静态部分
- 动态部分

中间可能插入 `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`。

### 4.1 静态部分

主要来自这些函数：

- `getSimpleIntroSection(outputStyleConfig)`
- `getSimpleSystemSection()`
- `getSimpleDoingTasksSection()`
- `getActionsSection()`
- `getUsingYourToolsSection(enabledTools)`
- `getSimpleToneAndStyleSection()`
- `getOutputEfficiencySection()`

这些部分合起来，定义的是模型的基础身份和行为边界。

具体包括：

- 你是谁
- 你是一个终端里的 coding agent
- 你输出的内容如何呈现给用户
- 工具调用在权限模式下如何被批准或拒绝
- 遇到失败时如何处理
- 如何修改代码，避免过度设计
- 如何控制输出风格与篇幅

也就是说，system prompt 并不只是“身份提示”，而是一套完整的行为规范。

### 4.2 动态部分

动态部分通过 `systemPromptSection(...)` 和 `DANGEROUS_uncachedSystemPromptSection(...)` 组合生成。

源码里能看到的主要 section 有：

- `session_guidance`
- `memory`
- `ant_model_override`
- `env_info_simple`
- `language`
- `output_style`
- `mcp_instructions`
- `scratchpad`
- `frc`
- `summarize_tool_results`
- 某些 feature 打开的额外 section，例如 `token_budget`、`brief`

这些动态 section 的作用分别是：

- `session_guidance`
  注入当前会话级别的操作建议。

- `memory`
  注入 memory 机制相关说明。

- `env_info_simple`
  注入运行环境信息。

- `language`
  指定输出语言。

- `output_style`
  指定输出风格。

- `mcp_instructions`
  注入 MCP server 提供的额外使用说明。

- `scratchpad`
  注入 scratchpad 相关规则。

- `summarize_tool_results`
  告诉模型如何处理工具返回内容和结果总结。

所以动态部分不是“补充说明”，而是和当前会话、模型、环境、MCP 状态强相关的一层 prompt。

## 5. 环境信息是如何进入 System Prompt 的

环境信息主要来自 [src/constants/prompts.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/constants/prompts.ts) 的 `computeSimpleEnvInfo()`。

它会生成一段 `# Environment` 区块，内容包括：

- 主工作目录
- 是否是 git repo
- 是否是 git worktree
- 额外工作目录
- 平台
- shell
- OS 版本
- 当前模型描述
- knowledge cutoff
- Claude Code 平台说明

这一段会作为 dynamic system prompt section 的一部分被注入。

这说明当前实现把“你运行在什么环境里”视为 system prompt 的重要组成部分，而不是简单留给模型自行推断。

## 6. 为什么 system prompt 要分静态和动态

这个设计在 [src/constants/prompts.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/constants/prompts.ts) 和 [src/utils/api.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/api.ts) 里很明显。

`getSystemPrompt()` 在静态内容和动态内容之间会插入：

`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`

这个标记的作用不是给模型看的，而是给 API 层做缓存切分。

后续 [src/utils/api.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/api.ts) 的 `splitSysPromptPrefix()` 会把 system prompt 拆成不同 block：

- attribution header
- system prompt prefix
- 静态 block
- 动态 block

这样静态部分可以更稳定地命中缓存，动态部分单独变化，不会破坏整份 prompt 的缓存效果。

所以这个 prompt 系统不只是“内容设计”，也是一个带缓存优化的工程实现。

## 7. userContext 是怎么来的

`userContext` 来自 [src/context.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/context.ts) 的 `getUserContext()`。

它主要包含两类信息：

- 项目/用户记忆文件
- 当前日期

### 7.1 记忆文件如何读取

`getUserContext()` 会调用：

- `getMemoryFiles()`
- `filterInjectedMemoryFiles(...)`
- `getClaudeMds(...)`

相关实现主要在 [src/utils/claudemd.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/claudemd.ts)。

其中 `getClaudeMds()` 会把读取到的 memory files 汇总成一段大文本。

这些 memory files 可能包括：

- `AGENTS.md`
- `CLAUDE.md`
- project instructions
- local/private project instructions
- user global instructions
- auto-memory
- team memory

函数会给每份内容加上来源说明，再拼成一个整体字符串。

换句话说，项目级 instructions 在运行时并不是独立对象，而是被合并成一段统一的 context 文本。

### 7.2 日期如何进入上下文

`getUserContext()` 还会返回：

- `currentDate: Today's date is ...`

也就是说，日期并不一定来自 system prompt 主体，而是作为 user context 的一部分注入。

## 8. systemContext 是怎么来的

`systemContext` 来自 [src/context.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/context.ts) 的 `getSystemContext()`。

它的核心内容是 git 相关快照：

- 当前 branch
- 默认主分支
- git user
- `git status --short`
- 最近几条 commits

这些内容由 `getGitStatus()` 生成。

这个函数会在会话开始时抓取一次当前仓库状态，再格式化成文本块。

所以 `systemContext` 更像是“运行时环境快照”，而不是长期规则。

## 9. 三块内容最终如何合并

这部分是 prompt 组装最关键的地方。

当前实现不是把三份内容直接拼成一个大字符串，而是分两条通道注入。

### 9.1 `systemContext` 追加到 `systemPrompt`

在 [src/utils/api.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/api.ts) 中，`appendSystemContext()` 会：

1. 保留原始 `systemPrompt`
2. 把 `systemContext` 里的 key-value 拼成文本
3. 追加到 `systemPrompt` 末尾

所以 `systemContext` 最终走的是 system prompt 通道。

### 9.2 `userContext` 变成最前面的 user meta message

在同一个文件里，`prependUserContext()` 会构造一条新的 user message，大致形态是：

```text
<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
...
# currentDate
...

IMPORTANT: this context may or may not be relevant...
</system-reminder>
```

然后把这条消息插到整个 `messages` 的最前面。

这说明作者有意把这部分内容定义为：

- 不是 system prompt 的刚性约束
- 而是可参考的附加上下文

### 9.3 在 `query.ts` 中的最终入参

到 [src/query.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/query.ts) 真正发请求前，会做两件事：

- `fullSystemPrompt = asSystemPrompt(appendSystemContext(systemPrompt, systemContext))`
- `messages = prependUserContext(messagesForQuery, userContext)`

然后调用模型时传入：

- `systemPrompt: fullSystemPrompt`
- `messages: prependUserContext(...)`
- `tools: toolUseContext.options.tools`

所以，一次请求里的 prompt 相关结构可以总结成：

- system prompt 本体
- 系统环境追加信息
- 用户/项目 reminder 上下文
- 正常会话消息历史

## 10. 自定义 Prompt 如何介入

除了默认 prompt，系统还支持多种覆盖和追加路径。

这部分逻辑主要在 [src/utils/systemPrompt.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/systemPrompt.ts) 和 [src/QueryEngine.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/QueryEngine.ts)。

优先级大致如下：

1. `overrideSystemPrompt`
   直接替换全部 prompt。

2. `agentSystemPrompt`
   如果主线程绑定了 agent，可能替换默认 prompt。

3. `customSystemPrompt`
   用户显式传入的自定义 prompt。

4. `defaultSystemPrompt`
   默认由 `getSystemPrompt()` 生成。

5. `appendSystemPrompt`
   无论主 prompt 是谁，最后都可追加一段。

在 [src/QueryEngine.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/QueryEngine.ts) 中还能看到，系统会把：

- `customPrompt`
- `memoryMechanicsPrompt`
- `appendSystemPrompt`

按顺序拼成当前会话实际使用的 `systemPrompt`。

这说明 system prompt 并不是固定模板，而是一个多层叠加系统。

## 11. 工具的来源：谁决定“有哪些工具可用”

工具的总注册表在 [src/tools.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/tools.ts)。

核心函数是 `getAllBaseTools()`。

这个函数会返回当前环境下可能存在的所有基础工具，例如：

- `AgentTool`
- `BashTool`
- `FileReadTool`
- `FileEditTool`
- `FileWriteTool`
- `GlobTool`
- `GrepTool`
- `WebFetchTool`
- `WebSearchTool`
- `TodoWriteTool`
- `SkillTool`
- `AskUserQuestionTool`
- MCP resource tools
- feature flag 打开的附加工具

但这里已经做了第一层筛选：

- 某些工具只在 `USER_TYPE === 'ant'` 时存在
- 某些工具依赖 feature flag
- 某些工具依赖当前环境，例如 LSP、worktree mode、agent swarms

所以模型并不是面对仓库里所有工具，而是面对“当前运行条件下可见的一组工具”。

## 12. 工具的统一接口是什么

统一工具接口定义在 [src/Tool.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/Tool.ts)。

一个工具通常具备这些关键字段或方法：

- `name`
- `prompt(...)`
- `inputSchema`
- `call(...)`
- `validateInput(...)`
- `isConcurrencySafe(...)`
- `mapToolResultToToolResultBlockParam(...)`

这意味着在系统眼里，一个工具至少需要回答几个问题：

- 它叫什么
- 它是干什么的
- 它接受什么参数
- 什么时候参数不合法
- 它能不能并发执行
- 它的结果怎么包装回模型

## 13. 工具是如何变成 API schema 的

模型并不会直接看到 TypeScript 工具对象。

本地工具会先通过 [src/utils/api.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/api.ts) 的 `toolToAPISchema()` 转成 API 可接受的 schema。

这个转换会做几件事：

1. 获取工具描述
   调用 `tool.prompt(...)` 生成 description。

2. 获取输入 schema
   - 如果工具自带 `inputJSONSchema`，直接使用
   - 否则把 Zod schema 转成 JSON Schema

3. 根据模型和 feature 增加额外属性
   例如：
   - `strict`
   - `defer_loading`
   - `eager_input_streaming`
   - `cache_control`

所以从模型视角看，工具不是“函数”，而是一份说明文档：

- 工具名
- 工具描述
- 参数结构

这也意味着工具的 `prompt()` 写法会直接影响模型是否会选中它。

## 14. 请求发出时，工具如何被带给模型

在 [src/query.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/query.ts) 的主循环里，调用模型时会传：

- `tools: toolUseContext.options.tools`

之后在 [src/services/api/claude.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/services/api/claude.ts) 中，这些工具会被进一步转换为 Anthropic API 所需格式。

所以这条链路是：

1. `getAllBaseTools()` 生成候选工具池
2. 当前环境筛出当前 turn 可用工具
3. `toolToAPISchema()` 转成 API schema
4. 和 `systemPrompt`、`messages` 一起发给模型

## 15. 工具到底是谁“选择”的

这个问题需要分两层理解。

### 15.1 系统侧选择：哪些工具对模型可见

系统会根据：

- feature flag
- 用户类型
- 当前模式
- 权限规则
- MCP 状态

先决定哪些工具被暴露给模型。

### 15.2 模型侧选择：在可见工具中调用谁

一旦请求发出去，模型会基于：

- 当前 system prompt
- 当前 messages
- 工具 description
- 工具 input schema

自己决定是否产出 `tool_use` block。

所以准确表述应该是：

- 系统决定工具可见性
- 模型决定具体使用哪个工具

## 16. 模型返回 `tool_use` 后发生了什么

主循环仍然在 [src/query.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/query.ts)。

模型流式返回 assistant 内容时，如果内容里包含 `tool_use` block，系统会先把这些 block 收集起来。

当一轮模型输出结束后，如果存在 `tool_use`，就进入工具执行阶段。

工具调度入口是 [src/services/tools/toolOrchestration.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/services/tools/toolOrchestration.ts) 的 `runTools()`。

## 17. 为什么有的工具并发执行，有的串行执行

`runTools()` 会先调用 `partitionToolCalls(...)`。

这里会查看每个工具调用是否 `isConcurrencySafe(...)`。

规则是：

- 连续的并发安全工具可以组成一个批次并发执行
- 非并发安全工具单独串行执行

通常可以这样理解：

- 读类、查询类工具更适合并发
- 写类、修改状态类工具更适合串行

所以工具执行不是简单的顺序 for-loop，而是带调度策略的。

## 18. 单个工具是如何执行的

单个工具执行的核心逻辑在 [src/services/tools/toolExecution.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/services/tools/toolExecution.ts) 的 `runToolUse()`。

执行顺序大致是：

1. `findToolByName(...)` 找到工具定义
2. 如有必要，处理旧工具名 alias fallback
3. 校验输入 schema
4. 调 `validateInput(...)` 做语义校验
5. 走权限检查 `canUseTool(...)`
6. 若允许，执行 `tool.call(...)`
7. 将结果映射为 `tool_result`

### 18.1 找不到工具怎么办

如果找不到工具定义，系统不会崩，而是生成一条错误型 `tool_result` 返回给模型：

- `No such tool available`

### 18.2 schema 校验

执行前会用 `tool.inputSchema.safeParse(...)` 做第一层校验。

这一步保证模型传来的 JSON 参数结构合法。

如果不合法，会直接返回 `InputValidationError` 类型的 `tool_result`。

### 18.3 语义校验

即使 schema 通过，还会调用工具自己的 `validateInput(...)`。

这一步通常用来做更强的业务校验，例如：

- 路径是否合法
- 参数组合是否冲突
- 某类输入是否违反内部规则

### 18.4 权限检查

这是运行时安全边界的核心。

执行前会通过 `canUseTool(...)` 检查当前工具调用是否允许：

- `allow`
- `ask`
- `reject`

这里会综合考虑：

- 当前 permission mode
- allow/deny/ask 规则
- hook
- classifier
- 当前会话状态

如果不是 `allow`，就不会真正执行工具，而是把拒绝信息包装成 `tool_result` 返回给模型。

也就是说，模型可以请求工具，但不能绕过本地权限系统。

### 18.5 真正执行

只有前面的检查全部通过，才会进入 `tool.call(...)`。

这一层才是实际的 bash 执行、文件读写、MCP 调用、网络请求等。

## 19. 工具结果如何回到模型

工具执行成功后，系统不会把任意 JS 对象直接传回模型，而是调用：

- `tool.mapToolResultToToolResultBlockParam(...)`

把结果映射成标准 `tool_result` block。

这个 `tool_result` 会被包进一条新的 user message，追加到消息历史中。

之后下一轮请求模型时，这些 `tool_result` 就成为上下文的一部分。

所以完整的 tool loop 是：

1. assistant 产出 `tool_use`
2. 本地执行工具
3. 系统生成 `tool_result`
4. 再次调用模型
5. assistant 继续推理

## 20. 把两条线合起来理解

如果把 prompt 组装和工具调用放在一张图里看，整个系统其实很清晰：

### 20.1 Prompt 负责定义模型的工作环境

包括：

- 身份和行为规则
- 输出风格
- 当前环境信息
- AGENTS.md / CLAUDE.md / memory
- git 状态快照
- 当前可用工具说明

### 20.2 模型基于这个环境自主决定下一步动作

如果缺信息，可能调用读/搜类工具；
如果需要修改仓库，可能调用编辑/命令类工具。

### 20.3 本地运行时负责把模型动作约束成受控执行

包括：

- schema 校验
- 语义校验
- 权限检查
- hook / classifier
- 并发/串行调度

### 20.4 `tool_result` 进入下一轮上下文

形成新的推理输入，直到当前任务结束。

## 21. 适合分享时的总结说法

如果要在分享里用一句话收束，可以这样概括：

Claude Code 并不是把用户输入直接转发给模型。它会先在本地构造一份复杂的运行上下文，包括 system prompt、项目记忆、环境快照和工具 schema；模型在这个上下文中自主决定是否调用工具；而本地运行时再通过 schema、权限和 hooks 把这些调用变成受控、安全、可追踪的真实执行。工具结果随后再回流到消息历史中，构成下一轮推理输入。这就是整个 agent loop 的核心工作方式。

## 22. 关键源码索引

### Prompt 组装相关

- [src/query.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/query.ts)
- [src/utils/queryContext.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/queryContext.ts)
- [src/constants/prompts.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/constants/prompts.ts)
- [src/context.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/context.ts)
- [src/utils/api.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/api.ts)
- [src/utils/systemPrompt.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/systemPrompt.ts)
- [src/utils/claudemd.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/claudemd.ts)
- [src/QueryEngine.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/QueryEngine.ts)

### 工具系统相关

- [src/tools.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/tools.ts)
- [src/Tool.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/Tool.ts)
- [src/utils/api.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/utils/api.ts)
- [src/services/api/claude.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/services/api/claude.ts)
- [src/services/tools/toolOrchestration.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/services/tools/toolOrchestration.ts)
- [src/services/tools/toolExecution.ts](/Users/jerryshi/Desktop/workspace/research/claude-code/src/services/tools/toolExecution.ts)
