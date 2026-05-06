export interface ReturnBookInput {
  bookId: string
  readerId: string
}

export interface ReturnBookOutput {
  success: boolean
  bookId: string
  returnedAt: string
  lateFee?: number
  message: string
}

export async function execute(input: ReturnBookInput): Promise<ReturnBookOutput> {
  const returnedAt = new Date().toISOString()

  return {
    success: true,
    bookId: input.bookId,
    returnedAt,
    lateFee: 0,
    message: `Book ${input.bookId} successfully returned by reader ${input.readerId}`,
  }
}

export const toolSchema = {
  name: 'return_book',
  description: 'Return a borrowed book',
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
    },
    required: ['bookId', 'readerId'],
  },
}
