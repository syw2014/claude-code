import { BaseSemanticMapper } from '../../src/base/BaseSemanticMapper.js'
import type { IntentTemplate, NormalizedIntent } from '../../src/types.js'

export class LibrarySemanticMapper extends BaseSemanticMapper {
  protected templates: IntentTemplate[] = [
    {
      sceneCode: 'circulation',
      pathType: 'fast',
      examples: ['借书', 'checkout', 'borrow', '借阅'],
      requiredParams: ['bookId', 'readerId'],
    },
    {
      sceneCode: 'circulation',
      pathType: 'fast',
      examples: ['还书', 'return book', 'return', '归还'],
      requiredParams: ['bookId', 'readerId'],
    },
    {
      sceneCode: 'circulation',
      pathType: 'fast',
      examples: ['续借', 'renew', 'renewal', '续期'],
      requiredParams: ['bookId', 'readerId'],
    },
    {
      sceneCode: 'query',
      pathType: 'fast',
      examples: ['查询馆藏', 'query holdings', 'search books', '查书'],
      requiredParams: ['query'],
    },
    {
      sceneCode: 'query',
      pathType: 'fast',
      examples: ['查询读者', 'query reader', 'reader info', '读者信息'],
      requiredParams: ['readerId'],
    },
    {
      sceneCode: 'fee',
      pathType: 'complex',
      examples: ['免费', 'waive fee', 'waive', '免罚款'],
      requiredParams: ['readerId', 'feeId'],
    },
    {
      sceneCode: 'dispute',
      pathType: 'complex',
      examples: ['投诉', 'dispute', 'complaint', '申诉'],
      requiredParams: ['readerId'],
    },
  ]

  override async map(
    input: string,
    tenantId: string,
    sessionHistory?: NormalizedIntent[]
  ): Promise<NormalizedIntent> {
    const baseResult = await super.map(input, tenantId, sessionHistory)

    // If the base returned an unknown/fallback intent, preserve it
    if (baseResult.sceneCode === 'unknown') {
      return baseResult
    }

    // Find the best-matching template to determine actionCode
    const inputLower = input.toLowerCase()

    // Score each template and find best match
    const scores = this.templates.map((template) => ({
      template,
      score: this.scoreTemplate(input, template),
    }))

    const bestMatch = scores.reduce((prev, current) =>
      this.computeOverallConfidence(current.score) >
      this.computeOverallConfidence(prev.score)
        ? current
        : prev
    )

    const bestTemplate = bestMatch.template

    // Find the best-matching example within the best template
    const matchedExample = bestTemplate.examples.find((ex) =>
      inputLower.includes(ex.toLowerCase())
    )

    const actionCode = this.deriveActionCode(
      bestTemplate.sceneCode,
      matchedExample ?? ''
    )

    return {
      ...baseResult,
      actionCode,
    }
  }

  private deriveActionCode(sceneCode: string, matchedExample: string): string {
    const ex = matchedExample.toLowerCase()

    if (sceneCode === 'circulation') {
      // Check renew first to avoid '续借' matching '借' → checkout
      if (ex.includes('续') || ex.includes('renew')) {
        return 'renew_book'
      }
      if (ex.includes('还') || ex.includes('return') || ex.includes('归还')) {
        return 'return_book'
      }
      if (ex.includes('借') || ex.includes('borrow') || ex.includes('checkout')) {
        return 'checkout_book'
      }
    }

    if (sceneCode === 'query') {
      if (
        ex.includes('馆藏') ||
        ex.includes('holdings') ||
        ex.includes('books') ||
        ex.includes('查书')
      ) {
        return 'query_holdings'
      }
      if (ex.includes('读者') || ex.includes('reader')) {
        return 'query_reader'
      }
    }

    if (sceneCode === 'fee') {
      return 'waive_fee'
    }

    if (sceneCode === 'dispute') {
      return 'handle_dispute'
    }

    return sceneCode
  }
}
