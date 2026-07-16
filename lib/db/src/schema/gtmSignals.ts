import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  AnyPgColumn
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { peopleTable } from "./people";
import { companiesTable } from "./companies";
import { listsTable } from "./lists";
import { auth_problem_angle } from "./auth_problem_angle";




export const gtmSignalsTable = pgTable("gtm_signals", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => peopleTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  listId: integer("list_id")
    .references(() => listsTable.id, { onDelete: "cascade" }),
  batch: text("batch").notNull().$defaultFn(() => `batch_${Date.now()}`),
  sourceSignal: text("source_signal").notNull(),
behavioralTrail: jsonb("behavioral_trail").notNull().$type<string[]>(),
behaviorSummary: text("behavior_summary").notNull(),
researchNotes: text("research_notes").notNull(),
//export const user = pgTable("user", {
  //   id: serial("id"),
  //   name: text("name"),
  //   parentId: integer("parent_id").references((): AnyPgColumn => user.id)
  // });
hypothesisVersion: text("hypothesis_version").notNull(),
promptVersion: text("prompt_version").notNull(),
//emailVersion: //TODO: move to its own Generative AI Table text("email_version").$onUpdateFn((val:string) => {
//   val = (Number(val) + 1).toString();
//   return val;
// }),
status: text("status").notNull().default("Thinking"),
  exportedToAttio: boolean("exported_to_attio").notNull().default(false),
  attioSyncStatus: text("attio_sync_status").notNull().default("not_synced"),
  attioCompanyRecordId: text("attio_company_record_id"),
  attioPersonRecordId: text("attio_person_record_id"),
  attioNoteId: text("attio_note_id"),
  attioPersonWebUrl: text("attio_person_web_url"),
  attioSyncError: text("attio_sync_error"),
  attioSyncedAt: timestamp("attio_synced_at", { withTimezone: true }),
  generationStatus: text("generation_status").notNull().default("pending"),
  generationError: text("generation_error"),
//   agentConfidence: text("agent_confidence"),
//   outreachEmailSubject: text("outreach_email_subject").notNull().default(""),
//   outreachEmailBody: text("outreach_email_body").notNull().default(""),
//   createdAt: timestamp("created_at", { withTimezone: true })
//     .notNull()
//     .defaultNow(),
// });

// export const authProblemAngle = pgTable("auth_problem_angle", {
  id: serial("id"),
  angle: text("angle"),
  parentId: integer("parent_id").references((): AnyPgColumn => authProblemAngle.id)
});

export const insertGtmSignalsSchema = createInsertSchema(
  gtmSignalsTable,
).omit({ id: true, createdAt: true });
export type InsertGtmSignals = z.infer<
  typeof insertGtmSignalsSchema
>;
export type gtmSignalsTable = typeof gtmSignalsTable.$inferSelect

export const insertAuthProblemAngleSchema = createInsertSchema(
  authProblemAngle,
).omit({ id: true, createdAt: true });
export type InsertAuthProblemAngle = z.infer<
  typeof insertAuthProblemAngleSchema
>;
export type AuthProblemAngle = typeof authProblemAngle.$inferSelect