import type { IndustryAdapter, Skill, Workflow, RuleSet } from '../../src/types.js'
import { LibrarySemanticMapper } from './SemanticMapper.js'
import { LibraryBizRefBuilder } from './BizRefBuilder.js'
import { LibraryCapabilityGateway } from './CapabilityGateway.js'
import { loadAllWorkflows } from './workflows/loader.js'
import { RuleEngine } from '../../src/rules/RuleEngine.js'
import type { RuleDSL } from '../../src/rules/RuleEngine.js'
import { toolSchema as checkoutBookSchema } from './tools/checkout_book.js'
import { toolSchema as returnBookSchema } from './tools/return_book.js'
import { toolSchema as renewBookSchema } from './tools/renew_book.js'
import { toolSchema as queryReaderSchema } from './tools/query_reader.js'
import { toolSchema as queryHoldingsSchema } from './tools/query_holdings.js'
import { toolSchema as reserveBookSchema } from './tools/reserve_book.js'
import { toolSchema as waiveFeeSchema } from './tools/waive_fee.js'
import { toolSchema as handleDisputeSchema } from './tools/handle_dispute.js'
import { toolSchema as specialAuthSchema } from './tools/special_auth.js'
import rulesJson from './rules/library-rules-base.json' with { type: 'json' }

export class LibraryAdapter implements IndustryAdapter {
  readonly industryCode = 'library'
  readonly semanticMapper = new LibrarySemanticMapper()
  readonly bizRefBuilder = new LibraryBizRefBuilder()
  readonly capabilityGateway = new LibraryCapabilityGateway()

  getBizTools(): unknown[] {
    return [
      checkoutBookSchema,
      returnBookSchema,
      renewBookSchema,
      queryReaderSchema,
      queryHoldingsSchema,
      reserveBookSchema,
      waiveFeeSchema,
      handleDisputeSchema,
      specialAuthSchema,
    ]
  }

  getBizSkills(): Skill[] {
    return []
  }

  getBizWorkflows(): Workflow[] {
    return loadAllWorkflows()
  }

  getRules(): RuleSet {
    return new RuleEngine(rulesJson as RuleDSL)
  }
}

export { loadWorkflow, loadAllWorkflows } from './workflows/loader.js'
export type { WorkflowName } from './workflows/loader.js'
