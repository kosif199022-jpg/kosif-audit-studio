import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Monetary values are canonical signed decimal strings. D1's JavaScript
// transport does not guarantee lossless 64-bit INTEGER delivery, so every
// amount crosses the Worker boundary as text and is converted to bigint.

const canonicalSignedInteger = (column: ReturnType<typeof text>) => sql`
  typeof(${column}) = 'text' AND (
    ${column} = '0'
    OR (substr(${column}, 1, 1) GLOB '[1-9]' AND ${column} NOT GLOB '*[^0-9]*')
    OR (
      substr(${column}, 1, 1) = '-'
      AND length(${column}) >= 2
      AND substr(${column}, 2, 1) GLOB '[1-9]'
      AND substr(${column}, 2) NOT GLOB '*[^0-9]*'
    )
  )
`;

const canonicalUnsignedInteger = (column: ReturnType<typeof text>) => sql`
  typeof(${column}) = 'text' AND (
    ${column} = '0'
    OR (substr(${column}, 1, 1) GLOB '[1-9]' AND ${column} NOT GLOB '*[^0-9]*')
  )
`;

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const tenantMembers = sqliteTable("tenant_members", {
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  subject: text("subject").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.subject] }),
  check("tenant_members_role", sql`${table.role} IN ('owner','partner','manager','senior','viewer')`),
]);

export const engagements = sqliteTable("engagements", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  clientNameAr: text("client_name_ar").notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  currency: text("currency").notNull().default("SAR"),
  framework: text("framework").notNull(),
  status: text("status").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  archivedAt: text("archived_at"),
  priorEngagementId: text("prior_engagement_id"),
}, (table) => [
  index("engagements_tenant_idx").on(table.tenantId, table.status),
  uniqueIndex("engagements_tenant_id_uq").on(table.tenantId, table.id),
  uniqueIndex("engagements_ruleset_uq").on(table.id, table.framework, table.rulesetVersion),
  foreignKey({
    columns: [table.tenantId, table.priorEngagementId],
    foreignColumns: [table.tenantId, table.id],
    name: "engagements_tenant_prior_engagement_fk",
  }),
  check("engagements_framework", sql`${table.framework} IN ('IFRS','IFRS_SME')`),
  check("engagements_status", sql`${table.status} IN ('planning','fieldwork','review','archived')`),
  check("engagements_currency", sql`length(${table.currency}) = 3`),
]);

export const sourceFiles = sqliteTable("source_files", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  filename: text("filename").notNull(),
  kind: text("kind").notNull(),
  sha256: text("sha256").notNull(),
  r2Key: text("r2_key").notNull(),
  rowCount: integer("row_count").notNull(),
  acceptedRowCount: integer("accepted_row_count").notNull(),
  rejectedRowCount: integer("rejected_row_count").notNull(),
  importedAt: text("imported_at").notNull(),
  importedBy: text("imported_by").notNull(),
}, (table) => [
  uniqueIndex("source_files_idempotency_uq").on(table.engagementId, table.kind, table.sha256),
  uniqueIndex("source_files_engagement_id_uq").on(table.engagementId, table.id),
  index("source_files_engagement_idx").on(table.tenantId, table.engagementId),
  foreignKey({
    columns: [table.tenantId, table.engagementId],
    foreignColumns: [engagements.tenantId, engagements.id],
    name: "source_files_tenant_engagement_fk",
  }),
  check("source_files_kind", sql`${table.kind} IN ('trial_balance','general_ledger','bank','zatca_xml')`),
  check("source_files_counts", sql`${table.rowCount} = ${table.acceptedRowCount} + ${table.rejectedRowCount}`),
]);

