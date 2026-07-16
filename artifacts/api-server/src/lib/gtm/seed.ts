import { faker } from "@faker-js/faker";
import { eq, sql } from "drizzle-orm";
import {
  db,
  companiesTable,
  peopleTable,
  productEventsTable,
  behavioralTrailsTable,
  growthHypothesesTable,
  researchAssessmentsTable,
  gtmSignalsTable,
  type Company,
  type Person,
  type ProductEvent,
  type GrowthHypothesis,
} from "@workspace/db";
import {
  ARCHETYPES,
  FIXED_DEMO_SEED,
  type Archetype,
  type OutreachPriority,
} from "./constants";
import {
  generateCompany,
  generatePerson,
  generateEventSequence,
  toProductEventRows,
} from "./generator";
import { buildBehavioralTrail } from "./trail";
import { scoreProspect } from "./scoring";
import {
  DEFAULT_HYPOTHESIS_VERSION,
  DEFAULT_HYPOTHESIS_TITLE,
  DEFAULT_HYPOTHESIS_DESCRIPTION,
  DEFAULT_SIGNAL_WEIGHTS,
  DEFAULT_MESSAGING_GUIDANCE,
  DEFAULT_KNOWN_LIMITATIONS,
} from "./hypothesis";
import { logger } from "../logger";

const INITIAL_SEED_COUNT = 24;

export async function ensureCurrentHypothesis(): Promise<GrowthHypothesis> {
  const [existing] = await db
    .select()
    .from(growthHypothesesTable)
    .where(eq(growthHypothesesTable.isCurrent, true))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(growthHypothesesTable)
    .values({
      version: DEFAULT_HYPOTHESIS_VERSION,
      title: DEFAULT_HYPOTHESIS_TITLE,
      description: DEFAULT_HYPOTHESIS_DESCRIPTION,
      signalWeights: DEFAULT_SIGNAL_WEIGHTS,
      messagingGuidance: DEFAULT_MESSAGING_GUIDANCE,
      knownLimitations: DEFAULT_KNOWN_LIMITATIONS,
      isCurrent: true,
    })
    .returning();
  if (!created) throw new Error("Failed to create default growth hypothesis");
  return created;
}

export interface FullProspect {
  company: Company;
  person: Person;
  events: ProductEvent[];
  behavioralTrail: typeof behavioralTrailsTable.$inferSelect;
  researchAssessment: typeof researchAssessmentsTable.$inferSelect;
  
}

/** Generates and persists one full synthetic prospect (company + person + events + trail + assessment). */
export async function generateAndInsertProspect(
  archetype: Archetype,
  now: Date,
): Promise<FullProspect> {
  const hypothesis = await ensureCurrentHypothesis();

  const companyInsert = generateCompany();
  const [company] = await db.insert(companiesTable).values(companyInsert).returning();
  if (!company) throw new Error("Failed to insert company");

  const personBase = generatePerson();
  const signupDate = personBase.signupDate;
  const [person] = await db
    .insert(peopleTable)
    .values({ ...personBase, companyId: company.id, archetype })
    .returning();
  if (!person) throw new Error("Failed to insert person");

  const generatedEvents = generateEventSequence(archetype, signupDate, now);
  const eventRows = toProductEventRows(person.id, company.id, generatedEvents);
  const events =
    eventRows.length > 0
      ? await db.insert(productEventsTable).values(eventRows).returning()
      : [];

  const { chronologicalTrail, behaviorSummary, firstActivationAt, lastActivityAt } =
    buildBehavioralTrail(events, archetype);

  const [behavioralTrail] = await db
    .insert(behavioralTrailsTable)
    .values({
      personId: person.id,
      companyId: company.id,
      chronologicalTrail,
      behaviorSummary,
      firstActivationAt,
      lastActivityAt,
    })
    .returning();
  if (!behavioralTrail) throw new Error("Failed to insert behavioral trail");

  const scores = scoreProspect({
    person,
    company,
    events,
    weights: hypothesis.signalWeights,
    messagingGuidance: hypothesis.messagingGuidance,
    now,
  });

  const [researchAssessment] = await db
    .insert(researchAssessmentsTable)
    .values({
      personId: person.id,
      companyId: company.id,
      hypothesisVersion: hypothesis.version,
      ...scores,
    })
    .returning();
  if (!researchAssessment) throw new Error("Failed to insert research assessment");

  return { company, person, events, behavioralTrail, researchAssessment };
}

