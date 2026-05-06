// src/server/http/middleware/idempotency.ts

const idempotencyCache = new Map<string, { status: number; body: unknown; createdAt: number }>()
const TTL_MS = 24 * 60 * 60 * 1000 // 24h

function cacheKey(tenantId: string, key: string): string {
  return `${tenantId}:${key}`
}

/**
 * Check if a prior response exists for this idempotency key.
 * Returns cached response or null if key is new.
 */
export function checkIdempotency(
  tenantId: string,
  idempotencyKey: string | null
): { status: number; body: unknown } | null {
  if (!idempotencyKey) return null
  const cached = idempotencyCache.get(cacheKey(tenantId, idempotencyKey))
  if (!cached) return null
  if (Date.now() - cached.createdAt > TTL_MS) {
    idempotencyCache.delete(cacheKey(tenantId, idempotencyKey))
    return null
  }
  return { status: cached.status, body: cached.body }
}

export function storeIdempotency(
  tenantId: string,
  idempotencyKey: string | null,
  status: number,
  body: unknown
): void {
  if (!idempotencyKey) return
  idempotencyCache.set(cacheKey(tenantId, idempotencyKey), {
    status,
    body,
    createdAt: Date.now(),
  })
}