export const rejectedRows = sqliteTable("rejected_rows", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  sourceFileId: text("source_file_id").notNull().references(() => sourceFiles.id),
  sourceRow: integer("source_row").notNull(),
  reasonCode: text("reason_code").notNull(),
  detailJson: text("detail_json").notNull(),
}, (table) => [
  uniqueIndex("rejected_rows_source_row_uq").on(table.sourceFileId, table.sourceRow),
  foreignKey({
    columns: [table.engagementId, table.sourceFileId],
    foreignColumns: [sourceFiles.engagementId, sourceFiles.id],
    name: "rejected_rows_engagement_source_fk",
  }),
  check("rejected_rows_json", sql`json_valid(${table.detailJson})`),
]);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  code: text("code").notNull(),
  nameAr: text("name_ar").notNull(),
  nameArNorm: text("name_ar_norm").notNull(),
  openingAmountMinor: text("opening_amount_minor").notNull(),
}, (table) => [
  uniqueIndex("accounts_engagement_code_uq").on(table.engagementId, table.code),
  uniqueIndex("accounts_engagement_id_uq").on(table.engagementId, table.id),
  index("accounts_tenant_engagement_idx").on(table.tenantId, table.engagementId),
  foreignKey({
    columns: [table.tenantId, table.engagementId],
    foreignColumns: [engagements.tenantId, engagements.id],
    name: "accounts_tenant_engagement_fk",
  }),
  check("accounts_opening_amount_canonical", canonicalSignedInteger(table.openingAmountMinor)),
]);

export const trialBalanceLines = sqliteTable("trial_balance_lines", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  sourceFileId: text("source_file_id").notNull().references(() => sourceFiles.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  sourceRow: integer("source_row").notNull(),
  openingDebitMinor: text("opening_debit_minor").notNull(),
  openingCreditMinor: text("opening_credit_minor").notNull(),
  periodDebitMinor: text("period_debit_minor").notNull(),
  periodCreditMinor: text("period_credit_minor").notNull(),
  closingDebitMinor: text("closing_debit_minor").notNull(),
  closingCreditMinor: text("closing_credit_minor").notNull(),
}, (table) => [
  uniqueIndex("trial_balance_source_row_uq").on(table.sourceFileId, table.sourceRow),
  index("trial_balance_engagement_account_idx").on(table.engagementId, table.accountId),
  foreignKey({
    columns: [table.engagementId, table.sourceFileId],
    foreignColumns: [sourceFiles.engagementId, sourceFiles.id],
    name: "trial_balance_engagement_source_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.accountId],
    foreignColumns: [accounts.engagementId, accounts.id],
    name: "trial_balance_engagement_account_fk",
  }),
  check("trial_balance_opening_debit_canonical", canonicalUnsignedInteger(table.openingDebitMinor)),
  check("trial_balance_opening_credit_canonical", canonicalUnsignedInteger(table.openingCreditMinor)),
  check("trial_balance_period_debit_canonical", canonicalUnsignedInteger(table.periodDebitMinor)),
  check("trial_balance_period_credit_canonical", canonicalUnsignedInteger(table.periodCreditMinor)),
  check("trial_balance_closing_debit_canonical", canonicalUnsignedInteger(table.closingDebitMinor)),
  check("trial_balance_closing_credit_canonical", canonicalUnsignedInteger(table.closingCreditMinor)),
]);

export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  sourceFileId: text("source_file_id").notNull().references(() => sourceFiles.id),
  entryNo: text("entry_no").notNull(),
  entryDate: text("entry_date").notNull(),
  postedDate: text("posted_date"),
  postedBy: text("posted_by"),
  isManual: integer("is_manual", { mode: "boolean" }).notNull().default(false),
  descriptionAr: text("description_ar"),
  sourceRow: integer("source_row").notNull(),
}, (table) => [
  uniqueIndex("journal_entries_source_row_uq").on(table.sourceFileId, table.sourceRow),
  uniqueIndex("journal_entries_engagement_id_uq").on(table.engagementId, table.id),
  index("journal_entries_engagement_date_idx").on(table.engagementId, table.entryDate),
  foreignKey({
    columns: [table.engagementId, table.sourceFileId],
    foreignColumns: [sourceFiles.engagementId, sourceFiles.id],
    name: "journal_entries_engagement_source_fk",
  }),
]);

