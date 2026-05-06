export interface RenewBookInput {
  bookId: string
  readerId: string
  extendDays?: number
}

export interface RenewBookOutput {
  success: boolean
  bookId: string
  newDueDate: string
  renewCount: number
  message: string
}

export async function execute(input: RenewBookInput): Promise<RenewBookOutput> {
  const extendDays = input.extendDays ?? 30
  const newDueDate = (() => {
    const now = new Date()
    now.setDate(now.getDate() + extendDays)
    return now.toISOString().split('T')[0]
  })()

  return {
    success: true,
    bookId: input.bookId,
    newDueDate,
    renewCount: 1,
    message: `Book ${input.bookId} successfully renewed for reader ${input.readerId}`,
  }
}

export const toolSchema = {
  name: 'renew_book',
  description: 'Renew a book loan',
  inputSchema: {
    type: 'object',
    properties: {
      bookId: {
        type: 'string',
        description: 'The unique identifier of the book',
      },
      readerId: {
        type: 'string',
        description: 'The unique identifier of the reader',
      },
      extendDays: {
        type: 'number',
        description: 'Number of days to extend (defaults to 30)',
      },
    },
    required: ['bookId', 'readerId'],
  },
}
