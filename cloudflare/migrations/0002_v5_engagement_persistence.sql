CREATE TABLE IF NOT EXISTS engagement_sessions (
  engagement_id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL,
  state_json TEXT,
  state_hash TEXT,
  state_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(engagement_id) REFERENCES engagements(id)
);

CREATE TABLE IF NOT EXISTS engagement_events (
  engagement_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  payload_hash TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (engagement_id, sequence),
  FOREIGN KEY(engagement_id) REFERENCES engagements(id)
);
CREATE INDEX IF NOT EXISTS idx_engagement_events_created ON engagement_events(engagement_id, created_at DESC);
