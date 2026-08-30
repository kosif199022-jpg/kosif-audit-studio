CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`code` text NOT NULL,
	`name_ar` text NOT NULL,
	`name_ar_norm` text NOT NULL,
	`opening_amount_minor` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`engagement_id`) REFERENCES `engagements`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounts_opening_amount_canonical" CHECK(
  typeof("accounts"."opening_amount_minor") = 'text' AND (
    "accounts"."opening_amount_minor" = '0'
    OR (substr("accounts"."opening_amount_minor", 1, 1) GLOB '[1-9]' AND "accounts"."opening_amount_minor" NOT GLOB '*[^0-9]*')
    OR (
      substr("accounts"."opening_amount_minor", 1, 1) = '-'
      AND length("accounts"."opening_amount_minor") >= 2
      AND substr("accounts"."opening_amount_minor", 2, 1) GLOB '[1-9]'
      AND substr("accounts"."opening_amount_minor", 2) NOT GLOB '*[^0-9]*'
    )
  )
)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_engagement_code_uq` ON `accounts` (`engagement_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_engagement_id_uq` ON `accounts` (`engagement_id`,`id`);--> statement-breakpoint
CREATE INDEX `accounts_tenant_engagement_idx` ON `accounts` (`tenant_id`,`engagement_id`);--> statement-breakpoint
CREATE TABLE `ai_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`fact_id` text NOT NULL,
	`relation` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `ai_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fact_id`) REFERENCES `facts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`proposal_id`) REFERENCES `ai_proposals`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`fact_id`) REFERENCES `facts`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ai_claims_span" CHECK("ai_claims"."start_offset" >= 0 AND "ai_claims"."end_offset" > "ai_claims"."start_offset")
);
--> statement-breakpoint
CREATE INDEX `ai_claims_proposal_idx` ON `ai_claims` (`proposal_id`,`start_offset`);--> statement-breakpoint
CREATE TABLE `ai_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`kind` text NOT NULL,
	`text_ar` text NOT NULL,
	`model` text NOT NULL,
	`prompt_hash` text NOT NULL,
	`validation` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ai_proposals_kind" CHECK("ai_proposals"."kind" IN ('risk_hypothesis','narrative','summary','translation')),
	CONSTRAINT "ai_proposals_validation" CHECK("ai_proposals"."validation" IN ('passed','rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_proposals_engagement_id_uq` ON `ai_proposals` (`engagement_id`,`id`);--> statement-breakpoint
CREATE TABLE `ai_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`status` text NOT NULL,
	`edited_text_ar` text,
	`reason_ar` text,
	`reviewed_by` text NOT NULL,
	`reviewed_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `ai_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`proposal_id`) REFERENCES `ai_proposals`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ai_reviews_status" CHECK("ai_reviews"."status" IN ('accepted','edited','rejected')),
	CONSTRAINT "ai_reviews_reason" CHECK("ai_reviews"."status" = 'accepted' OR length(trim("ai_reviews"."reason_ar")) >= 5)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`engagement_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`payload_json` text NOT NULL,
	`at` text NOT NULL,
	`canonical_version` text DEFAULT 'KOSIF-C14N-v1' NOT NULL,
	`prev_hash` text NOT NULL,
	`entry_hash` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_log_payload_json" CHECK(json_valid("audit_log"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_log_entry_hash_uq` ON `audit_log` (`entry_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_log_prev_hash_uq` ON `audit_log` (`engagement_id`,`prev_hash`);--> statement-breakpoint
CREATE INDEX `audit_log_engagement_seq_idx` ON `audit_log` (`engagement_id`,`seq`);--> statement-breakpoint
CREATE TABLE `calculation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`kind` text NOT NULL,
	`input_snapshot_hash` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`effective_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calculation_runs_repro_uq` ON `calculation_runs` (`engagement_id`,`kind`,`input_snapshot_hash`,`ruleset_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `calculation_runs_engagement_id_uq` ON `calculation_runs` (`engagement_id`,`id`);--> statement-breakpoint
CREATE TABLE `derivation_inputs` (
	`engagement_id` text NOT NULL,
	`derivation_id` text NOT NULL,
	`input_node_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`derivation_id`, `ordinal`),
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`derivation_id`) REFERENCES `derivations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`input_node_id`) REFERENCES `provenance_nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`derivation_id`) REFERENCES `derivations`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`input_node_id`) REFERENCES `provenance_nodes`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `derivation_input_once_uq` ON `derivation_inputs` (`derivation_id`,`input_node_id`);--> statement-breakpoint
CREATE TABLE `derivations` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`formula` text,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `calculation_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`run_id`) REFERENCES `calculation_runs`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `derivations_engagement_id_uq` ON `derivations` (`engagement_id`,`id`);--> statement-breakpoint
CREATE INDEX `derivations_run_idx` ON `derivations` (`engagement_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`client_name_ar` text NOT NULL,
	`fiscal_year` integer NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`currency` text DEFAULT 'SAR' NOT NULL,
	`framework` text NOT NULL,
	`status` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text,
	`prior_engagement_id` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`prior_engagement_id`) REFERENCES `engagements`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "engagements_framework" CHECK("engagements"."framework" IN ('IFRS','IFRS_SME')),
	CONSTRAINT "engagements_status" CHECK("engagements"."status" IN ('planning','fieldwork','review','archived')),
	CONSTRAINT "engagements_currency" CHECK(length("engagements"."currency") = 3)
);
--> statement-breakpoint
CREATE INDEX `engagements_tenant_idx` ON `engagements` (`tenant_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_tenant_id_uq` ON `engagements` (`tenant_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_ruleset_uq` ON `engagements` (`id`,`framework`,`ruleset_version`);--> statement-breakpoint
CREATE TABLE `facts` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`predicate` text NOT NULL,
	`value_int` text,
	`value_text` text,
	`unit` text NOT NULL,
	`figure_id` text,
	`produced_by` text NOT NULL,
	`producer_version` text NOT NULL,
	`input_snapshot_hash` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`figure_id`) REFERENCES `figures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`figure_id`) REFERENCES `figures`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "facts_one_value" CHECK(("facts"."value_int" IS NULL) <> ("facts"."value_text" IS NULL)),
	CONSTRAINT "facts_numeric_has_figure" CHECK("facts"."value_int" IS NULL OR "facts"."figure_id" IS NOT NULL),
	CONSTRAINT "facts_value_canonical" CHECK("facts"."value_int" IS NULL OR (
  typeof("facts"."value_int") = 'text' AND (
    "facts"."value_int" = '0'
    OR (substr("facts"."value_int", 1, 1) GLOB '[1-9]' AND "facts"."value_int" NOT GLOB '*[^0-9]*')
    OR (
      substr("facts"."value_int", 1, 1) = '-'
      AND length("facts"."value_int") >= 2
      AND substr("facts"."value_int", 2, 1) GLOB '[1-9]'
      AND substr("facts"."value_int", 2) NOT GLOB '*[^0-9]*'
    )
  )
))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facts_engagement_id_uq` ON `facts` (`engagement_id`,`id`);--> statement-breakpoint
CREATE TABLE `figures` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`run_id` text NOT NULL,
	`scope` text NOT NULL,
	`scope_key` text NOT NULL,
	`unit` text NOT NULL,
	`value_int` text NOT NULL,
	`computed_at` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`derivation_id` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `calculation_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`derivation_id`) REFERENCES `derivations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`run_id`) REFERENCES `calculation_runs`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`derivation_id`) REFERENCES `derivations`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "figures_unit" CHECK("figures"."unit" IN ('halala','count','ratio_bp','percent_bp')),
	CONSTRAINT "figures_value_canonical" CHECK(
  typeof("figures"."value_int") = 'text' AND (
    "figures"."value_int" = '0'
    OR (substr("figures"."value_int", 1, 1) GLOB '[1-9]' AND "figures"."value_int" NOT GLOB '*[^0-9]*')
    OR (
      substr("figures"."value_int", 1, 1) = '-'
      AND length("figures"."value_int") >= 2
      AND substr("figures"."value_int", 2, 1) GLOB '[1-9]'
      AND substr("figures"."value_int", 2) NOT GLOB '*[^0-9]*'
    )
  )
)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `figures_run_scope_uq` ON `figures` (`run_id`,`scope`,`scope_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `figures_engagement_id_uq` ON `figures` (`engagement_id`,`id`);--> statement-breakpoint
CREATE INDEX `figures_trace_idx` ON `figures` (`engagement_id`,`id`,`derivation_id`);--> statement-breakpoint
CREATE TABLE `finding_dispositions` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`finding_id` text NOT NULL,
	`status` text NOT NULL,
	`note_ar` text NOT NULL,
	`disposed_by` text NOT NULL,
	`disposed_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`finding_id`) REFERENCES `findings`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "finding_dispositions_status" CHECK("finding_dispositions"."status" IN ('open','explained','escalated','dismissed'))
);
--> statement-breakpoint
CREATE INDEX `finding_dispositions_finding_idx` ON `finding_dispositions` (`engagement_id`,`finding_id`,`disposed_at`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`test_run_id` text NOT NULL,
	`test_code` text NOT NULL,
	`severity` text NOT NULL,
	`entry_id` text,
	`amount_figure_id` text,
	`detail_json` text NOT NULL,
	`fingerprint` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_run_id`) REFERENCES `je_test_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`amount_figure_id`) REFERENCES `figures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`test_run_id`) REFERENCES `je_test_runs`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`entry_id`) REFERENCES `journal_entries`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`amount_figure_id`) REFERENCES `figures`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "findings_severity" CHECK("findings"."severity" IN ('info','attention','significant')),
	CONSTRAINT "findings_detail_json" CHECK(json_valid("findings"."detail_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `findings_fingerprint_uq` ON `findings` (`engagement_id`,`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `findings_engagement_id_uq` ON `findings` (`engagement_id`,`id`);--> statement-breakpoint
CREATE TABLE `fs_lines` (
	`framework` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`code` text NOT NULL,
	`statement` text NOT NULL,
	`parent_code` text,
	`label_ar` text NOT NULL,
	`normal_side` text NOT NULL,
	`sort_order` integer NOT NULL,
	PRIMARY KEY(`framework`, `ruleset_version`, `code`),
	FOREIGN KEY (`framework`,`ruleset_version`,`parent_code`) REFERENCES `fs_lines`(`framework`,`ruleset_version`,`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "fs_lines_statement" CHECK("fs_lines"."statement" IN ('BS','IS','CF','EQ')),
	CONSTRAINT "fs_lines_normal_side" CHECK("fs_lines"."normal_side" IN ('debit','credit'))
);
--> statement-breakpoint
CREATE TABLE `je_test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`test_code` text NOT NULL,
	`test_version` text NOT NULL,
	`params_hash` text NOT NULL,
	`input_snapshot_hash` text NOT NULL,
	`calendar_version` text NOT NULL,
	`effective_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `je_test_runs_repro_uq` ON `je_test_runs` (`engagement_id`,`test_code`,`test_version`,`params_hash`,`input_snapshot_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `je_test_runs_engagement_id_uq` ON `je_test_runs` (`engagement_id`,`id`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`source_file_id` text NOT NULL,
	`entry_no` text NOT NULL,
	`entry_date` text NOT NULL,
	`posted_date` text,
	`posted_by` text,
	`is_manual` integer DEFAULT false NOT NULL,
	`description_ar` text,
	`source_row` integer NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_file_id`) REFERENCES `source_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`source_file_id`) REFERENCES `source_files`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_source_row_uq` ON `journal_entries` (`source_file_id`,`source_row`);--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_engagement_id_uq` ON `journal_entries` (`engagement_id`,`id`);--> statement-breakpoint
CREATE INDEX `journal_entries_engagement_date_idx` ON `journal_entries` (`engagement_id`,`entry_date`);--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`account_id` text NOT NULL,
	`debit_minor` text DEFAULT '0' NOT NULL,
	`credit_minor` text DEFAULT '0' NOT NULL,
	`line_no` integer NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`entry_id`) REFERENCES `journal_entries`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`account_id`) REFERENCES `accounts`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journal_lines_debit_canonical" CHECK(
  typeof("journal_lines"."debit_minor") = 'text' AND (
    "journal_lines"."debit_minor" = '0'
    OR (substr("journal_lines"."debit_minor", 1, 1) GLOB '[1-9]' AND "journal_lines"."debit_minor" NOT GLOB '*[^0-9]*')
  )
),
	CONSTRAINT "journal_lines_credit_canonical" CHECK(
  typeof("journal_lines"."credit_minor") = 'text' AND (
    "journal_lines"."credit_minor" = '0'
    OR (substr("journal_lines"."credit_minor", 1, 1) GLOB '[1-9]' AND "journal_lines"."credit_minor" NOT GLOB '*[^0-9]*')
  )
),
	CONSTRAINT "journal_lines_one_side" CHECK(("journal_lines"."debit_minor" <> '0' AND "journal_lines"."credit_minor" = '0') OR ("journal_lines"."credit_minor" <> '0' AND "journal_lines"."debit_minor" = '0'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_lines_entry_line_uq` ON `journal_lines` (`entry_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `journal_lines_engagement_account_idx` ON `journal_lines` (`engagement_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `mapping_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`mapping_set_id` text NOT NULL,
	`account_id` text NOT NULL,
	`framework` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`fs_line_code` text NOT NULL,
	`method` text NOT NULL,
	`template_id` text,
	`decided_by` text NOT NULL,
	`decided_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mapping_set_id`) REFERENCES `mapping_sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`mapping_set_id`) REFERENCES `mapping_sets`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`account_id`) REFERENCES `accounts`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`framework`,`ruleset_version`,`fs_line_code`) REFERENCES `fs_lines`(`framework`,`ruleset_version`,`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`framework`,`ruleset_version`) REFERENCES `engagements`(`id`,`framework`,`ruleset_version`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mapping_rules_method" CHECK("mapping_rules"."method" IN ('manual','template','carried_forward'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_rules_set_account_uq` ON `mapping_rules` (`mapping_set_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `mapping_rules_engagement_idx` ON `mapping_rules` (`engagement_id`,`mapping_set_id`);--> statement-breakpoint
CREATE TABLE `mapping_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`input_snapshot_hash` text NOT NULL,
	`decided_by` text NOT NULL,
	`decided_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mapping_sets_status" CHECK("mapping_sets"."status" IN ('draft','confirmed','superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_sets_version_uq` ON `mapping_sets` (`engagement_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_sets_engagement_id_uq` ON `mapping_sets` (`engagement_id`,`id`);--> statement-breakpoint
CREATE TABLE `materiality_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`version` integer NOT NULL,
	`benchmark` text NOT NULL,
	`benchmark_figure_id` text NOT NULL,
	`om_rate_bp` integer NOT NULL,
	`pm_rate_bp` integer NOT NULL,
	`ctt_rate_bp` integer NOT NULL,
	`om_figure_id` text NOT NULL,
	`pm_figure_id` text NOT NULL,
	`ctt_figure_id` text NOT NULL,
	`rationale_ar` text NOT NULL,
	`set_by` text NOT NULL,
	`set_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`benchmark_figure_id`) REFERENCES `figures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`om_figure_id`) REFERENCES `figures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pm_figure_id`) REFERENCES `figures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ctt_figure_id`) REFERENCES `figures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`benchmark_figure_id`) REFERENCES `figures`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`om_figure_id`) REFERENCES `figures`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`pm_figure_id`) REFERENCES `figures`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`ctt_figure_id`) REFERENCES `figures`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "materiality_rates" CHECK("materiality_versions"."om_rate_bp" BETWEEN 1 AND 10000 AND "materiality_versions"."pm_rate_bp" BETWEEN 1 AND 10000 AND "materiality_versions"."ctt_rate_bp" BETWEEN 1 AND 10000),
	CONSTRAINT "materiality_rationale" CHECK(length(trim("materiality_versions"."rationale_ar")) >= 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `materiality_versions_uq` ON `materiality_versions` (`engagement_id`,`version`);--> statement-breakpoint
CREATE TABLE `misstatements` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`kind` text NOT NULL,
	`framework` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`fs_line_code` text NOT NULL,
	`amount_figure_id` text NOT NULL,
	`affects` text NOT NULL,
	`corrected` integer DEFAULT false NOT NULL,
	`qualitative` integer DEFAULT false NOT NULL,
	`qualitative_category` text,
	`qualitative_rationale_ar` text,
	`source_finding_id` text,
	`description_ar` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`amount_figure_id`) REFERENCES `figures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`amount_figure_id`) REFERENCES `figures`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`source_finding_id`) REFERENCES `findings`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`framework`,`ruleset_version`,`fs_line_code`) REFERENCES `fs_lines`(`framework`,`ruleset_version`,`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`framework`,`ruleset_version`) REFERENCES `engagements`(`id`,`framework`,`ruleset_version`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "misstatements_kind" CHECK("misstatements"."kind" IN ('factual','judgmental','projected')),
	CONSTRAINT "misstatements_affects" CHECK("misstatements"."affects" IN ('pl','bs','both')),
	CONSTRAINT "misstatements_qualitative_reason" CHECK("misstatements"."qualitative" = 0 OR length(trim("misstatements"."qualitative_rationale_ar")) >= 10)
);
--> statement-breakpoint
CREATE TABLE `opinion_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`version` integer NOT NULL,
	`basis` text NOT NULL,
	`is_material` integer NOT NULL,
	`is_pervasive` integer NOT NULL,
	`pervasiveness_rationale_ar` text NOT NULL,
	`inputs_json` text NOT NULL,
	`decided_at` text NOT NULL,
	`opinion_type` text GENERATED ALWAYS AS (
    CASE
      WHEN basis = 'none' OR is_material = 0 THEN 'unmodified'
      WHEN basis = 'misstatement' AND is_pervasive = 1 THEN 'adverse'
      WHEN basis = 'scope_limitation' AND is_pervasive = 1 THEN 'disclaimer'
      ELSE 'qualified'
    END
  ) STORED,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "opinion_assessments_basis" CHECK("opinion_assessments"."basis" IN ('misstatement','scope_limitation','none')),
	CONSTRAINT "opinion_assessments_json" CHECK(json_valid("opinion_assessments"."inputs_json")),
	CONSTRAINT "opinion_assessments_rationale" CHECK(length(trim("opinion_assessments"."pervasiveness_rationale_ar")) >= 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opinion_assessments_version_uq` ON `opinion_assessments` (`engagement_id`,`version`);--> statement-breakpoint
