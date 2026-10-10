-- Additive ownership index; old bearer sessions remain unowned and are rejected in strict mode.
-- Apply before enabling KOSIF_TENANCY_MODE=strict.
CREATE TABLE IF NOT EXISTS engagement_ownership (
  engagement_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  owner_subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(engagement_id) REFERENCES engagements(id)
);
CREATE INDEX IF NOT EXISTS idx_engagement_ownership_company
ON engagement_ownership(company_id, workspace_id, owner_subject);
