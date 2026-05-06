import { BaseCapabilityGateway } from '../../src/base/BaseCapabilityGateway.js'
import type {
  BizRef,
  CapabilityBinding,
  CapabilityGateway,
  NormalizedIntent,
} from '../../src/types.js'

export class LibraryCapabilityGateway extends BaseCapabilityGateway implements CapabilityGateway {
  override route(
    intent: NormalizedIntent,
    _bizRefs: Record<string, BizRef>
  ): CapabilityBinding[] {
    switch (intent.actionCode) {
      case 'checkout_book':
        return [
          {
            channel: 'tool',
            capabilityName: 'checkout_book',
            permissionLevel: 'low',
            confirmLevel: 'auto',
          },
        ]

      case 'return_book':
        return [
          {
            channel: 'tool',
            capabilityName: 'return_book',
            permissionLevel: 'low',
            confirmLevel: 'auto',
          },
        ]

      case 'renew_book':
        return [
          {
            channel: 'tool',
            capabilityName: 'renew_book',
            permissionLevel: 'low',
            confirmLevel: 'auto',
          },
        ]

      case 'query_holdings':
        return [
          {
            channel: 'tool',
            capabilityName: 'query_holdings',
            permissionLevel: 'low',
            confirmLevel: 'auto',
          },
        ]

      case 'query_reader':
        return [
          {
            channel: 'tool',
            capabilityName: 'query_reader',
            permissionLevel: 'medium',
            confirmLevel: 'silent_confirm',
          },
        ]

      case 'waive_fee':
        return [
          {
            channel: 'tool',
            capabilityName: 'waive_fee',
            permissionLevel: 'high',
            confirmLevel: 'explicit_confirm',
          },
        ]

      case 'handle_dispute':
        return [
          {
            channel: 'workflow',
            capabilityName: 'handle_dispute',
            permissionLevel: 'high',
            confirmLevel: 'supervisor_approval',
          },
        ]

      case 'acquisition':
      case 'acquisition_fast':
        return [
          {
            channel: 'workflow',
            capabilityName: 'acquisition-fast-flow',
            permissionLevel: 'medium',
            confirmLevel: 'auto',
          },
        ]

      default:
        return []
    }
  }
}
