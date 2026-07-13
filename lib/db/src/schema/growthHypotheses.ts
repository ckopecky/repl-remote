import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface SignalWeights {
  applicationWithin24h: number;
  organizationEnablement: number;
  teammateInvitesThreshold: number;
  repeatedSsoDocViews: number;
  pricingViewsWithoutActivation: number;
  integrationErrorsThenInactivity: number;
  returningAfterInactivity: number;
  subscriptionStart: number;
}

export type MessagingGuidance = Record<string, string>;

export const growthHypothesesTable = pgTable("growth_hypotheses", {
  id: serial("id").primaryKey(),
  version: text("version").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  signalWeights: jsonb("signal_weights").notNull().$type<SignalWeights>(),
  messagingGuidance: jsonb("messaging_guidance")
    .notNull()
    .$type<MessagingGuidance>(),
  knownLimitations: text("known_limitations").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  effectiveAt: timestamp("effective_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertGrowthHypothesisSchema = createInsertSchema(
  growthHypothesesTable,
).omit({ id: true, updatedAt: true });
export type InsertGrowthHypothesis = z.infer<
  typeof insertGrowthHypothesisSchema
>;
export type GrowthHypothesis = typeof growthHypothesesTable.$inferSelect;
