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

export const outreachPackagesTable = pgTable("outreach_packages", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => peopleTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  campaign: text("campaign").notNull(),
  sourceSignal: text("source_signal").notNull(),
  behavioralTrail: jsonb("behavioral_trail").notNull().$type<string[]>(),
  behaviorSummary: text("behavior_summary").notNull(),
  researchSummary: text("research_summary").notNull(),
  outreachAngle: text("outreach_angle").notNull(),
  hypothesisVersion: text("hypothesis_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  status: text("status").notNull().default("Researching"),
  exportedToAttio: boolean("exported_to_attio").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertOutreachPackageSchema = createInsertSchema(
  outreachPackagesTable,
).omit({ id: true, createdAt: true });
export type InsertOutreachPackage = z.infer<
  typeof insertOutreachPackageSchema
>;
export type OutreachPackage = typeof outreachPackagesTable.$inferSelect;
