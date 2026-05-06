export interface WaiveFeeInput {
  readerId: string
  feeId: string
  reason: string
  approvedBy: string
}

export interface WaiveFeeOutput {
  success: boolean
  feeId: string
  amountWaived: number
  message: string
}

export async function execute(input: WaiveFeeInput): Promise<WaiveFeeOutput> {
  return {
    success: true,
    feeId: input.feeId,
    amountWaived: 10.0,
    message: `Fee ${input.feeId} for reader ${input.readerId} waived by ${input.approvedBy}. Reason: ${input.reason}`,
  }
}

export const toolSchema = {
  name: 'waive_fee',
  description: 'Waive a reader fee (requires approval)',
  inputSchema: {
    type: 'object',
    properties: {
      readerId: {
        type: 'string',
        description: 'The unique identifier of the reader',
      },
      feeId: {
        type: 'string',
        description: 'The unique identifier of the fee',
      },
      reason: {
        type: 'string',
        description: 'Reason for waiving the fee',
      },
      approvedBy: {
        type: 'string',
        description: 'Name or ID of the person approving the waiver',
      },
    },
    required: ['readerId', 'feeId', 'reason', 'approvedBy'],
  },
}
