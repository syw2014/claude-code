// src/persistence/redis/keys.ts

/**
 * 类型安全的 Redis key 构建器。
 * 所有 key 格式与 spec §14.3.14 保持一致。
 */

/** session:{tenantId}:{sessionId} — SessionState 热状态，TTL 会话结束后 24h */
export const sessionKey = (tenantId: string, sessionId: string): string =>
  `session:${tenantId}:${sessionId}`

/** task:{tenantId}:{taskId} — TaskRun 热状态 + suspendPoint，TTL 完成后 24h */
export const taskKey = (tenantId: string, taskId: string): string =>
  `task:${tenantId}:${taskId}`

/** sse:{tenantId}:{sessionId} — SSE 连接索引 set，TTL 连接存活 */
export const sseKey = (tenantId: string, sessionId: string): string =>
  `sse:${tenantId}:${sessionId}`

/** audit_stream:{tenantId} — 审计写入缓冲 stream，按容量裁剪 */
export const auditStreamKey = (tenantId: string): string =>
  `audit_stream:${tenantId}`

/** rule:{tenantId}:{industryCode}:active — 当前规则版本，无固定 TTL */
export const ruleActiveKey = (tenantId: string, industryCode: string): string =>
  `rule:${tenantId}:${industryCode}:active`

/** idem:{tenantId}:{idempotencyKey} — API 幂等结果，TTL 24h */
export const idempotencyKey = (tenantId: string, key: string): string =>
  `idem:${tenantId}:${key}`

/** memory:short:{tenantId}:{sessionId} — 短期记忆，TTL 会话结束 */
export const shortMemoryKey = (tenantId: string, sessionId: string): string =>
  `memory:short:${tenantId}:${sessionId}`

/** task_resume_queue:{tenantId} — 跨节点 HITL 恢复消息队列 stream，TTL 消费后 24h */
export const taskResumeQueueKey = (tenantId: string): string =>
  `task_resume_queue:${tenantId}`

/** audit_seq:{tenantId}:{traceId} — trace 内 sequence 原子计数器，TTL trace 结束后 24h */
export const auditSeqKey = (tenantId: string, traceId: string): string =>
  `audit_seq:${tenantId}:${traceId}`
