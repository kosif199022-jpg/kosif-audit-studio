import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const drizzleDirectory = new URL("../drizzle/", import.meta.url);

async function migratedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const files = (await readdir(drizzleDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const file of files) db.exec(await readFile(new URL(file, drizzleDirectory), "utf8"));
  return db;
}

function seedEngagements(db) {
  db.exec(`
    INSERT INTO tenants (id, name, created_at) VALUES
      ('ten_1', 'مساحة 1', '2025-01-01T00:00:00.000Z'),
      ('ten_2', 'مساحة 2', '2025-01-01T00:00:00.000Z');
    INSERT INTO engagements (
      id, tenant_id, client_name_ar, fiscal_year, period_start, period_end,
      currency, framework, status, ruleset_version, created_by, created_at
    ) VALUES
      ('eng_1', 'ten_1', 'عميل 1', 2025, '2025-01-01', '2025-12-31', 'SAR', 'IFRS', 'fieldwork', 'v1', 'one@test', '2025-01-01T00:00:00.000Z'),
      ('eng_2', 'ten_2', 'عميل 2', 2025, '2025-01-01', '2025-12-31', 'SAR', 'IFRS', 'fieldwork', 'v1', 'two@test', '2025-01-01T00:00:00.000Z');
  `);
}

function seedSourcesAndAccounts(db) {
  db.exec(`
    INSERT INTO source_files (
      id, engagement_id, tenant_id, filename, kind, sha256, r2_key,
      row_count, accepted_row_count, rejected_row_count, imported_at, imported_by
    ) VALUES
      ('src_1', 'eng_1', 'ten_1', 'one.csv', 'general_ledger', 'hash-1', 'ten_1/one.csv', 1, 1, 0, '2025-01-02T00:00:00.000Z', 'one@test'),
      ('src_2', 'eng_2', 'ten_2', 'two.csv', 'general_ledger', 'hash-2', 'ten_2/two.csv', 1, 1, 0, '2025-01-02T00:00:00.000Z', 'two@test');
    INSERT INTO accounts (id, engagement_id, tenant_id, code, name_ar, name_ar_norm, opening_amount_minor) VALUES
      ('acc_1', 'eng_1', 'ten_1', '1000', 'نقد', 'نقد', '0'),
      ('acc_2', 'eng_2', 'ten_2', '2000', 'ذمم', 'ذمم', '0');
    INSERT INTO journal_entries (
      id, engagement_id, source_file_id, entry_no, entry_date, is_manual, source_row
    ) VALUES ('je_1', 'eng_1', 'src_1', '1', '2025-01-02', 1, 1);
  `);
}

