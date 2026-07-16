import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { peopleTable } from "./people";
import { companiesTable } from "./companies";

export const gtmSignalsTable = pgTable("gtm_signals", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => peopleTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  batch: text("batch").notNull().$defaultFn(() => `batch_${Date.now()}`),
  sourceSignal: text("source_signal").notNull(),
  behavioralTrail: jsonb("behavioral_trail").notNull().$type<string[]>(),
  behaviorSummary: text("behavior_summary").notNull(),
  researchNotes: text("research_notes").notNull().default(""),
  authProblemAngle: text("auth_problem_angle"),
  outreachAngle: text("outreach_angle").notNull().default(""),
  hypothesisVersion: text("hypothesis_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  // Denormalised email content — also written to generative_ai_emails for Attio sync
  outreachEmailSubject: text("outreach_email_subject").notNull().default(""),
  outreachEmailBody: text("outreach_email_body").notNull().default(""),
  agentConfidence: text("agent_confidence"),
  status: text("status").notNull().default("Thinking"),
  exportedToAttio: boolean("exported_to_attio").notNull().default(false),
  attioSyncStatus: text("attio_sync_status").notNull().default("not_synced"),
  attioCompanyRecordId: text("attio_company_record_id"),
  attioPersonRecordId: text("attio_person_record_id"),
  attioGtmSignalRecordId: text("attio_gtm_signal_record_id"),
  attioPersonWebUrl: text("attio_person_web_url"),
  attioSyncError: text("attio_sync_error"),
  attioSyncedAt: timestamp("attio_synced_at", { withTimezone: true }),
  generationStatus: text("generation_status").notNull().default("pending"),
  generationError: text("generation_error"),
  rejectionFeedback: text("rejection_feedback"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertGtmSignalSchema = createInsertSchema(gtmSignalsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertGtmSignal = z.infer<typeof insertGtmSignalSchema>;
export type GtmSignal = typeof gtmSignalsTable.$inferSelect;
