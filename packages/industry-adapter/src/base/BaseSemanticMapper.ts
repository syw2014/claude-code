import type {
  ConfidenceScore,
  IntentTemplate,
  NormalizedIntent,
  SemanticMapper,
} from '../types.js'

export abstract class BaseSemanticMapper implements SemanticMapper {
  protected abstract templates: IntentTemplate[]

  constructor() {}

  async map(
    input: string,
    _tenantId: string,
    _sessionHistory?: NormalizedIntent[]
  ): Promise<NormalizedIntent> {
    const threshold = 0.1

    // If no templates defined, return fallback intent
    if (this.templates.length === 0) {
      return {
        sceneCode: 'unknown',
        actionCode: 'unknown',
        confidence: 0,
        pathType: 'complex',
        requiredParams: [],
        rawInput: input,
      }
    }

    // Score each template against input
    const scores = this.templates.map((template) => ({
      template,
      score: this.scoreTemplate(input, template),
    }))

    // Pick best-scoring template
    const bestMatch = scores.reduce((prev, current) =>
      this.computeOverallConfidence(current.score) >
      this.computeOverallConfidence(prev.score)
        ? current
        : prev
    )

    const overallConfidence = this.computeOverallConfidence(bestMatch.score)

    // If no templates match above threshold, return fallback intent
    if (overallConfidence < threshold) {
      return {
        sceneCode: 'unknown',
        actionCode: 'unknown',
        confidence: 0,
        pathType: 'complex',
        requiredParams: [],
        rawInput: input,
      }
    }

    // Return NormalizedIntent from best template
    return {
      sceneCode: bestMatch.template.sceneCode,
      actionCode: 'default',
      confidence: overallConfidence,
      pathType: bestMatch.template.pathType,
      requiredParams: bestMatch.template.requiredParams,
      rawInput: input,
    }
  }

  protected scoreTemplate(
    input: string,
    template: IntentTemplate
  ): ConfidenceScore {
    // Simple keyword scoring
    const inputLower = input.toLowerCase()
    const matchCount = template.examples.filter((example) =>
      inputLower.includes(example.toLowerCase())
    ).length

    const keywordMatch =
      template.examples.length > 0
        ? matchCount / template.examples.length
        : 0

    return {
      keywordMatch,
      embeddingSimilarity: 0,
      structureMatch: 0,
      contextConsistency: 0,
    }
  }

  protected computeOverallConfidence(score: ConfidenceScore): number {
    const confidence =
      score.keywordMatch * 0.6 +
      score.embeddingSimilarity * 0.3 +
      score.structureMatch * 0.1 +
      score.contextConsistency * 0

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, confidence))
  }
}
