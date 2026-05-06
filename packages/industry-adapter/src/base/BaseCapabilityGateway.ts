import type {
  CapabilityBinding,
  CapabilityGateway,
  BizRef,
  NormalizedIntent,
} from '../types.js'

export abstract class BaseCapabilityGateway implements CapabilityGateway {
  constructor() {}

  route(
    _intent: NormalizedIntent,
    _bizRefs: Record<string, BizRef>
  ): CapabilityBinding[] {
    // Base implementation: returns empty array
    // Subclasses override to return actual bindings based on intent.sceneCode/actionCode
    return []
  }
}
