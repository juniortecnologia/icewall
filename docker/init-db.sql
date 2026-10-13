-- Initial schema for PostgreSQL multi-tenant ICEWALL SaaS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (organizações / empresas)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(32) DEFAULT 'standard' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) DEFAULT 'admin' NOT NULL,
    two_factor_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    two_factor_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- AI Servers / Clusters
CREATE TABLE IF NOT EXISTS clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(64) DEFAULT 'dgx-spark' NOT NULL, -- 'dgx-spark', 'cloud-gpu', 'local-pc'
    endpoint VARCHAR(255) NOT NULL,
    ssh_host VARCHAR(255),
    ssh_port INTEGER DEFAULT 22,
    ssh_user VARCHAR(64) DEFAULT 'junior',
    ssh_key TEXT,
    status VARCHAR(32) DEFAULT 'online' NOT NULL, -- 'online', 'offline', 'warning'
    gpu_model VARCHAR(128) DEFAULT 'NVIDIA GB10 Blackwell (Spark)',
    total_memory_gb NUMERIC DEFAULT 128,
    active_models_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Audit logs
CREATE TABLE IF NOT EXISTS saas_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    detail JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create default tenant and admin if not exists
INSERT INTO tenants (id, slug, name, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'ICEWALL Master Cloud', 'enterprise')
ON CONFLICT (slug) DO NOTHING;

-- Initial seed for local Spark Cluster
INSERT INTO clusters (id, tenant_id, name, type, endpoint, ssh_host, ssh_port, ssh_user, status, gpu_model, total_memory_gb)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'NVIDIA Spark Node #1 (Local)',
    'dgx-spark',
    'http://10.0.5.18:11434',
    '10.0.5.18',
    22,
    'facini',
    'online',
    'NVIDIA GB10 Blackwell',
    128
)
ON CONFLICT (id) DO NOTHING;