CREATE TABLE `provenance_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`unit` text NOT NULL,
	`value_int` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "provenance_nodes_unit" CHECK("provenance_nodes"."unit" IN ('halala','count','ratio_bp','percent_bp','text')),
	CONSTRAINT "provenance_nodes_value_canonical" CHECK("provenance_nodes"."value_int" IS NULL OR (
  typeof("provenance_nodes"."value_int") = 'text' AND (
    "provenance_nodes"."value_int" = '0'
    OR (substr("provenance_nodes"."value_int", 1, 1) GLOB '[1-9]' AND "provenance_nodes"."value_int" NOT GLOB '*[^0-9]*')
    OR (
      substr("provenance_nodes"."value_int", 1, 1) = '-'
      AND length("provenance_nodes"."value_int") >= 2
      AND substr("provenance_nodes"."value_int", 2, 1) GLOB '[1-9]'
      AND substr("provenance_nodes"."value_int", 2) NOT GLOB '*[^0-9]*'
    )
  )
))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provenance_nodes_engagement_id_uq` ON `provenance_nodes` (`engagement_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `provenance_nodes_entity_uq` ON `provenance_nodes` (`engagement_id`,`kind`,`entity_id`);--> statement-breakpoint
CREATE TABLE `rejected_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`source_file_id` text NOT NULL,
	`source_row` integer NOT NULL,
	`reason_code` text NOT NULL,
	`detail_json` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_file_id`) REFERENCES `source_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`source_file_id`) REFERENCES `source_files`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rejected_rows_json" CHECK(json_valid("rejected_rows"."detail_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rejected_rows_source_row_uq` ON `rejected_rows` (`source_file_id`,`source_row`);--> statement-breakpoint
CREATE TABLE `source_files` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`filename` text NOT NULL,
	`kind` text NOT NULL,
	`sha256` text NOT NULL,
	`r2_key` text NOT NULL,
	`row_count` integer NOT NULL,
	`accepted_row_count` integer NOT NULL,
	`rejected_row_count` integer NOT NULL,
	`imported_at` text NOT NULL,
	`imported_by` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`engagement_id`) REFERENCES `engagements`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "source_files_kind" CHECK("source_files"."kind" IN ('trial_balance','general_ledger','bank','zatca_xml')),
	CONSTRAINT "source_files_counts" CHECK("source_files"."row_count" = "source_files"."accepted_row_count" + "source_files"."rejected_row_count")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_files_idempotency_uq` ON `source_files` (`engagement_id`,`kind`,`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_files_engagement_id_uq` ON `source_files` (`engagement_id`,`id`);--> statement-breakpoint
CREATE INDEX `source_files_engagement_idx` ON `source_files` (`tenant_id`,`engagement_id`);--> statement-breakpoint
CREATE TABLE `tenant_members` (
	`tenant_id` text NOT NULL,
	`subject` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `subject`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tenant_members_role" CHECK("tenant_members"."role" IN ('owner','partner','manager','senior','viewer'))
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trial_balance_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`source_file_id` text NOT NULL,
	`account_id` text NOT NULL,
	`source_row` integer NOT NULL,
	`opening_debit_minor` text NOT NULL,
	`opening_credit_minor` text NOT NULL,
	`period_debit_minor` text NOT NULL,
	`period_credit_minor` text NOT NULL,
	`closing_debit_minor` text NOT NULL,
	`closing_credit_minor` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_file_id`) REFERENCES `source_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`source_file_id`) REFERENCES `source_files`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`,`account_id`) REFERENCES `accounts`(`engagement_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trial_balance_opening_debit_canonical" CHECK(
  typeof("trial_balance_lines"."opening_debit_minor") = 'text' AND (
    "trial_balance_lines"."opening_debit_minor" = '0'
    OR (substr("trial_balance_lines"."opening_debit_minor", 1, 1) GLOB '[1-9]' AND "trial_balance_lines"."opening_debit_minor" NOT GLOB '*[^0-9]*')
  )
),
	CONSTRAINT "trial_balance_opening_credit_canonical" CHECK(
  typeof("trial_balance_lines"."opening_credit_minor") = 'text' AND (
    "trial_balance_lines"."opening_credit_minor" = '0'
    OR (substr("trial_balance_lines"."opening_credit_minor", 1, 1) GLOB '[1-9]' AND "trial_balance_lines"."opening_credit_minor" NOT GLOB '*[^0-9]*')
  )
),
	CONSTRAINT "trial_balance_period_debit_canonical" CHECK(
  typeof("trial_balance_lines"."period_debit_minor") = 'text' AND (
    "trial_balance_lines"."period_debit_minor" = '0'
    OR (substr("trial_balance_lines"."period_debit_minor", 1, 1) GLOB '[1-9]' AND "trial_balance_lines"."period_debit_minor" NOT GLOB '*[^0-9]*')
  )
),
	CONSTRAINT "trial_balance_period_credit_canonical" CHECK(
  typeof("trial_balance_lines"."period_credit_minor") = 'text' AND (
    "trial_balance_lines"."period_credit_minor" = '0'
    OR (substr("trial_balance_lines"."period_credit_minor", 1, 1) GLOB '[1-9]' AND "trial_balance_lines"."period_credit_minor" NOT GLOB '*[^0-9]*')
  )
),
	CONSTRAINT "trial_balance_closing_debit_canonical" CHECK(
  typeof("trial_balance_lines"."closing_debit_minor") = 'text' AND (
    "trial_balance_lines"."closing_debit_minor" = '0'
    OR (substr("trial_balance_lines"."closing_debit_minor", 1, 1) GLOB '[1-9]' AND "trial_balance_lines"."closing_debit_minor" NOT GLOB '*[^0-9]*')
  )
),
	CONSTRAINT "trial_balance_closing_credit_canonical" CHECK(
  typeof("trial_balance_lines"."closing_credit_minor") = 'text' AND (
    "trial_balance_lines"."closing_credit_minor" = '0'
    OR (substr("trial_balance_lines"."closing_credit_minor", 1, 1) GLOB '[1-9]' AND "trial_balance_lines"."closing_credit_minor" NOT GLOB '*[^0-9]*')
  )
)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trial_balance_source_row_uq` ON `trial_balance_lines` (`source_file_id`,`source_row`);--> statement-breakpoint
CREATE INDEX `trial_balance_engagement_account_idx` ON `trial_balance_lines` (`engagement_id`,`account_id`);