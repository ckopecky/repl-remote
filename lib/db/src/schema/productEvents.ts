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

export const productEventsTable = pgTable("product_events", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => peopleTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  eventName: text("event_name").notNull(),
  eventCategory: text("event_category").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  properties: jsonb("properties").notNull().$type<Record<string, unknown>>(),
});

export const insertProductEventSchema = createInsertSchema(
  productEventsTable,
).omit({ id: true });
export type InsertProductEvent = z.infer<typeof insertProductEventSchema>;
export type ProductEvent = typeof productEventsTable.$inferSelect;
