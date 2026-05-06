import { describe, test, expect } from 'bun:test'
import * as checkoutBook from '../checkout_book.js'
import * as returnBook from '../return_book.js'
import * as renewBook from '../renew_book.js'
import * as reserveBook from '../reserve_book.js'
import * as queryHoldings from '../query_holdings.js'
import * as queryReader from '../query_reader.js'
import * as waiveFee from '../waive_fee.js'
import * as handleDispute from '../handle_dispute.js'
import * as specialAuth from '../special_auth.js'

describe('Library Tools', () => {
  test('checkout_book.execute returns success with checkoutId', async () => {
    const result = await checkoutBook.execute({
      bookId: 'BOOK001',
      readerId: 'READER001',
    })

    expect(result.success).toBe(true)
    expect(result.checkoutId).toBeTruthy()
    expect(result.bookId).toBe('BOOK001')
    expect(result.readerId).toBe('READER001')
    expect(result.dueDate).toBeTruthy()
    expect(result.message).toContain('successfully checked out')
  })

  test('checkout_book uses provided dueDate', async () => {
    const providedDate = '2026-06-30'
    const result = await checkoutBook.execute({
      bookId: 'BOOK002',
      readerId: 'READER002',
      dueDate: providedDate,
    })

    expect(result.success).toBe(true)
    expect(result.dueDate).toBe(providedDate)
  })

  test('checkout_book toolSchema has required fields', () => {
    expect(checkoutBook.toolSchema.name).toBe('checkout_book')
    expect(checkoutBook.toolSchema.description).toBeTruthy()
    expect(checkoutBook.toolSchema.inputSchema.required).toContain('bookId')
    expect(checkoutBook.toolSchema.inputSchema.required).toContain('readerId')
  })

  test('return_book.execute returns success with returnedAt', async () => {
    const result = await returnBook.execute({
      bookId: 'BOOK001',
      readerId: 'READER001',
    })

    expect(result.success).toBe(true)
    expect(result.bookId).toBe('BOOK001')
    expect(result.returnedAt).toBeTruthy()
    expect(result.lateFee).toBe(0)
    expect(result.message).toContain('successfully returned')
  })

  test('return_book toolSchema has required fields', () => {
    expect(returnBook.toolSchema.name).toBe('return_book')
    expect(returnBook.toolSchema.description).toBeTruthy()
    expect(returnBook.toolSchema.inputSchema.required).toContain('bookId')
    expect(returnBook.toolSchema.inputSchema.required).toContain('readerId')
  })

  test('renew_book.execute returns success with newDueDate', async () => {
    const result = await renewBook.execute({
      bookId: 'BOOK001',
      readerId: 'READER001',
    })

    expect(result.success).toBe(true)
    expect(result.bookId).toBe('BOOK001')
    expect(result.newDueDate).toBeTruthy()
    expect(result.renewCount).toBe(1)
    expect(result.message).toContain('successfully renewed')
  })

  test('renew_book respects extendDays parameter', async () => {
    const result = await renewBook.execute({
      bookId: 'BOOK002',
      readerId: 'READER002',
      extendDays: 15,
    })

    expect(result.success).toBe(true)
    expect(result.newDueDate).toBeTruthy()
  })

  test('renew_book toolSchema has required fields', () => {
    expect(renewBook.toolSchema.name).toBe('renew_book')
    expect(renewBook.toolSchema.description).toBeTruthy()
    expect(renewBook.toolSchema.inputSchema.required).toContain('bookId')
    expect(renewBook.toolSchema.inputSchema.required).toContain('readerId')
  })

  test('reserve_book.execute returns reservationId', async () => {
    const result = await reserveBook.execute({
      bookId: 'BOOK001',
      readerId: 'READER001',
    })

    expect(result.success).toBe(true)
    expect(result.reservationId).toBeTruthy()
    expect(result.bookId).toBe('BOOK001')
    expect(result.readerId).toBe('READER001')
    expect(result.position).toBe(1)
  })

  test('reserve_book toolSchema has required fields', () => {
    expect(reserveBook.toolSchema.name).toBe('reserve_book')
    expect(reserveBook.toolSchema.description).toBeTruthy()
    expect(reserveBook.toolSchema.inputSchema.required).toContain('bookId')
    expect(reserveBook.toolSchema.inputSchema.required).toContain('readerId')
  })

  test('query_holdings.execute returns results array', async () => {
    const result = await queryHoldings.execute({
      query: 'science fiction',
    })

    expect(Array.isArray(result.results)).toBe(true)
    expect(result.results.length).toBe(2)
    expect(result.total).toBe(2)
    expect(result.query).toBe('science fiction')
    expect(result.results[0].bookId).toBeTruthy()
    expect(result.results[0].title).toBeTruthy()
    expect(result.results[0].author).toBeTruthy()
    expect(typeof result.results[0].available).toBe('boolean')
    expect(result.results[0].location).toBeTruthy()
  })

  test('query_holdings toolSchema has required fields', () => {
    expect(queryHoldings.toolSchema.name).toBe('query_holdings')
    expect(queryHoldings.toolSchema.description).toBeTruthy()
    expect(queryHoldings.toolSchema.inputSchema.required).toContain('query')
  })

  test('query_reader.execute with R123 returns found=true', async () => {
    const result = await queryReader.execute({
      readerId: 'R123',
    })

    expect(result.found).toBe(true)
    expect(result.reader).toBeTruthy()
    expect(result.reader?.readerId).toBe('R123')
    expect(result.reader?.status).toBe('active')
    expect(result.reader?.currentLoans).toBeGreaterThanOrEqual(0)
  })

  test('query_reader.execute with X000 returns found=false', async () => {
    const result = await queryReader.execute({
      readerId: 'X000',
    })

    expect(result.found).toBe(false)
    expect(result.reader).toBeNull()
  })

  test('query_reader toolSchema has required fields', () => {
    expect(queryReader.toolSchema.name).toBe('query_reader')
    expect(queryReader.toolSchema.description).toBeTruthy()
    expect(queryReader.toolSchema.inputSchema.required).toContain('readerId')
  })

  test('waive_fee.execute returns amountWaived > 0', async () => {
    const result = await waiveFee.execute({
      readerId: 'READER001',
      feeId: 'FEE001',
      reason: 'Technical issue',
      approvedBy: 'admin',
    })

    expect(result.success).toBe(true)
    expect(result.feeId).toBe('FEE001')
    expect(result.amountWaived).toBeGreaterThan(0)
    expect(result.amountWaived).toBe(10.0)
    expect(result.message).toContain('waived')
  })

  test('waive_fee toolSchema has required fields', () => {
    expect(waiveFee.toolSchema.name).toBe('waive_fee')
    expect(waiveFee.toolSchema.description).toBeTruthy()
    expect(waiveFee.toolSchema.inputSchema.required).toContain('readerId')
    expect(waiveFee.toolSchema.inputSchema.required).toContain('feeId')
    expect(waiveFee.toolSchema.inputSchema.required).toContain('reason')
    expect(waiveFee.toolSchema.inputSchema.required).toContain('approvedBy')
  })

  test('handle_dispute.execute returns status=open', async () => {
    const result = await handleDispute.execute({
      readerId: 'READER001',
      description: 'Book missing pages',
    })

    expect(result.success).toBe(true)
    expect(result.disputeId).toBeTruthy()
    expect(result.status).toBe('open')
    expect(result.message).toContain('Dispute filed')
  })

  test('handle_dispute with relatedBookId', async () => {
    const result = await handleDispute.execute({
      readerId: 'READER001',
      description: 'Book damaged',
      relatedBookId: 'BOOK001',
    })

    expect(result.success).toBe(true)
    expect(result.disputeId).toBeTruthy()
    expect(result.status).toBe('open')
  })

  test('handle_dispute toolSchema has required fields', () => {
    expect(handleDispute.toolSchema.name).toBe('handle_dispute')
    expect(handleDispute.toolSchema.description).toBeTruthy()
    expect(handleDispute.toolSchema.inputSchema.required).toContain('readerId')
    expect(handleDispute.toolSchema.inputSchema.required).toContain('description')
  })

  test('special_auth.execute returns authToken', async () => {
    const result = await specialAuth.execute({
      readerId: 'READER001',
      resourceId: 'RES001',
      authType: 'rare_book',
      approvedBy: 'librarian',
    })

    expect(result.success).toBe(true)
    expect(result.authToken).toBeTruthy()
    expect(result.expiresAt).toBeTruthy()
    expect(result.resourceId).toBe('RES001')
    expect(result.message).toContain('Special authorization granted')
  })

  test('special_auth with different authTypes', async () => {
    const authTypes: Array<'special_collection' | 'rare_book' | 'archive'> = [
      'special_collection',
      'rare_book',
      'archive',
    ]

    for (const authType of authTypes) {
      const result = await specialAuth.execute({
        readerId: 'READER001',
        resourceId: 'RES001',
        authType,
        approvedBy: 'librarian',
      })

      expect(result.success).toBe(true)
      expect(result.authToken).toBeTruthy()
    }
  })

  test('special_auth toolSchema has required fields', () => {
    expect(specialAuth.toolSchema.name).toBe('special_auth')
    expect(specialAuth.toolSchema.description).toBeTruthy()
    expect(specialAuth.toolSchema.inputSchema.required).toContain('readerId')
    expect(specialAuth.toolSchema.inputSchema.required).toContain('resourceId')
    expect(specialAuth.toolSchema.inputSchema.required).toContain('authType')
    expect(specialAuth.toolSchema.inputSchema.required).toContain('approvedBy')
  })
})
