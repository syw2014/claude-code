import { BaseBizRefBuilder } from '../../src/base/BaseBizRefBuilder.js'
import type {
  BizRef,
  BizRefBuilder,
  FactSet,
  NormalizedIntent,
} from '../../src/types.js'

export class LibraryBizRefBuilder extends BaseBizRefBuilder implements BizRefBuilder {
  override async build(
    intent: NormalizedIntent,
    tenantId: string
  ): Promise<{ bizRefs: Record<string, BizRef>; factSet: FactSet }> {
    const snapshotAt = new Date().toISOString()
    const bizRefs: Record<string, BizRef> = {}

    for (const param of intent.requiredParams) {
      if (param.includes('book') || param.includes('Book')) {
        bizRefs[param] = {
          type: 'BOOK',
          id: `${param}_stub`,
          attrs: {},
          constraints: [],
          sourceSystem: 'library-stub',
          snapshotAt,
        }
      } else if (param.includes('reader') || param.includes('Reader')) {
        bizRefs[param] = {
          type: 'READER',
          id: `${param}_stub`,
          attrs: {},
          constraints: [],
          sourceSystem: 'library-stub',
          snapshotAt,
        }
      } else if (param.includes('fee') || param.includes('Fee')) {
        bizRefs[param] = {
          type: 'FEE',
          id: `${param}_stub`,
          attrs: {},
          constraints: [],
          sourceSystem: 'library-stub',
          snapshotAt,
        }
      }
    }

    const factSet: FactSet = {
      facts: {
        tenantId,
        intentSceneCode: intent.sceneCode,
      },
      sources: [],
      builtAt: snapshotAt,
    }

    return { bizRefs, factSet }
  }
}
