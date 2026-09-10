PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS engagements (
  id TEXT PRIMARY KEY,
  entity_name TEXT,
  period_end TEXT,
  jurisdiction TEXT,
  framework TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT,
  document_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_engagement ON documents(engagement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_sha256 ON documents(sha256);

CREATE TABLE IF NOT EXISTS document_analyses (
  document_id TEXT PRIMARY KEY,
  model TEXT,
  response_id TEXT,
  analysis_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES documents(id)
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  value_text TEXT,
  amount_minor TEXT,
  currency TEXT,
  page INTEGER,
  confidence TEXT NOT NULL,
  assertion_name TEXT,
  account_hint TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES documents(id)
);
CREATE INDEX IF NOT EXISTS idx_claims_document ON claims(document_id);
