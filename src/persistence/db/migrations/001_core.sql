-- src/persistence/db/migrations/001_core.sql
-- agent_sessions, agent_tasks, agent_messages

-- ─── agent_sessions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_sessions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    user_id          TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN (
                                   'created','active','waiting_human',
                                   'closing','closed','failed','expired')),
    permission_mode  TEXT        NOT NULL DEFAULT 'default',
    model_override   TEXT        NULL,
    current_trace_id UUID        NULL,
    metadata         JSONB       NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at        TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_tenant_user
    ON agent_sessions (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_tenant_industry_status
    ON agent_sessions (tenant_id, industry_code, status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_trace
    ON agent_sessions (current_trace_id);

-- ─── agent_tasks ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_tasks (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID        NOT NULL REFERENCES agent_sessions(id),
    trace_id         UUID        NOT NULL,
    tenant_id        TEXT        NOT NULL,
    user_id          TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    parent_task_id   UUID        NULL,
    input_text       TEXT        NOT NULL,
    mode             TEXT        NOT NULL CHECK (mode IN ('fast','agent','workflow','subagent')),
    status           TEXT        NOT NULL CHECK (status IN (
                                   'queued','running','waiting_confirm',
                                   'succeeded','failed','rejected','timeout','cancelled')),
    envelope         JSONB       NOT NULL DEFAULT '{}',
    idempotency_key  TEXT        NULL,
    started_at       TIMESTAMPTZ NULL,
    completed_at     TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_idempotency
    ON agent_tasks (tenant_id, session_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_session
    ON agent_tasks (tenant_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_trace
    ON agent_tasks (tenant_id, trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_status
    ON agent_tasks (tenant_id, status, created_at);

-- ─── agent_messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_messages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        NOT NULL REFERENCES agent_sessions(id),
    task_id     UUID        NULL,
    trace_id    UUID        NOT NULL,
    tenant_id   TEXT        NOT NULL,
    role        TEXT        NOT NULL CHECK (role IN ('user','assistant','system','tool')),
    content     JSONB       NOT NULL,
    sequence    BIGINT      NOT NULL,
    token_count INTEGER     NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_messages_sequence
    ON agent_messages (tenant_id, session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_agent_messages_task
    ON agent_messages (tenant_id, task_id, sequence);
CREATE INDEX IF NOT EXISTS idx_agent_messages_trace
    ON agent_messages (tenant_id, trace_id, sequence);
