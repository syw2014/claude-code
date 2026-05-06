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
