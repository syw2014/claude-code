export interface QueryReaderInput {
  readerId: string
}

export interface ReaderRecord {
  readerId: string
  name: string
  status: 'active' | 'suspended'
  currentLoans: number
  overdueCount: number
  feeOwed: number
}

export interface QueryReaderOutput {
  reader: ReaderRecord | null
  found: boolean
}

export async function execute(input: QueryReaderInput): Promise<QueryReaderOutput> {
  // Return a fake active reader if readerId starts with 'R', null otherwise
  if (input.readerId.startsWith('R')) {
    const reader: ReaderRecord = {
      readerId: input.readerId,
      name: `Reader ${input.readerId}`,
      status: 'active',
      currentLoans: 3,
      overdueCount: 0,
      feeOwed: 0,
    }
    return {
      reader,
      found: true,
    }
  }

  return {
    reader: null,
    found: false,
  }
}

export const toolSchema = {
  name: 'query_reader',
  description: 'Query reader information',
  inputSchema: {
    type: 'object',
    properties: {
      readerId: {
        type: 'string',
        description: 'The unique identifier of the reader',
      },
    },
    required: ['readerId'],
  },
}