export const journalLines = sqliteTable("journal_lines", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  entryId: text("entry_id").notNull().references(() => journalEntries.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  debitMinor: text("debit_minor").notNull().default("0"),
  creditMinor: text("credit_minor").notNull().default("0"),
  lineNo: integer("line_no").notNull(),
}, (table) => [
  uniqueIndex("journal_lines_entry_line_uq").on(table.entryId, table.lineNo),
  index("journal_lines_engagement_account_idx").on(table.engagementId, table.accountId),
  foreignKey({
    columns: [table.engagementId, table.entryId],
    foreignColumns: [journalEntries.engagementId, journalEntries.id],
    name: "journal_lines_engagement_entry_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.accountId],
    foreignColumns: [accounts.engagementId, accounts.id],
    name: "journal_lines_engagement_account_fk",
  }),
  check("journal_lines_debit_canonical", canonicalUnsignedInteger(table.debitMinor)),
  check("journal_lines_credit_canonical", canonicalUnsignedInteger(table.creditMinor)),
  check("journal_lines_one_side", sql`(${table.debitMinor} <> '0' AND ${table.creditMinor} = '0') OR (${table.creditMinor} <> '0' AND ${table.debitMinor} = '0')`),
]);

export const fsLines = sqliteTable("fs_lines", {
  framework: text("framework").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  code: text("code").notNull(),
  statement: text("statement").notNull(),
  parentCode: text("parent_code"),
  labelAr: text("label_ar").notNull(),
  normalSide: text("normal_side").notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [
  primaryKey({ columns: [table.framework, table.rulesetVersion, table.code] }),
  foreignKey({
    columns: [table.framework, table.rulesetVersion, table.parentCode],
    foreignColumns: [table.framework, table.rulesetVersion, table.code],
    name: "fs_lines_versioned_parent_fk",
  }),
  check("fs_lines_statement", sql`${table.statement} IN ('BS','IS','CF','EQ')`),
  check("fs_lines_normal_side", sql`${table.normalSide} IN ('debit','credit')`),
]);

export const mappingSets = sqliteTable("mapping_sets", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  version: integer("version").notNull(),
  status: text("status").notNull(),
  inputSnapshotHash: text("input_snapshot_hash").notNull(),
  decidedBy: text("decided_by").notNull(),
  decidedAt: text("decided_at").notNull(),
}, (table) => [
  uniqueIndex("mapping_sets_version_uq").on(table.engagementId, table.version),
  uniqueIndex("mapping_sets_engagement_id_uq").on(table.engagementId, table.id),
  check("mapping_sets_status", sql`${table.status} IN ('draft','confirmed','superseded')`),
]);

export const mappingRules = sqliteTable("mapping_rules", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  mappingSetId: text("mapping_set_id").notNull().references(() => mappingSets.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  framework: text("framework").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  fsLineCode: text("fs_line_code").notNull(),
  method: text("method").notNull(),
  templateId: text("template_id"),
  decidedBy: text("decided_by").notNull(),
  decidedAt: text("decided_at").notNull(),
}, (table) => [
  uniqueIndex("mapping_rules_set_account_uq").on(table.mappingSetId, table.accountId),
  index("mapping_rules_engagement_idx").on(table.engagementId, table.mappingSetId),
  foreignKey({
    columns: [table.engagementId, table.mappingSetId],
    foreignColumns: [mappingSets.engagementId, mappingSets.id],
    name: "mapping_rules_engagement_set_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.accountId],
    foreignColumns: [accounts.engagementId, accounts.id],
    name: "mapping_rules_engagement_account_fk",
  }),
  foreignKey({
    columns: [table.framework, table.rulesetVersion, table.fsLineCode],
    foreignColumns: [fsLines.framework, fsLines.rulesetVersion, fsLines.code],
    name: "mapping_rules_fs_line_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.framework, table.rulesetVersion],
    foreignColumns: [engagements.id, engagements.framework, engagements.rulesetVersion],
    name: "mapping_rules_engagement_ruleset_fk",
  }),
  check("mapping_rules_method", sql`${table.method} IN ('manual','template','carried_forward')`),
]);

