CREATE TABLE `engagement_workspace_revisions` (
  `engagement_id` text NOT NULL,
  `tenant_id` text NOT NULL,
  `revision` integer NOT NULL,
  `state_json` text NOT NULL,
  `state_hash` text NOT NULL,
  `saved_by` text NOT NULL,
  `saved_at` text NOT NULL,
  PRIMARY KEY(`engagement_id`, `revision`),
  FOREIGN KEY (`tenant_id`, `engagement_id`) REFERENCES `engagements`(`tenant_id`, `id`),
  CONSTRAINT `engagement_workspace_revision_positive` CHECK (`revision` > 0),
  CONSTRAINT `engagement_workspace_state_json` CHECK (json_valid(`state_json`)),
  CONSTRAINT `engagement_workspace_state_hash` CHECK (
    length(`state_hash`) = 64 AND `state_hash` NOT GLOB '*[^0-9a-f]*'
  )
);
--> statement-breakpoint
CREATE INDEX `engagement_workspace_tenant_idx`
ON `engagement_workspace_revisions` (`tenant_id`, `engagement_id`, `revision`);
--> statement-breakpoint
CREATE TRIGGER engagement_workspace_revisions_no_update
BEFORE UPDATE ON engagement_workspace_revisions
BEGIN
  SELECT RAISE(ABORT, 'engagement_workspace_revisions_is_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_workspace_revisions_no_delete
BEFORE DELETE ON engagement_workspace_revisions
BEGIN
  SELECT RAISE(ABORT, 'engagement_workspace_revisions_is_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER engagement_workspace_revisions_archived_insert_guard
BEFORE INSERT ON engagement_workspace_revisions
WHEN EXISTS (
  SELECT 1 FROM engagements
  WHERE id = NEW.engagement_id AND archived_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'archived_engagement_is_read_only');
END;
