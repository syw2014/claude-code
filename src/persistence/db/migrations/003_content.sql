-- src/persistence/db/migrations/003_content.sql
-- agent_memory_items, agent_rule_versions, agent_prompt_templates,
-- agent_knowledge_sources, agent_knowledge_chunks, agent_industry_adapters

-- ─── agent_memory_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memory_items (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    user_id          TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    memory_type      TEXT        NOT NULL CHECK (memory_type IN (
                                   'preference','fact','procedure','summary')),
    scope            TEXT        NOT NULL CHECK (scope IN ('user','tenant','industry')),
    content          TEXT        NOT NULL,
    metadata         JSONB       NOT NULL DEFAULT '{}',
    source_trace_id  UUID        NULL,
    expires_at       TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_tenant_user
    ON agent_memory_items (tenant_id, user_id, industry_code, memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_trace
    ON agent_memory_items (tenant_id, source_trace_id);
CREATE INDEX IF NOT EXISTS idx_memory_metadata
    ON agent_memory_items USING GIN (metadata);

-- ─── agent_rule_versions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_rule_versions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    version          TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN ('draft','active','retired')),
    rules            JSONB       NOT NULL,
    checksum         TEXT        NOT NULL,
    published_by     TEXT        NULL,
    published_at     TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_versions_unique
    ON agent_rule_versions (tenant_id, industry_code, version);
-- 同一 (tenant_id, industry_code) 只能有一个 active 版本
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_versions_active_one
    ON agent_rule_versions (tenant_id, industry_code)
    WHERE status = 'active';

-- ─── agent_prompt_templates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_prompt_templates (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    industry_code    TEXT        NOT NULL,
    template_key     TEXT        NOT NULL,
    version          TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN ('draft','active','retired')),
    content          TEXT        NOT NULL,
    metadata         JSONB       NOT NULL DEFAULT '{}',
    checksum         TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at     TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_templates_unique
    ON agent_prompt_templates (tenant_id, industry_code, template_key, version);

-- ─── agent_knowledge_sources ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_knowledge_sources (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          TEXT        NOT NULL,
    industry_code      TEXT        NOT NULL,
    title              TEXT        NOT NULL,
    source_type        TEXT        NOT NULL CHECK (source_type IN ('file','url','manual','api')),
    uri                TEXT        NULL,
    status             TEXT        NOT NULL CHECK (status IN ('indexing','ready','failed','retired')),
    chunk_count        INTEGER     NOT NULL DEFAULT 0,
    milvus_collection  TEXT        NOT NULL,
    metadata           JSONB       NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_tenant
    ON agent_knowledge_sources (tenant_id, industry_code, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_metadata
    ON agent_knowledge_sources USING GIN (metadata);

-- ─── agent_knowledge_chunks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_knowledge_chunks (
    id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id      UUID    NOT NULL REFERENCES agent_knowledge_sources(id),
    tenant_id      TEXT    NOT NULL,
    industry_code  TEXT    NOT NULL,
    chunk_index    INTEGER NOT NULL,
    content        TEXT    NOT NULL,
    content_hash   TEXT    NOT NULL,
    embedding_id   TEXT    NOT NULL,
    metadata       JSONB   NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_chunks_source_idx
    ON agent_knowledge_chunks (source_id, chunk_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON agent_knowledge_chunks (tenant_id, embedding_id);

-- ─── agent_industry_adapters ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_industry_adapters (
    industry_code        TEXT        PRIMARY KEY,
    package_name         TEXT        NOT NULL,
    version              TEXT        NOT NULL,
    status               TEXT        NOT NULL CHECK (status IN ('active','disabled')),
    capability_manifest  JSONB       NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
