import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { peopleTable } from "./people";
import { companiesTable } from "./companies";

export const behavioralTrailsTable = pgTable("behavioral_trails", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .unique()
    .references(() => peopleTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  chronologicalTrail: jsonb("chronological_trail")
    .notNull()
    .$type<string[]>(),
  behaviorSummary: text("behavior_summary").notNull(),
  firstActivationAt: timestamp("first_activation_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertBehavioralTrailSchema = createInsertSchema(
  behavioralTrailsTable,
).omit({ id: true });
export type InsertBehavioralTrail = z.infer<
  typeof insertBehavioralTrailSchema
>;
export type BehavioralTrail = typeof behavioralTrailsTable.$inferSelect;
