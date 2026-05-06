import type { ContextEnvelope } from './ContextEnvelope.js'
import type { NormalizedIntent, BizRef, FactSet } from '@claude-code-best/industry-adapter'

export interface AdapterPipelineOutput {
  intent: NormalizedIntent
  bizRefs: Record<string, BizRef>
  factSet: FactSet
}

export class ContextEnvelopeBuilder {
  build(
    current: ContextEnvelope,
    pipelineOutput: AdapterPipelineOutput,
    newTurnId: string
  ): ContextEnvelope {
    return {
      ...current,
      bizRefs: {
        ...current.bizRefs,
        ...pipelineOutput.bizRefs,
      },
      factSet: pipelineOutput.factSet,
      turnId: newTurnId,
      updatedAt: new Date().toISOString(),
    }
  }
}
