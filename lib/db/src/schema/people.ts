import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const peopleTable = pgTable("people", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  profileUrl: text("profile_url").notNull(),
  title: text("title").notNull(),
  department: text("department").notNull(),
  seniority: text("seniority").notNull(),
  persona: text("persona").notNull(),
  purchaseRole: text("purchase_role").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  archetype: text("archetype").notNull(),
  contactPriority: text("contact_priority").notNull(),
  signupDate: timestamp("signup_date", { withTimezone: true }).notNull(),
  lifecycleStage: text("lifecycle_stage").notNull(),
});

export const insertPersonSchema = createInsertSchema(peopleTable).omit({
  id: true,
});
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof peopleTable.$inferSelect;
