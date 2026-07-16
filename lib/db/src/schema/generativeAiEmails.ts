import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gtmSignalsTable } from "./gtmSignals";

/**
 * One row per LLM-generated email draft. Related to gtm_signals on a
 * many-to-one basis (one signal can accumulate multiple drafts across
 * regenerations). Each row is synced to the Generative AI Emails custom
 * object in Attio and linked back to its parent GTM Signal there.
 */
export const generativeAiEmailsTable = pgTable("generative_ai_emails", {
  id: serial("id").primaryKey(),
  gtmSignalId: integer("gtm_signal_id")
    .notNull()
    .references(() => gtmSignalsTable.id, { onDelete: "cascade" }),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  emailVersion: integer("email_version").notNull().default(1),
  agentConfidence: text("agent_confidence"),
  attioEmailRecordId: text("attio_email_record_id"),
  attioSyncStatus: text("attio_sync_status").notNull().default("not_synced"),
  attioSyncError: text("attio_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertGenerativeAiEmailSchema = createInsertSchema(
  generativeAiEmailsTable,
).omit({ id: true, createdAt: true });
export type InsertGenerativeAiEmail = z.infer<
  typeof insertGenerativeAiEmailSchema
>;
export type GenerativeAiEmail = typeof generativeAiEmailsTable.$inferSelect;
