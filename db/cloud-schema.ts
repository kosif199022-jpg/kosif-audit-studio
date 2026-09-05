import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { engagements } from "./schema";

export const engagementWorkspaceRevisions = sqliteTable("engagement_workspace_revisions", {
  engagementId: text("engagement_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  revision: integer("revision").notNull(),
  stateJson: text("state_json").notNull(),
  stateHash: text("state_hash").notNull(),
  savedBy: text("saved_by").notNull(),
  savedAt: text("saved_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.engagementId, table.revision] }),
  index("engagement_workspace_tenant_idx").on(table.tenantId, table.engagementId, table.revision),
  foreignKey({
    columns: [table.tenantId, table.engagementId],
    foreignColumns: [engagements.tenantId, engagements.id],
    name: "engagement_workspace_tenant_engagement_fk",
  }),
  check("engagement_workspace_revision_positive", sql`${table.revision} > 0`),
  check("engagement_workspace_state_json", sql`json_valid(${table.stateJson})`),
  check(
    "engagement_workspace_state_hash",
    sql`length(${table.stateHash}) = 64 AND ${table.stateHash} NOT GLOB '*[^0-9a-f]*'`,
  ),
]);
