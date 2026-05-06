export interface ReserveBookInput {
  bookId: string
  readerId: string
}

export interface ReserveBookOutput {
  success: boolean
  reservationId: string
  bookId: string
  readerId: string
  position: number
  message: string
}

export async function execute(input: ReserveBookInput): Promise<ReserveBookOutput> {
  return {
    success: true,
    reservationId: crypto.randomUUID(),
    bookId: input.bookId,
    readerId: input.readerId,
    position: 1,
    message: `Book ${input.bookId} successfully reserved for reader ${input.readerId}`,
  }
}

export const toolSchema = {
  name: 'reserve_book',
  description: 'Reserve a book',
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
