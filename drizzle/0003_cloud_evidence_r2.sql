CREATE TABLE `evidence_objects` (
  `id` text PRIMARY KEY NOT NULL,
  `logical_id` text NOT NULL,
  `engagement_id` text NOT NULL,
  `tenant_id` text NOT NULL,
  `revision` integer NOT NULL,
  `document_ref` text NOT NULL,
  `round_id` text,
  `kind` text NOT NULL,
  `title_ar` text NOT NULL,
  `filename` text NOT NULL,
  `content_type` text NOT NULL,
  `byte_length` integer NOT NULL,
  `sha256` text NOT NULL,
  `r2_key` text NOT NULL,
  `supersedes_id` text,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE(`engagement_id`, `id`),
  UNIQUE(`engagement_id`, `logical_id`, `revision`),
  UNIQUE(`r2_key`),
  FOREIGN KEY (`tenant_id`, `engagement_id`) REFERENCES `engagements`(`tenant_id`, `id`),
  FOREIGN KEY (`engagement_id`, `supersedes_id`) REFERENCES `evidence_objects`(`engagement_id`, `id`),
  CONSTRAINT `evidence_revision_positive` CHECK (`revision` > 0),
  CONSTRAINT `evidence_byte_length_positive` CHECK (`byte_length` > 0 AND `byte_length` <= 10485760),
  CONSTRAINT `evidence_sha256` CHECK (length(`sha256`) = 64 AND `sha256` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `evidence_kind` CHECK (`kind` IN ('confirmation','contract','invoice','bank_statement','legal_response','workpaper','other')),
  CONSTRAINT `evidence_content_type` CHECK (`content_type` IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg'
  ))
);
--> statement-breakpoint
CREATE INDEX `evidence_objects_tenant_engagement_idx`
ON `evidence_objects` (`tenant_id`, `engagement_id`, `logical_id`, `revision`);
--> statement-breakpoint
CREATE INDEX `evidence_objects_round_idx`
ON `evidence_objects` (`tenant_id`, `engagement_id`, `round_id`);
--> statement-breakpoint
CREATE TRIGGER evidence_objects_no_update
BEFORE UPDATE ON evidence_objects
BEGIN
  SELECT RAISE(ABORT, 'evidence_objects_is_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER evidence_objects_no_delete
BEFORE DELETE ON evidence_objects
BEGIN
  SELECT RAISE(ABORT, 'evidence_objects_is_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER evidence_objects_archived_insert_guard
BEFORE INSERT ON evidence_objects
WHEN EXISTS (
  SELECT 1 FROM engagements
  WHERE id = NEW.engagement_id AND tenant_id = NEW.tenant_id AND archived_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'archived_engagement_is_read_only');
END;
--> statement-breakpoint
CREATE TRIGGER evidence_revision_lineage_guard
BEFORE INSERT ON evidence_objects
WHEN (
  (NEW.revision = 1 AND NEW.supersedes_id IS NOT NULL)
  OR
  (NEW.revision > 1 AND NOT EXISTS (
    SELECT 1
    FROM evidence_objects AS parent
    WHERE parent.id = NEW.supersedes_id
      AND parent.engagement_id = NEW.engagement_id
      AND parent.tenant_id = NEW.tenant_id
      AND parent.logical_id = NEW.logical_id
      AND parent.revision = NEW.revision - 1
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'evidence_revision_lineage_invalid');
END;