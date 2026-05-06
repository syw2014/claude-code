// src/persistence/vector/schema.ts

/**
 * Milvus collection 设计与 spec §14.3.15 对应。
 * 每个行业可独立 collection，按租户分区。
 */
export function milvusCollectionName(industryCode: string): string {
  return `knowledge_${industryCode}`
}

export function milvusPartitionName(tenantId: string): string {
  return `tenant_${tenantId}`
}

/** Milvus scalar fields（查询时必须携带 tenant_id 和 industry_code 过滤） */
export const MILVUS_SCALAR_FIELDS = [
  'tenant_id',
  'industry_code',
  'source_id',
  'chunk_id',
  'access_level',
  'version',
] as const

export type MilvusScalarField = typeof MILVUS_SCALAR_FIELDS[number]
