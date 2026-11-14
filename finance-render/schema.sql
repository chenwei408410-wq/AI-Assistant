CREATE TABLE IF NOT EXISTS finance_workspace (id INTEGER PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS finance_credentials (email TEXT PRIMARY KEY, password_hash TEXT NOT NULL, changed_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS finance_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES finance_credentials(email) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS finance_session_expiry ON finance_sessions(expires_at);
CREATE TABLE IF NOT EXISTS finance_invites (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_by TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS finance_login_attempts (key_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS finance_attachments (key TEXT PRIMARY KEY, content_type TEXT NOT NULL, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS finance_auth_audit (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL);
