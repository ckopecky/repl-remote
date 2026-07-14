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
  industry: text("industry").array().notNull(),
  employeeCount: integer("employee_count").notNull(),
  employeeRange: text("employee_range").notNull(),
  fundingStage: text("funding_stage").notNull(),
  latestFundingDate: date("latest_funding_date", { mode: "string" }),
  fundingAmount: integer("funding_amount"),
  headquarters: text("headquarters"),
  productCategory: text("product_category").array().notNull(),
  technologyContext: text("technology_context").array().notNull(),
  growthSignal: text("growth_signal").notNull(),
  icpFitScore: doublePrecision("icp_fit_score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

const nonEmptyStringArray = z.array(z.string().min(1)).min(1);

export const insertCompanySchema = createInsertSchema(companiesTable)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    industry: nonEmptyStringArray,
    productCategory: nonEmptyStringArray,
    technologyContext: nonEmptyStringArray,
  });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
