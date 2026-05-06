import type {
  IndustryAdapter,
  NormalizedIntent,
  BizRef,
  FactSet,
  CapabilityBinding,
} from './types.js'

/**
 * 适配器管道的输出结构
 */
export interface PipelineOutput {
  intent: NormalizedIntent
  bizRefs: Record<string, BizRef>
  factSet: FactSet
  bindings: CapabilityBinding[]
}

/**
 * 行业适配器管道
 * 执行语义映射 → 业务对象构建 → 能力网关路由的三阶段流程
 */
export class AdapterPipeline {
  constructor(private adapter: IndustryAdapter) {}

  /**
   * 执行完整的适配器管道
   * 1. 语义映射：将用户输入映射为规范化意图
   * 2. 业务对象构建：根据意图构建业务对象和事实集
   * 3. 能力路由：根据意图和业务对象确定可用的能力绑定
   *
   * @param userInput 用户输入文本
   * @param tenantId 租户 ID
   * @param _sessionHistory 会话历史（可选）
   * @returns 管道输出
   */
  async run(
    userInput: string,
    tenantId: string,
    _sessionHistory?: NormalizedIntent[]
  ): Promise<PipelineOutput> {
    // Step 1: 语义映射
    const intent = await this.adapter.semanticMapper.map(
      userInput,
      tenantId,
      _sessionHistory
    )

    // Step 2: 业务对象构建
    const { bizRefs, factSet } = await this.adapter.bizRefBuilder.build(
      intent,
      tenantId
    )

    // Step 3: 能力路由
    const bindings = this.adapter.capabilityGateway.route(intent, bizRefs)

    return {
      intent,
      bizRefs,
      factSet,
      bindings,
    }
  }
}