export const calculationRuns = sqliteTable("calculation_runs", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  kind: text("kind").notNull(),
  inputSnapshotHash: text("input_snapshot_hash").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  effectiveAt: text("effective_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("calculation_runs_repro_uq").on(table.engagementId, table.kind, table.inputSnapshotHash, table.rulesetVersion),
  uniqueIndex("calculation_runs_engagement_id_uq").on(table.engagementId, table.id),
]);

export const derivations = sqliteTable("derivations", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  runId: text("run_id").notNull().references(() => calculationRuns.id),
  kind: text("kind").notNull(),
  formula: text("formula"),
}, (table) => [
  uniqueIndex("derivations_engagement_id_uq").on(table.engagementId, table.id),
  index("derivations_run_idx").on(table.engagementId, table.runId),
  foreignKey({
    columns: [table.engagementId, table.runId],
    foreignColumns: [calculationRuns.engagementId, calculationRuns.id],
    name: "derivations_engagement_run_fk",
  }),
]);

export const provenanceNodes = sqliteTable("provenance_nodes", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  kind: text("kind").notNull(),
  entityId: text("entity_id").notNull(),
  unit: text("unit").notNull(),
  valueInt: text("value_int"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("provenance_nodes_engagement_id_uq").on(table.engagementId, table.id),
  uniqueIndex("provenance_nodes_entity_uq").on(table.engagementId, table.kind, table.entityId),
  check("provenance_nodes_unit", sql`${table.unit} IN ('halala','count','ratio_bp','percent_bp','text')`),
  check("provenance_nodes_value_canonical", sql`${table.valueInt} IS NULL OR (${canonicalSignedInteger(table.valueInt)})`),
]);

export const derivationInputs = sqliteTable("derivation_inputs", {
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  derivationId: text("derivation_id").notNull().references(() => derivations.id),
  inputNodeId: text("input_node_id").notNull().references(() => provenanceNodes.id),
  ordinal: integer("ordinal").notNull(),
}, (table) => [
  primaryKey({ columns: [table.derivationId, table.ordinal] }),
  uniqueIndex("derivation_input_once_uq").on(table.derivationId, table.inputNodeId),
  foreignKey({
    columns: [table.engagementId, table.derivationId],
    foreignColumns: [derivations.engagementId, derivations.id],
    name: "derivation_inputs_engagement_derivation_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.inputNodeId],
    foreignColumns: [provenanceNodes.engagementId, provenanceNodes.id],
    name: "derivation_inputs_engagement_node_fk",
  }),
]);

export const figures = sqliteTable("figures", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  runId: text("run_id").notNull().references(() => calculationRuns.id),
  scope: text("scope").notNull(),
  scopeKey: text("scope_key").notNull(),
  unit: text("unit").notNull(),
  valueInt: text("value_int").notNull(),
  computedAt: text("computed_at").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  derivationId: text("derivation_id").notNull().references(() => derivations.id),
}, (table) => [
  uniqueIndex("figures_run_scope_uq").on(table.runId, table.scope, table.scopeKey),
  uniqueIndex("figures_engagement_id_uq").on(table.engagementId, table.id),
  index("figures_trace_idx").on(table.engagementId, table.id, table.derivationId),
  foreignKey({
    columns: [table.engagementId, table.runId],
    foreignColumns: [calculationRuns.engagementId, calculationRuns.id],
    name: "figures_engagement_run_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.derivationId],
    foreignColumns: [derivations.engagementId, derivations.id],
    name: "figures_engagement_derivation_fk",
  }),
  check("figures_unit", sql`${table.unit} IN ('halala','count','ratio_bp','percent_bp')`),
  check("figures_value_canonical", canonicalSignedInteger(table.valueInt)),
]);