export async function generateBatch(count: number, now: Date): Promise<FullProspect[]> {
  const results: FullProspect[] = [];
  for (let i = 0; i < count; i++) {
    const archetype = faker.helpers.arrayElement(ARCHETYPES);
    results.push(await generateAndInsertProspect(archetype, now));
  }
  return results;
}

async function clearAllData(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE
    outreach_packages,
    research_assessments,
    behavioral_trails,
    product_events,
    people,
    companies,
    growth_hypotheses
    RESTART IDENTITY CASCADE`);
}

export async function resetDemoData(now: Date): Promise<void> {
  await clearAllData();
  faker.seed(FIXED_DEMO_SEED);
  await ensureCurrentHypothesis();
  await generateBatch(INITIAL_SEED_COUNT, now);
  logger.info({ seed: FIXED_DEMO_SEED, count: INITIAL_SEED_COUNT }, "Reset demo data with fixed seed");
}

export async function reseedDemoData(now: Date): Promise<void> {
  await clearAllData();
  const newSeed = Math.floor(Math.random() * 1_000_000_000);
  faker.seed(newSeed);
  await ensureCurrentHypothesis();
  await generateBatch(INITIAL_SEED_COUNT, now);
  logger.info({ seed: newSeed, count: INITIAL_SEED_COUNT }, "Reseeded demo data with new random seed");
}

/** On cold start, seed the database if it is empty so the app is never blank. */
export async function seedIfEmpty(now: Date): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(peopleTable);
  if (count > 0) {
    await ensureCurrentHypothesis();
    return;
  }
  await resetDemoData(now);
}

export interface SimulateDaysResult {
  eventsAdded: number;
  daysSimulated: number;
  trailsUpdated: number;
}

/** Simulates `days` of additional plausible product activity for existing people, then rescoring them. */
export async function simulateDays(days: number, now: Date): Promise<SimulateDaysResult> {
  const hypothesis = await ensureCurrentHypothesis();
  const people = await db.select().from(peopleTable);
  let eventsAdded = 0;
  let trailsUpdated = 0;

  for (const person of people) {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, person.companyId));
    if (!company) continue;

    const existingEvents = await db
      .select()
      .from(productEventsTable)
      .where(eq(productEventsTable.personId, person.id));

    const newEvents = simulateContinuationEvents(
      person.archetype as Archetype,
      existingEvents,
      days,
      now,
    );

    if (newEvents.length > 0) {
      const rows = toProductEventRows(person.id, company.id, newEvents);
      await db.insert(productEventsTable).values(rows);
      eventsAdded += rows.length;
    }

    const allEvents = await db
      .select()
      .from(productEventsTable)
      .where(eq(productEventsTable.personId, person.id));

    const { chronologicalTrail, behaviorSummary, firstActivationAt, lastActivityAt } =
      buildBehavioralTrail(allEvents, person.archetype as Archetype);

    await db
      .update(behavioralTrailsTable)
      .set({ chronologicalTrail, behaviorSummary, firstActivationAt, lastActivityAt, generatedAt: now })
      .where(eq(behavioralTrailsTable.personId, person.id));
    trailsUpdated += 1;

    const scores = scoreProspect({
      person,
      company,
      events: allEvents,
      weights: hypothesis.signalWeights,
      messagingGuidance: hypothesis.messagingGuidance,
      now,
    });

    await db
      .update(researchAssessmentsTable)
      .set({ hypothesisVersion: hypothesis.version, ...scores, generatedAt: now })
      .where(eq(researchAssessmentsTable.personId, person.id));
  }

  return { eventsAdded, daysSimulated: days, trailsUpdated };
}

function simulateContinuationEvents(
  archetype: Archetype,
  existingEvents: ProductEvent[],
  days: number,
  now: Date,
) {
  const lastEvent = [...existingEvents].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  )[0];
  const anchor = lastEvent ? lastEvent.occurredAt : now;
  const windowEnd = new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000);
  const cappedEnd = windowEnd > now ? now : windowEnd;
  if (cappedEnd <= anchor) return [];

  const session = () => faker.string.uuid();
  const span = cappedEnd.getTime() - anchor.getTime();
  const randomTimeInWindow = () => new Date(anchor.getTime() + faker.number.float({ min: 0.05, max: 0.95 }) * span);

  const events = [];
  switch (archetype) {
    case "rapid_team_activator":
    case "converted_account":
      if (faker.number.float({ min: 0, max: 1 }) < 0.6) {
        events.push({
          eventName: "documentation_viewed" as const,
          occurredAt: randomTimeInWindow(),
          source: "web_app",
          properties: { sessionId: session() },
        });
      }
      break;
    case "enterprise_evaluator":
      events.push({
        eventName: "sso_documentation_viewed" as const,
        occurredAt: randomTimeInWindow(),
        source: "web_app",
        properties: { sessionId: session() },
      });
      if (faker.number.float({ min: 0, max: 1 }) < 0.4) {
        events.push({
          eventName: "pricing_page_viewed" as const,
          occurredAt: randomTimeInWindow(),
          source: "web_app",
          properties: { sessionId: session() },
        });
      }
      break;
    case "solo_builder":
      if (faker.number.float({ min: 0, max: 1 }) < 0.3) {
        events.push({
          eventName: "documentation_viewed" as const,
          occurredAt: randomTimeInWindow(),
          source: "cli",
          properties: { sessionId: session() },
        });
      }
      break;
    case "stalled_implementer":
      if (faker.number.float({ min: 0, max: 1 }) < 0.5) {
        events.push({
          eventName: "inactive_period" as const,
          occurredAt: randomTimeInWindow(),
          source: "web_app",
          properties: { sessionId: session(), durationDays: days },
        });
      }
      break;
    case "returning_evaluator":
      if (faker.number.float({ min: 0, max: 1 }) < 0.4) {
        events.push({
          eventName: "returned_to_product" as const,
          occurredAt: randomTimeInWindow(),
          source: "web_app",
          properties: { sessionId: session() },
        });
        events.push({
          eventName: "pricing_page_viewed" as const,
          occurredAt: randomTimeInWindow(),
          source: "web_app",
          properties: { sessionId: session() },
        });
      }
      break;
  }
  return events;
}

export interface AssessmentChange {
  personId: number;
  personName: string;
  companyName: string;
  previousPriority: number;
  newPriority: number;
  previousOutreachPriority: OutreachPriority;
  newOutreachPriority: OutreachPriority;
}

function compositeScore(a: {
  icpFitScore: number;
  personaFitScore: number;
  activationScore: number;
  collaborationScore: number;
  enterpriseIntentScore: number;
  purchaseIntentScore: number;
  churnRiskScore: number;
}): number {
  return Math.round(
    (a.icpFitScore +
      a.personaFitScore +
      a.activationScore +
      a.collaborationScore +
      a.enterpriseIntentScore +
      a.purchaseIntentScore) /
      6 -
      a.churnRiskScore * 0.3,
  );
}

/** Recalculates research assessments for every person using the current growth hypothesis. */
export async function recalculateAllAssessments(now: Date): Promise<{
  hypothesisVersion: string;
  updatedAssessmentsCount: number;
  changes: AssessmentChange[];
}> {
  const hypothesis = await ensureCurrentHypothesis();
  const people = await db.select().from(peopleTable);
  const changes: AssessmentChange[] = [];

  for (const person of people) {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, person.companyId));
    if (!company) continue;

    const [previousAssessment] = await db
      .select()
      .from(researchAssessmentsTable)
      .where(eq(researchAssessmentsTable.personId, person.id));

    const events = await db
      .select()
      .from(productEventsTable)
      .where(eq(productEventsTable.personId, person.id));

    const scores = scoreProspect({
      person,
      company,
      events,
      weights: hypothesis.signalWeights,
      messagingGuidance: hypothesis.messagingGuidance,
      now,
    });

    await db
      .update(researchAssessmentsTable)
      .set({ hypothesisVersion: hypothesis.version, ...scores, generatedAt: now })
      .where(eq(researchAssessmentsTable.personId, person.id));

    const newPriority = compositeScore(scores);
    const previousPriority = previousAssessment ? compositeScore(previousAssessment) : newPriority;
    const previousOutreachPriority = (previousAssessment?.outreachPriority ??
      scores.outreachPriority) as OutreachPriority;

    if (
      !previousAssessment ||
      previousOutreachPriority !== scores.outreachPriority ||
      previousPriority !== newPriority
    ) {
      changes.push({
        personId: person.id,
        personName: `${person.firstName} ${person.lastName}`,
        companyName: company.name,
        previousPriority,
        newPriority,
        previousOutreachPriority,
        newOutreachPriority: scores.outreachPriority,
      });
    }
  }

  return {
    hypothesisVersion: hypothesis.version,
    updatedAssessmentsCount: people.length,
    changes,
  };
}
