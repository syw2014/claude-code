// src/persistence/db/__tests__/migrations.test.ts
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const migrationsDir = join(import.meta.dir, '../migrations')

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf-8')
}

describe('Migration 001_core.sql', () => {
  const sql = readMigration('001_core.sql')

  test('包含 agent_sessions 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_sessions')
    expect(sql).toContain('tenant_id')
    expect(sql).toContain('industry_code')
    expect(sql).toContain('gen_random_uuid()')
  })

  test('agent_sessions status CHECK 包含所有合法值', () => {
    expect(sql).toContain("'created','active','waiting_human'")
    expect(sql).toContain("'closing','closed','failed','expired'")
  })

  test('包含 agent_tasks 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_tasks')
    expect(sql).toContain('envelope         JSONB')
    expect(sql).toContain('idempotency_key')
  })

  test('agent_tasks 幂等键索引使用 WHERE 条件', () => {
    expect(sql).toContain('WHERE idempotency_key IS NOT NULL')
  })

  test('包含 agent_messages 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_messages')
    expect(sql).toContain("CHECK (role IN ('user','assistant','system','tool'))")
    expect(sql).toContain('sequence    BIGINT')
  })
})

describe('Migration 002_audit.sql', () => {
  const sql = readMigration('002_audit.sql')

  test('包含 agent_tool_calls 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_tool_calls')
    expect(sql).toContain("'common_tool','biz_tool','mcp_tool','workflow_tool'")
    expect(sql).toContain('duration_ms      INTEGER')
  })

  test('包含 agent_human_confirms 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_human_confirms')
    expect(sql).toContain('expires_at       TIMESTAMPTZ NOT NULL')
    expect(sql).toContain("WHERE status = 'pending'")
  })

  test('agent_audit_events 含 GIN 索引', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_audit_events')
    expect(sql).toContain('USING GIN (payload)')
    expect(sql).toContain('sequence        BIGINT      NOT NULL')
  })

  test('audit_events sequence 唯一约束存在', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_sequence')
    expect(sql).toContain('(tenant_id, trace_id, sequence)')
  })

  test('包含 agent_audit_trace_summaries 表', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_audit_trace_summaries')
    expect(sql).toContain('has_human_confirm BOOLEAN')
    expect(sql).toContain('has_high_risk    BOOLEAN')
  })
})