export const facts = sqliteTable("facts", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  predicate: text("predicate").notNull(),
  valueInt: text("value_int"),
  valueText: text("value_text"),
  unit: text("unit").notNull(),
  figureId: text("figure_id").references(() => figures.id),
  producedBy: text("produced_by").notNull(),
  producerVersion: text("producer_version").notNull(),
  inputSnapshotHash: text("input_snapshot_hash").notNull(),
}, (table) => [
  uniqueIndex("facts_engagement_id_uq").on(table.engagementId, table.id),
  foreignKey({
    columns: [table.engagementId, table.figureId],
    foreignColumns: [figures.engagementId, figures.id],
    name: "facts_engagement_figure_fk",
  }),
  check("facts_one_value", sql`(${table.valueInt} IS NULL) <> (${table.valueText} IS NULL)`),
  check("facts_numeric_has_figure", sql`${table.valueInt} IS NULL OR ${table.figureId} IS NOT NULL`),
  check("facts_value_canonical", sql`${table.valueInt} IS NULL OR (${canonicalSignedInteger(table.valueInt)})`),
]);

export const jeTestRuns = sqliteTable("je_test_runs", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  testCode: text("test_code").notNull(),
  testVersion: text("test_version").notNull(),
  paramsHash: text("params_hash").notNull(),
  inputSnapshotHash: text("input_snapshot_hash").notNull(),
  calendarVersion: text("calendar_version").notNull(),
  effectiveAt: text("effective_at").notNull(),
}, (table) => [
  uniqueIndex("je_test_runs_repro_uq").on(table.engagementId, table.testCode, table.testVersion, table.paramsHash, table.inputSnapshotHash),
  uniqueIndex("je_test_runs_engagement_id_uq").on(table.engagementId, table.id),
]);

export const findings = sqliteTable("findings", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  testRunId: text("test_run_id").notNull().references(() => jeTestRuns.id),
  testCode: text("test_code").notNull(),
  severity: text("severity").notNull(),
  entryId: text("entry_id").references(() => journalEntries.id),
  amountFigureId: text("amount_figure_id").references(() => figures.id),
  detailJson: text("detail_json").notNull(),
  fingerprint: text("fingerprint").notNull(),
}, (table) => [
  uniqueIndex("findings_fingerprint_uq").on(table.engagementId, table.fingerprint),
  uniqueIndex("findings_engagement_id_uq").on(table.engagementId, table.id),
  foreignKey({
    columns: [table.engagementId, table.testRunId],
    foreignColumns: [jeTestRuns.engagementId, jeTestRuns.id],
    name: "findings_engagement_test_run_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.entryId],
    foreignColumns: [journalEntries.engagementId, journalEntries.id],
    name: "findings_engagement_entry_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.amountFigureId],
    foreignColumns: [figures.engagementId, figures.id],
    name: "findings_engagement_figure_fk",
  }),
  check("findings_severity", sql`${table.severity} IN ('info','attention','significant')`),
  check("findings_detail_json", sql`json_valid(${table.detailJson})`),
]);

export const findingDispositions = sqliteTable("finding_dispositions", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  findingId: text("finding_id").notNull().references(() => findings.id),
  status: text("status").notNull(),
  noteAr: text("note_ar").notNull(),
  disposedBy: text("disposed_by").notNull(),
  disposedAt: text("disposed_at").notNull(),
}, (table) => [
  index("finding_dispositions_finding_idx").on(table.engagementId, table.findingId, table.disposedAt),
  foreignKey({
    columns: [table.engagementId, table.findingId],
    foreignColumns: [findings.engagementId, findings.id],
    name: "finding_dispositions_engagement_finding_fk",
  }),
  check("finding_dispositions_status", sql`${table.status} IN ('open','explained','escalated','dismissed')`),
]);

