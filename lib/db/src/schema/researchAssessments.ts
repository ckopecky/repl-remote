import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { peopleTable } from "./people";
import { companiesTable } from "./companies";

export const researchAssessmentsTable = pgTable("research_assessments", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .unique()
    .references(() => peopleTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  hypothesisVersion: text("hypothesis_version").notNull(),
  icpFitScore: doublePrecision("icp_fit_score").notNull(),
  personaFitScore: doublePrecision("persona_fit_score").notNull(),
  activationScore: doublePrecision("activation_score").notNull(),
  collaborationScore: doublePrecision("collaboration_score").notNull(),
  enterpriseIntentScore: doublePrecision("enterprise_intent_score").notNull(),
  purchaseIntentScore: doublePrecision("purchase_intent_score").notNull(),
  churnRiskScore: doublePrecision("churn_risk_score").notNull(),
  outreachPriority: text("outreach_priority").notNull(),
  recommendedAngle: text("recommended_angle").notNull(),
  rationale: text("rationale").notNull(),
  riskNotes: text("risk_notes").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertResearchAssessmentSchema = createInsertSchema(
  researchAssessmentsTable,
).omit({ id: true });
export type InsertResearchAssessment = z.infer<
  typeof insertResearchAssessmentSchema
>;
export type ResearchAssessment = typeof researchAssessmentsTable.$inferSelect;
