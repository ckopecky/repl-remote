import {
  pgTable,
  serial,
  text,
  integer,
  date,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  industry: text("industry").notNull(),
  employeeCount: integer("employee_count").notNull(),
  fundingStage: text("funding_stage").notNull(),
  latestFundingDate: date("latest_funding_date", { mode: "string" }),
  fundingAmount: integer("funding_amount"),
  headquarters: text("headquarters").notNull(),
  productCategory: text("product_category").notNull(),
  technologyContext: text("technology_context").notNull(),
  growthSignal: text("growth_signal").notNull(),
  icpFitScore: doublePrecision("icp_fit_score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