export const materialityVersions = sqliteTable("materiality_versions", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  version: integer("version").notNull(),
  benchmark: text("benchmark").notNull(),
  benchmarkFigureId: text("benchmark_figure_id").notNull().references(() => figures.id),
  omRateBp: integer("om_rate_bp").notNull(),
  pmRateBp: integer("pm_rate_bp").notNull(),
  cttRateBp: integer("ctt_rate_bp").notNull(),
  omFigureId: text("om_figure_id").notNull().references(() => figures.id),
  pmFigureId: text("pm_figure_id").notNull().references(() => figures.id),
  cttFigureId: text("ctt_figure_id").notNull().references(() => figures.id),
  rationaleAr: text("rationale_ar").notNull(),
  setBy: text("set_by").notNull(),
  setAt: text("set_at").notNull(),
}, (table) => [
  uniqueIndex("materiality_versions_uq").on(table.engagementId, table.version),
  foreignKey({
    columns: [table.engagementId, table.benchmarkFigureId],
    foreignColumns: [figures.engagementId, figures.id],
    name: "materiality_engagement_benchmark_figure_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.omFigureId],
    foreignColumns: [figures.engagementId, figures.id],
    name: "materiality_engagement_om_figure_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.pmFigureId],
    foreignColumns: [figures.engagementId, figures.id],
    name: "materiality_engagement_pm_figure_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.cttFigureId],
    foreignColumns: [figures.engagementId, figures.id],
    name: "materiality_engagement_ctt_figure_fk",
  }),
  check("materiality_rates", sql`${table.omRateBp} BETWEEN 1 AND 10000 AND ${table.pmRateBp} BETWEEN 1 AND 10000 AND ${table.cttRateBp} BETWEEN 1 AND 10000`),
  check("materiality_rationale", sql`length(trim(${table.rationaleAr})) >= 10`),
]);

export const misstatements = sqliteTable("misstatements", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  kind: text("kind").notNull(),
  framework: text("framework").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  fsLineCode: text("fs_line_code").notNull(),
  amountFigureId: text("amount_figure_id").notNull().references(() => figures.id),
  affects: text("affects").notNull(),
  corrected: integer("corrected", { mode: "boolean" }).notNull().default(false),
  qualitative: integer("qualitative", { mode: "boolean" }).notNull().default(false),
  qualitativeCategory: text("qualitative_category"),
  qualitativeRationaleAr: text("qualitative_rationale_ar"),
  sourceFindingId: text("source_finding_id").references(() => findings.id),
  descriptionAr: text("description_ar").notNull(),
  recordedAt: text("recorded_at").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.engagementId, table.amountFigureId],
    foreignColumns: [figures.engagementId, figures.id],
    name: "misstatements_engagement_figure_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.sourceFindingId],
    foreignColumns: [findings.engagementId, findings.id],
    name: "misstatements_engagement_finding_fk",
  }),
  foreignKey({
    columns: [table.framework, table.rulesetVersion, table.fsLineCode],
    foreignColumns: [fsLines.framework, fsLines.rulesetVersion, fsLines.code],
    name: "misstatements_fs_line_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.framework, table.rulesetVersion],
    foreignColumns: [engagements.id, engagements.framework, engagements.rulesetVersion],
    name: "misstatements_engagement_ruleset_fk",
  }),
  check("misstatements_kind", sql`${table.kind} IN ('factual','judgmental','projected')`),
  check("misstatements_affects", sql`${table.affects} IN ('pl','bs','both')`),
  check("misstatements_qualitative_reason", sql`${table.qualitative} = 0 OR length(trim(${table.qualitativeRationaleAr})) >= 10`),
]);

