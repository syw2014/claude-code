import { describe, test, expect } from 'bun:test'
import { OutputValidator } from '../OutputValidator.js'
import type { ValidationResult } from '../OutputValidator.js'

describe('OutputValidator', () => {
  const validator = new OutputValidator()

  test('validate() clean output — pass, no issues, sanitizedOutput unchanged', () => {
    const output = 'This is a clean output with no PII or sensitive data.'
    const result = validator.validate(output)

    expect(result.valid).toBe(true)
    expect(result.severity).toBe('pass')
    expect(result.issues).toEqual([])
    expect(result.sanitizedOutput).toBe(output)
  })

  test('validate() empty string — warn EMPTY_OUTPUT', () => {
    const result = validator.validate('')

    expect(result.valid).toBe(true) // warn is not block
    expect(result.severity).toBe('warn')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].code).toBe('EMPTY_OUTPUT')
    expect(result.issues[0].severity).toBe('warn')
    expect(result.issues[0].message).toBe('输出为空')
  })

  test('validate() output exceeding maxLength — warn OUTPUT_TOO_LONG', () => {
    const config = { maxLength: 100 }
    const validatorWithConfig = new OutputValidator(config)
    const longOutput = 'a'.repeat(101)

    const result = validatorWithConfig.validate(longOutput)

    expect(result.valid).toBe(true)
    expect(result.severity).toBe('warn')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].code).toBe('OUTPUT_TOO_LONG')
    expect(result.issues[0].severity).toBe('warn')
    expect(result.issues[0].message).toBe('输出超过长度限制')
  })

  test('validate() Chinese ID number — block PII_ID_NUMBER, sanitizedOutput has [REDACTED]', () => {
    // Valid Chinese ID: 18 digits, last can be X
    const output = 'The customer ID is 123456789012345678 in our system.'
    const result = validator.validate(output)

    expect(result.valid).toBe(false) // block severity makes valid false
    expect(result.severity).toBe('block')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].code).toBe('PII_ID_NUMBER')
    expect(result.issues[0].severity).toBe('block')
    expect(result.issues[0].message).toBe('输出包含身份证号码')
    expect(result.issues[0].match).toBe('123456789012345678')
    expect(result.sanitizedOutput).toContain('[REDACTED]')
    expect(result.sanitizedOutput).not.toContain('123456789012345678')
  })

  test('validate() Chinese ID number with X suffix', () => {
    const output = 'ID: 12345678901234567X is valid'
    const result = validator.validate(output)

    expect(result.valid).toBe(false)
    expect(result.issues[0].code).toBe('PII_ID_NUMBER')
    expect(result.issues[0].match).toBe('12345678901234567X')
    expect(result.sanitizedOutput).toContain('[REDACTED]')
  })

  test('validate() Chinese phone number — warn PII_PHONE, sanitizedOutput unchanged (warn not redacted)', () => {
    const phoneNumber = '13812345678'
    const output = `Call customer at ${phoneNumber} to confirm`
    const result = validator.validate(output)

    expect(result.valid).toBe(true) // warn is not block
    expect(result.severity).toBe('warn')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].code).toBe('PII_PHONE')
    expect(result.issues[0].severity).toBe('warn')
    expect(result.issues[0].message).toBe('输出包含手机号码')
    expect(result.issues[0].match).toBe('13812345678')
    // Warn-severity matches are NOT redacted
    expect(result.sanitizedOutput).toContain('13812345678')
  })

  test('validate() bank card 16 digits — block PII_BANK_CARD', () => {
    const cardNumber = '6234567890123456'
    const output = `Card number: ${cardNumber}`
    const result = validator.validate(output)

    expect(result.valid).toBe(false)
    expect(result.severity).toBe('block')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].code).toBe('PII_BANK_CARD')
    expect(result.issues[0].severity).toBe('block')
    expect(result.issues[0].message).toBe('输出包含银行卡号')
    expect(result.issues[0].match).toBe(cardNumber)
    expect(result.sanitizedOutput).toContain('[REDACTED]')
  })

  test('validate() bank card 19 digits — block PII_BANK_CARD', () => {
    const cardNumber = '6234567890123456789'
    const output = `Account: ${cardNumber}`
    const result = validator.validate(output)

    expect(result.valid).toBe(false)
    expect(result.issues[0].code).toBe('PII_BANK_CARD')
    expect(result.issues[0].match).toBe(cardNumber)
  })

  test('validate() ID number makes valid=false', () => {
    const output = 'ID: 123456789012345678'
    const result = validator.validate(output)

    expect(result.valid).toBe(false)
  })

  test('validate() multiple issues — all reported', () => {
    const output = `
      Customer ID: 123456789012345678
      Phone: 15612345678
      Card: 9876543210123456
      Another ID: 98765432109876543X
    `
    const result = validator.validate(output)

    expect(result.valid).toBe(false)
    expect(result.severity).toBe('block')
    // Should find: 2 ID numbers (block), 1 phone (warn), 1 card (block)
    expect(result.issues.length).toBeGreaterThanOrEqual(4)

    const blockIssues = result.issues.filter(i => i.severity === 'block')
    const warnIssues = result.issues.filter(i => i.severity === 'warn')

    expect(blockIssues.length).toBeGreaterThanOrEqual(3) // 2 IDs + 1 card
    expect(warnIssues.length).toBeGreaterThanOrEqual(1) // 1 phone
  })

  test('validate() custom maxLength config', () => {
    const validator200 = new OutputValidator({ maxLength: 200 })
    const output101 = 'a'.repeat(101)
    const output200 = 'a'.repeat(200)
    const output201 = 'a'.repeat(201)

    const result101 = validator200.validate(output101)
    expect(result101.valid).toBe(true) // 101 <= 200
    expect(result101.issues.filter(i => i.code === 'OUTPUT_TOO_LONG')).toHaveLength(0)

    const result200 = validator200.validate(output200)
    expect(result200.valid).toBe(true) // 200 == 200
    expect(result200.issues.filter(i => i.code === 'OUTPUT_TOO_LONG')).toHaveLength(0)

    const result201 = validator200.validate(output201)
    expect(result201.valid).toBe(true) // still valid because warn, but issue flagged
    expect(result201.issues.filter(i => i.code === 'OUTPUT_TOO_LONG')).toHaveLength(1)
  })

  test('validate() default maxLength is 10_000', () => {
    const validator10k = new OutputValidator()
    const output10k = 'a'.repeat(10000)
    const output10001 = 'a'.repeat(10001)

    const result10k = validator10k.validate(output10k)
    expect(result10k.issues.filter(i => i.code === 'OUTPUT_TOO_LONG')).toHaveLength(0)

    const result10001 = validator10k.validate(output10001)
    expect(result10001.issues.filter(i => i.code === 'OUTPUT_TOO_LONG')).toHaveLength(1)
  })

  test('validate() ID number should not match 17 digits (missing check digit)', () => {
    const output = 'Number: 12345678901234567 is incomplete'
    const result = validator.validate(output)

    // 17 digits without X should not match ID pattern
    expect(result.issues.filter(i => i.code === 'PII_ID_NUMBER')).toHaveLength(0)
  })

  test('validate() bank card should not match 15 digits (too short)', () => {
    const output = 'Card: 123456789012345'
    const result = validator.validate(output)

    expect(result.issues.filter(i => i.code === 'PII_BANK_CARD')).toHaveLength(0)
  })

  test('validate() phone with different starting digits 1[3-9]', () => {
    const tests = [
      { phone: '13800000000', shouldMatch: true },
      { phone: '14500000000', shouldMatch: true },
      { phone: '15900000000', shouldMatch: true },
      { phone: '16700000000', shouldMatch: true },
      { phone: '18800000000', shouldMatch: true },
      { phone: '19900000000', shouldMatch: true },
      { phone: '12800000000', shouldMatch: false }, // starts with 12, not in range
      { phone: '11800000000', shouldMatch: false }, // starts with 11, not in range
    ]

    for (const { phone, shouldMatch } of tests) {
      const result = validator.validate(`Phone: ${phone}`)
      const hasPhoneIssue = result.issues.some(i => i.code === 'PII_PHONE')
      if (hasPhoneIssue !== shouldMatch) {
        throw new Error(
          `Phone ${phone} shouldMatch=${shouldMatch} but hasPhoneIssue=${hasPhoneIssue}`
        )
      }
      expect(hasPhoneIssue).toBe(shouldMatch)
    }
  })

  test('validate() all block issues get redacted in sanitizedOutput', () => {
    const output = 'IDs: 123456789012345678 and 11111111111111111X, card: 1234567890123456'
    const result = validator.validate(output)

    // Count [REDACTED] occurrences
    const redactedCount = (result.sanitizedOutput.match(/\[REDACTED\]/g) || []).length
    const blockCount = result.issues.filter(i => i.severity === 'block').length

    expect(redactedCount).toBe(blockCount)
  })

  test('validate() warn issues NOT redacted in sanitizedOutput', () => {
    const output = 'Contact: 13900000000'
    const result = validator.validate(output)

    // Phone is warn-level, should not be redacted
    expect(result.sanitizedOutput).toContain('13900000000')
    expect(result.sanitizedOutput).not.toContain('[REDACTED]')
  })

  test('validate() mixed issues with correct severity and redaction', () => {
    const output = 'ID 123456789012345678 phone 14900000000 card 1111111111111111'
    const result = validator.validate(output)

    expect(result.valid).toBe(false) // has block
    expect(result.severity).toBe('block')

    const blockIssues = result.issues.filter(i => i.severity === 'block')
    const warnIssues = result.issues.filter(i => i.severity === 'warn')

    expect(blockIssues.length).toBeGreaterThanOrEqual(2) // ID + card
    expect(warnIssues.length).toBeGreaterThanOrEqual(1) // phone

    // ID and card should be redacted
    expect(result.sanitizedOutput).not.toContain('123456789012345678')
    expect(result.sanitizedOutput).not.toContain('1111111111111111')
    // Phone should NOT be redacted
    expect(result.sanitizedOutput).toContain('14900000000')
  })
})
