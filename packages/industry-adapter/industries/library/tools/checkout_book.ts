export interface CheckoutBookInput {
  bookId: string
  readerId: string
  dueDate?: string // ISO date, defaults to 30 days from now
}

export interface CheckoutBookOutput {
  success: boolean
  checkoutId: string
  bookId: string
  readerId: string
  dueDate: string
  message: string
}

export async function execute(input: CheckoutBookInput): Promise<CheckoutBookOutput> {
  // Calculate default due date (30 days from now) if not provided
  const dueDate = input.dueDate ?? (() => {
    const now = new Date()
    now.setDate(now.getDate() + 30)
    return now.toISOString().split('T')[0]
  })()

  return {
    success: true,
    checkoutId: crypto.randomUUID(),
    bookId: input.bookId,
    readerId: input.readerId,
    dueDate,
    message: `Book ${input.bookId} successfully checked out to reader ${input.readerId}`,
  }
}

export const toolSchema = {
  name: 'checkout_book',
  description: 'Checkout a book for a reader',
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
      dueDate: {
        type: 'string',
        description: 'ISO date for the due date (defaults to 30 days from now)',
      },
    },
    required: ['bookId', 'readerId'],
  },
}