test("D1 rejects cross-engagement journal, trial-balance, mapping, and AI references", async () => {
  const db = await migratedDatabase();
  seedEngagements(db);
  seedSourcesAndAccounts(db);

  assert.throws(
    () => db.exec("UPDATE engagements SET prior_engagement_id = 'eng_2' WHERE id = 'eng_1'"),
    /FOREIGN KEY constraint failed/,
  );

  assert.throws(() => db.exec(`
    INSERT INTO journal_lines (id, engagement_id, entry_id, account_id, debit_minor, credit_minor, line_no)
    VALUES ('jl_cross', 'eng_2', 'je_1', 'acc_1', '1', '0', 1)
  `), /FOREIGN KEY constraint failed/);

  assert.throws(() => db.exec(`
    INSERT INTO trial_balance_lines (
      id, engagement_id, source_file_id, account_id, source_row,
      opening_debit_minor, opening_credit_minor, period_debit_minor,
      period_credit_minor, closing_debit_minor, closing_credit_minor
    ) VALUES ('tb_cross', 'eng_2', 'src_1', 'acc_1', 1, '0', '0', '1', '0', '1', '0')
  `), /FOREIGN KEY constraint failed/);

  db.exec(`
    INSERT INTO fs_lines (framework, ruleset_version, code, statement, label_ar, normal_side, sort_order)
    VALUES ('IFRS', 'v1', 'BS.CA.CASH', 'BS', 'النقد', 'debit', 1);
    INSERT INTO mapping_sets (id, engagement_id, version, status, input_snapshot_hash, decided_by, decided_at)
    VALUES
      ('map_1', 'eng_1', 1, 'confirmed', 'snapshot-1', 'one@test', '2025-01-03T00:00:00.000Z'),
      ('map_2', 'eng_2', 1, 'confirmed', 'snapshot-2', 'two@test', '2025-01-03T00:00:00.000Z');
  `);
  assert.throws(() => db.exec(`
    INSERT INTO fs_lines (framework, ruleset_version, code, statement, parent_code, label_ar, normal_side, sort_order)
    VALUES ('IFRS', 'v2', 'BS.CA.CASH.ON_HAND', 'BS', 'BS.CA.CASH', 'نقد في الصندوق', 'debit', 2)
  `), /FOREIGN KEY constraint failed/);

  assert.throws(() => db.exec(`
    INSERT INTO mapping_rules (
      id, engagement_id, mapping_set_id, account_id, framework, ruleset_version,
      fs_line_code, method, decided_by, decided_at
    ) VALUES ('mr_unknown', 'eng_1', 'map_1', 'acc_1', 'IFRS', 'v1', 'UNKNOWN', 'manual', 'one@test', '2025-01-03T00:00:00.000Z')
  `), /FOREIGN KEY constraint failed/);

  assert.throws(() => db.exec(`
    INSERT INTO mapping_rules (
      id, engagement_id, mapping_set_id, account_id, framework, ruleset_version,
      fs_line_code, method, decided_by, decided_at
    ) VALUES ('mr_cross', 'eng_2', 'map_1', 'acc_1', 'IFRS', 'v1', 'BS.CA.CASH', 'manual', 'two@test', '2025-01-03T00:00:00.000Z')
  `), /FOREIGN KEY constraint failed/);

  db.exec(`
    INSERT INTO calculation_runs (id, engagement_id, kind, input_snapshot_hash, ruleset_version, effective_at, created_at)
    VALUES ('run_1', 'eng_1', 'statements', 'input-1', 'v1', '2025-12-31T00:00:00.000Z', '2025-12-31T00:00:00.000Z');
    INSERT INTO derivations (id, engagement_id, run_id, kind, formula)
    VALUES ('der_1', 'eng_1', 'run_1', 'constant', '1');
    INSERT INTO figures (id, engagement_id, run_id, scope, scope_key, unit, value_int, computed_at, ruleset_version, derivation_id)
    VALUES ('fig_1', 'eng_1', 'run_1', 'custom', 'one', 'count', '1', '2025-12-31T00:00:00.000Z', 'v1', 'der_1');
    INSERT INTO facts (id, engagement_id, predicate, value_int, unit, figure_id, produced_by, producer_version, input_snapshot_hash)
    VALUES ('fact_1', 'eng_1', 'one', '1', 'count', 'fig_1', 'test', '1', 'input-1');
    INSERT INTO ai_proposals (id, engagement_id, kind, text_ar, model, prompt_hash, validation, created_at)
    VALUES ('aip_2', 'eng_2', 'summary', 'قيمة واحدة', 'test', 'prompt-1', 'passed', '2025-12-31T00:00:00.000Z');
  `);
  assert.throws(() => db.exec(`
    INSERT INTO ai_claims (id, proposal_id, engagement_id, start_offset, end_offset, fact_id, relation)
    VALUES ('aic_cross', 'aip_2', 'eng_2', 5, 10, 'fact_1', 'value_of')
  `), /FOREIGN KEY constraint failed/);
  db.close();
});

test("D1 canonical integer checks preserve arbitrary precision and reject ambiguous money", async () => {
  const db = await migratedDatabase();
  seedEngagements(db);

  for (const [index, value] of ["0", "1", "-1", "9007199254740993"].entries()) {
    db.prepare(`
      INSERT INTO accounts (id, engagement_id, tenant_id, code, name_ar, name_ar_norm, opening_amount_minor)
      VALUES (?, 'eng_1', 'ten_1', ?, 'حساب', 'حساب', ?)
    `).run(`acc_ok_${index}`, `ok_${index}`, value);
  }
  assert.equal(db.prepare("SELECT opening_amount_minor FROM accounts WHERE id = 'acc_ok_3'").get().opening_amount_minor, "9007199254740993");

  for (const [index, value] of ["abc", "1.0", "01", "-0", "+1", " 1", "1e3", "١٠٠"].entries()) {
    assert.throws(() => db.prepare(`
      INSERT INTO accounts (id, engagement_id, tenant_id, code, name_ar, name_ar_norm, opening_amount_minor)
      VALUES (?, 'eng_1', 'ten_1', ?, 'حساب', 'حساب', ?)
    `).run(`acc_bad_${index}`, `bad_${index}`, value), /CHECK constraint failed/);
  }

  db.exec(`
    INSERT INTO source_files (
      id, engagement_id, tenant_id, filename, kind, sha256, r2_key,
      row_count, accepted_row_count, rejected_row_count, imported_at, imported_by
    ) VALUES ('src_1', 'eng_1', 'ten_1', 'one.csv', 'general_ledger', 'hash', 'ten_1/one.csv', 1, 1, 0, '2025-01-02T00:00:00.000Z', 'one@test');
    INSERT INTO journal_entries (id, engagement_id, source_file_id, entry_no, entry_date, is_manual, source_row)
    VALUES ('je_1', 'eng_1', 'src_1', '1', '2025-01-02', 1, 1);
  `);
  assert.throws(() => db.exec("INSERT INTO journal_lines VALUES ('jl_neg','eng_1','je_1','acc_ok_0','-1','0',1)"), /CHECK constraint failed/);
  assert.throws(() => db.exec("INSERT INTO journal_lines VALUES ('jl_zero','eng_1','je_1','acc_ok_0','0','0',1)"), /CHECK constraint failed/);
  assert.throws(() => db.exec("INSERT INTO journal_lines VALUES ('jl_both','eng_1','je_1','acc_ok_0','1','1',1)"), /CHECK constraint failed/);
  db.exec("INSERT INTO journal_lines VALUES ('jl_ok','eng_1','je_1','acc_ok_0','9007199254740993','0',1)");
  db.close();
});

