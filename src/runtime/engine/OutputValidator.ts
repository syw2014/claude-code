import type { UUID } from '../types.js'

export type ValidationSeverity = 'pass' | 'warn' | 'block'

export interface ValidationIssue {
  code: string
  severity: 'warn' | 'block'
  message: string
  /** Optional: substring that triggered the issue */
  match?: string
}

export interface ValidationResult {
  valid: boolean // false if any issue has severity='block'
  severity: ValidationSeverity
  issues: ValidationIssue[]
  /** Redacted output (sensitive patterns replaced with [REDACTED]) */
  sanitizedOutput: string
}

export interface OutputValidatorConfig {
  /** Max output length in characters (default: 10_000) */
  maxLength?: number
  /** Industry code for contextual rule names in issues */
  industryCode?: string
}

export class OutputValidator {
  private config: OutputValidatorConfig
  private maxLength: number

  constructor(config: OutputValidatorConfig = {}) {
    this.config = config
    this.maxLength = config.maxLength ?? 10_000
  }

  validate(output: string, taskId?: UUID): ValidationResult {
    const issues: ValidationIssue[] = []
    let sanitizedOutput = output

    // Rule 1: Empty output
    if (output.length === 0) {
      issues.push({
        code: 'EMPTY_OUTPUT',
        severity: 'warn',
        message: '输出为空',
      })
    }

    // Rule 2: Excessive length
    if (output.length > this.maxLength) {
      issues.push({
        code: 'OUTPUT_TOO_LONG',
        severity: 'warn',
        message: '输出超过长度限制',
      })
    }

    // Keep track of all matched positions for redaction
    const blockMatches: Array<{ match: string; start: number; end: number }> = []

    // Rule 3: Chinese ID number (18 digits, last can be X)
    const idPattern = /\b\d{17}[\dXx]\b/g
    let idMatch: RegExpExecArray | null
    while ((idMatch = idPattern.exec(output)) !== null) {
      const matchStr = idMatch[0]
      issues.push({
        code: 'PII_ID_NUMBER',
        severity: 'block',
        message: '输出包含身份证号码',
        match: matchStr,
      })
      blockMatches.push({
        match: matchStr,
        start: idMatch.index,
        end: idMatch.index + matchStr.length,
      })
    }

    // Rule 4: Chinese phone number (1[3-9] followed by 9 digits)
    const phonePattern = /\b1[3-9]\d{9}\b/g
    let phoneMatch: RegExpExecArray | null
    while ((phoneMatch = phonePattern.exec(output)) !== null) {
      const matchStr = phoneMatch[0]
      issues.push({
        code: 'PII_PHONE',
        severity: 'warn',
        message: '输出包含手机号码',
        match: matchStr,
      })
    }

    // Rule 5: Bank card number (16-19 consecutive digits)
    // Only flag if NOT already matched by ID number pattern
    const cardPattern = /\b\d{16,19}\b/g
    let cardMatch: RegExpExecArray | null
    while ((cardMatch = cardPattern.exec(output)) !== null) {
      const matchStr = cardMatch[0]
      const matchStart = cardMatch.index

      // Check if this match overlaps with an ID number match
      const isOverlapWithId = blockMatches.some(
        idBlock =>
          matchStart >= idBlock.start && matchStart < idBlock.end
      )

      if (!isOverlapWithId) {
        issues.push({
          code: 'PII_BANK_CARD',
          severity: 'block',
          message: '输出包含银行卡号',
          match: matchStr,
        })
        blockMatches.push({
          match: matchStr,
          start: matchStart,
          end: matchStart + matchStr.length,
        })
      }
    }

    // Compute sanitizedOutput: replace all block-severity matches with [REDACTED]
    if (blockMatches.length > 0) {
      // Sort by start position in reverse order to replace from end to start
      // (to avoid index shifting issues)
      blockMatches.sort((a, b) => b.start - a.start)

      for (const blockMatch of blockMatches) {
        sanitizedOutput =
          sanitizedOutput.substring(0, blockMatch.start) +
          '[REDACTED]' +
          sanitizedOutput.substring(blockMatch.end)
      }
    }

    // Determine valid and severity
    const hasBlock = issues.some(i => i.severity === 'block')
    const hasWarn = issues.some(i => i.severity === 'warn')

    const severity: ValidationSeverity = hasBlock ? 'block' : hasWarn ? 'warn' : 'pass'
    const valid = !hasBlock

    return {
      valid,
      severity,
      issues,
      sanitizedOutput,
    }
  }
}
