export interface QueryHoldingsInput {
  query: string
  limit?: number
}

export interface HoldingRecord {
  bookId: string
  title: string
  author: string
  available: boolean
  location: string
}

export interface QueryHoldingsOutput {
  results: HoldingRecord[]
  total: number
  query: string
}

export async function execute(input: QueryHoldingsInput): Promise<QueryHoldingsOutput> {
  // Return 2 fake books matching the query
  const results: HoldingRecord[] = [
    {
      bookId: `BOOK-${crypto.randomUUID()}`,
      title: `${input.query} - Fiction Volume 1`,
      author: 'John Doe',
      available: true,
      location: 'Section A - Shelf 3',
    },
    {
      bookId: `BOOK-${crypto.randomUUID()}`,
      title: `${input.query} - Reference Guide`,
      author: 'Jane Smith',
      available: false,
      location: 'Section B - Shelf 1',
    },
  ]

  return {
    results,
    total: 2,
    query: input.query,
  }
}

export const toolSchema = {
  name: 'query_holdings',
  description: 'Search library holdings',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (title, author, or keyword)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
      },
    },
    required: ['query'],
  },
}
