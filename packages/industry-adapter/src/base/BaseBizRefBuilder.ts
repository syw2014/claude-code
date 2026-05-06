import type {
  BizRef,
  BizRefBuilder,
  FactSet,
  NormalizedIntent,
} from '../types.js'

export abstract class BaseBizRefBuilder implements BizRefBuilder {
  constructor() {}

  async build(
    _intent: NormalizedIntent,
    _tenantId: string
  ): Promise<{ bizRefs: Record<string, BizRef>; factSet: FactSet }> {
    // Base implementation: returns empty bizRefs + minimal factSet
    // Subclasses override to fetch actual business objects
    const factSet: FactSet = {
      facts: {},
      sources: [],
      builtAt: new Date().toISOString(),
    }

    return {
      bizRefs: {},
      factSet,
    }
  }
}