test("cloud workspace revisions are tenant-isolated, append-only, and archive-guarded", async () => {
  const db = await migratedDatabase();
  seedEngagements(db);

  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'engagement_workspace_revisions'").get();
  assert.equal(table?.name, "engagement_workspace_revisions");

  db.exec(`
    INSERT INTO engagement_workspace_revisions (
      engagement_id, tenant_id, revision, state_json, state_hash, saved_by, saved_at
    ) VALUES ('eng_1', 'ten_1', 1, '{"version":7}', '${"a".repeat(64)}', 'one@test', '2025-02-01T00:00:00.000Z')
  `);

  assert.throws(() => db.exec(`
    INSERT INTO engagement_workspace_revisions (
      engagement_id, tenant_id, revision, state_json, state_hash, saved_by, saved_at
    ) VALUES ('eng_1', 'ten_2', 2, '{"version":7}', '${"b".repeat(64)}', 'two@test', '2025-02-02T00:00:00.000Z')
  `), /FOREIGN KEY constraint failed/);

  assert.throws(
    () => db.exec("UPDATE engagement_workspace_revisions SET state_hash = 'changed' WHERE engagement_id = 'eng_1' AND revision = 1"),
    /engagement_workspace_revisions_is_append_only/,
  );
  assert.throws(
    () => db.exec("DELETE FROM engagement_workspace_revisions WHERE engagement_id = 'eng_1' AND revision = 1"),
    /engagement_workspace_revisions_is_append_only/,
  );

  db.exec("UPDATE engagements SET status = 'archived', archived_at = '2026-01-01T00:00:00.000Z' WHERE id = 'eng_1'");
  assert.throws(() => db.exec(`
    INSERT INTO engagement_workspace_revisions (
      engagement_id, tenant_id, revision, state_json, state_hash, saved_by, saved_at
    ) VALUES ('eng_1', 'ten_1', 2, '{"version":7}', '${"c".repeat(64)}', 'one@test', '2026-01-02T00:00:00.000Z')
  `), /archived_engagement_is_read_only/);
  db.close();
});

test("archive guard matrix covers every engagement-owned table and preserves audit append", async () => {
  const db = await migratedDatabase();
  seedEngagements(db);
  db.exec("UPDATE engagements SET status = 'archived', archived_at = '2026-01-01T00:00:00.000Z' WHERE id = 'eng_1'");

  const owned = [
    "source_files", "rejected_rows", "accounts", "trial_balance_lines", "journal_entries", "journal_lines",
    "mapping_sets", "mapping_rules", "calculation_runs", "derivations", "provenance_nodes", "derivation_inputs",
    "figures", "facts", "je_test_runs", "findings", "finding_dispositions", "materiality_versions",
    "misstatements", "opinion_assessments", "ai_proposals", "ai_claims", "ai_reviews", "engagement_workspace_revisions",
  ];
  const appendOnly = [...owned, "audit_log", "fs_lines"];
  const triggerNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map(({ name }) => name));

  for (const table of owned) {
    assert.equal(triggerNames.has(`${table}_archived_insert_guard`), true, `${table} insert guard`);
    assert.equal(triggerNames.has(`${table}_no_update`), true, `${table} update guard`);
    assert.equal(triggerNames.has(`${table}_no_delete`), true, `${table} delete guard`);
    assert.throws(() => db.exec(`INSERT INTO ${table} (engagement_id) VALUES ('eng_1')`), /archived_engagement_is_read_only/);
  }
  for (const table of appendOnly) {
    assert.equal(triggerNames.has(`${table}_no_update`), true, `${table} append-only update`);
    assert.equal(triggerNames.has(`${table}_no_delete`), true, `${table} append-only delete`);
  }

  db.exec(`
    INSERT INTO audit_log (engagement_id, actor, action, payload_json, at, canonical_version, prev_hash, entry_hash)
    VALUES ('eng_1', 'one@test', 'post_archive.note', '{}', '2026-01-02T00:00:00.000Z', 'KOSIF-C14N-v1', '${"0".repeat(64)}', '${"1".repeat(64)}')
  `);
  assert.throws(() => db.exec("UPDATE audit_log SET action = 'changed' WHERE engagement_id = 'eng_1'"), /audit_log_is_append_only/);
  assert.throws(() => db.exec("DELETE FROM audit_log WHERE engagement_id = 'eng_1'"), /audit_log_is_append_only/);
  assert.throws(() => db.exec("UPDATE engagements SET client_name_ar = 'معدل' WHERE id = 'eng_1'"), /archived_engagement_is_read_only/);
  db.close();
});
