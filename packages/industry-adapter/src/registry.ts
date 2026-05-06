import type { IndustryAdapter } from './types.js'

/**
 * 行业 Adapter 注册表
 * 负责管理已注册的行业适配器的生命周期
 */
export class IndustryRegistry {
  private adapters = new Map<string, IndustryAdapter>()

  /**
   * 注册一个行业适配器
   * @param adapter 行业适配器实例
   */
  register(adapter: IndustryAdapter): void {
    this.adapters.set(adapter.industryCode, adapter)
  }

  /**
   * 加载指定行业代码对应的适配器
   * @param industryCode 行业代码
   * @returns 行业适配器
   * @throws 如果适配器未注册抛出 Error
   */
  load(industryCode: string): IndustryAdapter {
    const adapter = this.adapters.get(industryCode)
    if (!adapter) {
      throw new Error(`Industry adapter not registered: ${industryCode}`)
    }
    return adapter
  }

  /**
   * 检查是否已注册指定行业代码的适配器
   * @param industryCode 行业代码
   * @returns 是否已注册
   */
  has(industryCode: string): boolean {
    return this.adapters.has(industryCode)
  }

  /**
   * 获取所有已注册的行业代码列表
   * @returns 行业代码数组
   */
  listCodes(): string[] {
    return Array.from(this.adapters.keys())
  }
}
