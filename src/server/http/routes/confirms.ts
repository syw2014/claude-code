// src/server/http/routes/confirms.ts
import type { ConfirmDecisionRequest } from 'src/server/schemas/api'
import type { AuthContext } from '../middleware/auth.js'

export async function handleConfirmDecision(
  _auth: AuthContext,
  _sessionId: string,
  body: ConfirmDecisionRequest,
  requestId: string
): Promise<Response> {
  // Phase B stub: return immediately approved/rejected
  // Phase C/D: wire to HumanConfirmManager
  const nextTaskStatus = body.decision === 'approve' ? 'running' : 'rejected'
  return Response.json(
    {
      requestId,
      serverTime: new Date().toISOString(),
      data: {
        confirmId: body.confirmId,
        taskId: 'unknown', // Phase D: resolve from HumanConfirmManager
        status: body.decision === 'approve' ? 'approved' : 'rejected',
        nextTaskStatus,
      },
    },
    { status: 200 }
  )
}
