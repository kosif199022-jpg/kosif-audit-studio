CREATE TABLE IF NOT EXISTS ai_byok_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_byok_sessions_expiry ON ai_byok_sessions(expires_at);
