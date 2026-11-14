PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS support_tickets (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 issue INTEGER NOT NULL CHECK(issue BETWEEN 0 AND 4), machine TEXT NOT NULL, phone TEXT NOT NULL,
 currency TEXT NOT NULL DEFAULT 'VND' CHECK(currency IN ('VND','CNY')), data_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending_check' CHECK(status IN ('pending_check','pending_refund','refunded_unverified','verified','closed_no_refund')),
 purchase_minor INTEGER, due_minor INTEGER, refund_minor INTEGER,
 refund_method TEXT NOT NULL DEFAULT '', refund_reference TEXT NOT NULL DEFAULT '', refunded_at TEXT NOT NULL DEFAULT '', refund_operator TEXT NOT NULL DEFAULT '',
 verified_by TEXT NOT NULL DEFAULT '', verified_at TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', mutation_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS support_tickets_created ON support_tickets(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status ON support_tickets(status,created_at DESC);
CREATE TABLE IF NOT EXISTS support_attachments (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
 purpose TEXT NOT NULL CHECK(purpose IN ('payment','receiving','refund')),
 object_key TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, size INTEGER NOT NULL,
 sha256 TEXT NOT NULL, created_at TEXT NOT NULL, uploaded_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS support_attachments_ticket ON support_attachments(ticket_id);
CREATE TABLE IF NOT EXISTS support_events (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
 created_at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, details_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_events_ticket ON support_events(ticket_id,created_at);
CREATE TABLE IF NOT EXISTS support_submit_limits (
 bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS support_audit (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, details_json TEXT NOT NULL
);
