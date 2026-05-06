-- src/persistence/db/migrations/002_audit.sql
-- agent_tool_calls, agent_human_confirms, agent_audit_events, agent_audit_trace_summaries

-- ─── agent_tool_calls ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_tool_calls (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID        NOT NULL,
    task_id          UUID        NOT NULL,
    trace_id         UUID        NOT NULL,
    tenant_id        TEXT        NOT NULL,
    tool_name        TEXT        NOT NULL,
    channel          TEXT        NOT NULL CHECK (channel IN (
                                   'common_tool','biz_tool','mcp_tool','workflow_tool')),
    permission_level TEXT        NOT NULL CHECK (permission_level IN ('low','medium','high')),
    status           TEXT        NOT NULL CHECK (status IN (
                                   'planned','permission_checking','waiting_confirm',
                                   'executing','retrying','succeeded','failed',
                                   'blocked','timeout','cancelled')),
    input            JSONB       NOT NULL,
    output           JSONB       NULL,
    error            JSONB       NULL,
    started_at       TIMESTAMPTZ NULL,
    completed_at     TIMESTAMPTZ NULL,
    duration_ms      INTEGER     NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_task
    ON agent_tool_calls (tenant_id, task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_trace
    ON agent_tool_calls (tenant_id, trace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_name
    ON agent_tool_calls (tenant_id, tool_name, created_at DESC);

-- ─── agent_human_confirms ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_human_confirms (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID        NOT NULL,
    task_id          UUID        NOT NULL,
    trace_id         UUID        NOT NULL,
    tenant_id        TEXT        NOT NULL,
    operation        TEXT        NOT NULL,
    confirm_level    TEXT        NOT NULL CHECK (confirm_level IN (
                                   'auto','silent_confirm','explicit_confirm','supervisor_approval')),
    required_role    TEXT        NOT NULL CHECK (required_role IN (
                                   'user','librarian','supervisor','admin')),
    status           TEXT        NOT NULL CHECK (status IN (
                                   'pending','escalated','approved','rejected','timeout','cancelled')),
    request_payload  JSONB       NOT NULL,
    decision         TEXT        NULL CHECK (decision IN ('approve','reject','timeout')),
    confirmed_by     TEXT        NULL,
    confirmed_role   TEXT        NULL,
    confirmed_ip     INET        NULL,
    expires_at       TIMESTAMPTZ NOT NULL,
    resolved_at      TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_confirms_session_status
    ON agent_human_confirms (tenant_id, session_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_confirms_trace
    ON agent_human_confirms (tenant_id, trace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_confirms_pending_expires
    ON agent_human_confirms (tenant_id, expires_at)
    WHERE status = 'pending';

-- ─── agent_audit_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_audit_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id        UUID        NOT NULL,
    sequence        BIGINT      NOT NULL,
    session_id      UUID        NOT NULL,
    task_id         UUID        NULL,
    tool_call_id    UUID        NULL,
    confirm_id      UUID        NULL,
    tenant_id       TEXT        NOT NULL,
    user_id         TEXT        NOT NULL,
    industry_code   TEXT        NOT NULL,
    event_type      TEXT        NOT NULL,
    severity        TEXT        NOT NULL CHECK (severity IN ('info','warn','error','security')),
    payload         JSONB       NOT NULL,
    raw_ref         JSONB       NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sequence 顺序由 AuditSequence 模块在写 Redis Stream 前用 INCR 分配，此处保证唯一性
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_sequence
    ON agent_audit_events (tenant_id, trace_id, sequence);
CREATE INDEX IF NOT EXISTS idx_audit_events_session
    ON agent_audit_events (tenant_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_type
    ON agent_audit_events (tenant_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_payload
    ON agent_audit_events USING GIN (payload);

-- ─── agent_audit_trace_summaries ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_audit_trace_summaries (
    trace_id         UUID        PRIMARY KEY,
    tenant_id        TEXT        NOT NULL,
    session_id       UUID        NOT NULL,
    root_task_id     UUID        NULL,
    user_id          TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN (
                                   'running','succeeded','failed','cancelled')),
    first_event_at   TIMESTAMPTZ NOT NULL,
    last_event_at    TIMESTAMPTZ NOT NULL,
    event_count      INTEGER     NOT NULL DEFAULT 0,
    has_human_confirm BOOLEAN    NOT NULL DEFAULT FALSE,
    has_high_risk    BOOLEAN     NOT NULL DEFAULT FALSE,
    summary          JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_trace_summaries_tenant_last
    ON agent_audit_trace_summaries (tenant_id, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_summaries_user
    ON agent_audit_trace_summaries (tenant_id, user_id, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_summaries_industry_status
    ON agent_audit_trace_summaries (tenant_id, industry_code, status);