export const opinionAssessments = sqliteTable("opinion_assessments", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  version: integer("version").notNull(),
  basis: text("basis").notNull(),
  isMaterial: integer("is_material", { mode: "boolean" }).notNull(),
  isPervasive: integer("is_pervasive", { mode: "boolean" }).notNull(),
  pervasivenessRationaleAr: text("pervasiveness_rationale_ar").notNull(),
  inputsJson: text("inputs_json").notNull(),
  decidedAt: text("decided_at").notNull(),
  opinionType: text("opinion_type").generatedAlwaysAs(sql`
    CASE
      WHEN basis = 'none' OR is_material = 0 THEN 'unmodified'
      WHEN basis = 'misstatement' AND is_pervasive = 1 THEN 'adverse'
      WHEN basis = 'scope_limitation' AND is_pervasive = 1 THEN 'disclaimer'
      ELSE 'qualified'
    END
  `, { mode: "stored" }),
}, (table) => [
  uniqueIndex("opinion_assessments_version_uq").on(table.engagementId, table.version),
  check("opinion_assessments_basis", sql`${table.basis} IN ('misstatement','scope_limitation','none')`),
  check("opinion_assessments_json", sql`json_valid(${table.inputsJson})`),
  check("opinion_assessments_rationale", sql`length(trim(${table.pervasivenessRationaleAr})) >= 10`),
]);

export const aiProposals = sqliteTable("ai_proposals", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  kind: text("kind").notNull(),
  textAr: text("text_ar").notNull(),
  model: text("model").notNull(),
  promptHash: text("prompt_hash").notNull(),
  validation: text("validation").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("ai_proposals_engagement_id_uq").on(table.engagementId, table.id),
  check("ai_proposals_kind", sql`${table.kind} IN ('risk_hypothesis','narrative','summary','translation')`),
  check("ai_proposals_validation", sql`${table.validation} IN ('passed','rejected')`),
]);

export const aiClaims = sqliteTable("ai_claims", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id").notNull().references(() => aiProposals.id),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  factId: text("fact_id").notNull().references(() => facts.id),
  relation: text("relation").notNull(),
}, (table) => [
  index("ai_claims_proposal_idx").on(table.proposalId, table.startOffset),
  foreignKey({
    columns: [table.engagementId, table.proposalId],
    foreignColumns: [aiProposals.engagementId, aiProposals.id],
    name: "ai_claims_engagement_proposal_fk",
  }),
  foreignKey({
    columns: [table.engagementId, table.factId],
    foreignColumns: [facts.engagementId, facts.id],
    name: "ai_claims_engagement_fact_fk",
  }),
  check("ai_claims_span", sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`),
]);

export const aiReviews = sqliteTable("ai_reviews", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  proposalId: text("proposal_id").notNull().references(() => aiProposals.id),
  status: text("status").notNull(),
  editedTextAr: text("edited_text_ar"),
  reasonAr: text("reason_ar"),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.engagementId, table.proposalId],
    foreignColumns: [aiProposals.engagementId, aiProposals.id],
    name: "ai_reviews_engagement_proposal_fk",
  }),
  check("ai_reviews_status", sql`${table.status} IN ('accepted','edited','rejected')`),
  check("ai_reviews_reason", sql`${table.status} = 'accepted' OR length(trim(${table.reasonAr})) >= 5`),
]);

export const auditLog = sqliteTable("audit_log", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  payloadJson: text("payload_json").notNull(),
  at: text("at").notNull(),
  canonicalVersion: text("canonical_version").notNull().default("KOSIF-C14N-v1"),
  prevHash: text("prev_hash").notNull(),
  entryHash: text("entry_hash").notNull(),
}, (table) => [
  uniqueIndex("audit_log_entry_hash_uq").on(table.entryHash),
  uniqueIndex("audit_log_prev_hash_uq").on(table.engagementId, table.prevHash),
  index("audit_log_engagement_seq_idx").on(table.engagementId, table.seq),
  check("audit_log_payload_json", sql`json_valid(${table.payloadJson})`),
]);
