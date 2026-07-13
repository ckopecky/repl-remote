import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import {
  db,
  peopleTable,
  companiesTable,
  productEventsTable,
  researchAssessmentsTable,
  behavioralTrailsTable,
} from "@workspace/db";
import {
  ListArchetypesResponse,
  GenerateProspectBody,
  GenerateProspectResponse,
  GenerateBatchBody,
  GenerateBatchResponse,
  ResetDemoDataResponse,
  ReseedDemoDataResponse,
  SimulateDaysBody,
  SimulateDaysResponse,
  RecalculateAssessmentsResponse,
} from "@workspace/api-zod";
import { ARCHETYPES, ARCHETYPE_INFO } from "../lib/gtm/constants";
import {
  generateAndInsertProspect,
  generateBatch,
  resetDemoData,
  reseedDemoData,
  simulateDays,
  recalculateAllAssessments,
  ensureCurrentHypothesis,
} from "../lib/gtm/seed";

const router: IRouter = Router();

router.get("/demo/archetypes", async (_req, res): Promise<void> => {
  const data = ARCHETYPES.map((key) => ({ key, ...ARCHETYPE_INFO[key] }));
  res.json(ListArchetypesResponse.parse(data));
});

router.post("/demo/generate-prospect", async (req, res): Promise<void> => {
  const parsed = GenerateProspectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const { company, person, events, behavioralTrail, researchAssessment } =
    await generateAndInsertProspect(parsed.data.archetype, now);

  req.log.info({ personId: person.id, archetype: parsed.data.archetype }, "Generated one synthetic prospect");

  const data = GenerateProspectResponse.parse({
    person,
    company,
    events,
    behavioralTrail,
    researchAssessment,
    outreachPackage: null,
  });
  res.status(201).json(data);
});

router.post("/demo/generate-batch", async (req, res): Promise<void> => {
  const parsed = GenerateBatchBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const results = await generateBatch(parsed.data.count, now);
  req.log.info({ count: results.length }, "Generated batch of synthetic prospects");

  const prospects = results.map((r) => ({
    personId: r.person.id,
    firstName: r.person.firstName,
    lastName: r.person.lastName,
    title: r.person.title,
    department: r.person.department,
    companyId: r.company.id,
    companyName: r.company.name,
    archetype: r.person.archetype,
    icpFitScore: r.researchAssessment.icpFitScore,
    activationScore: r.researchAssessment.activationScore,
    enterpriseIntentScore: r.researchAssessment.enterpriseIntentScore,
    churnRiskScore: r.researchAssessment.churnRiskScore,
    outreachPriority: r.researchAssessment.outreachPriority,
    outreachStatus: null,
  }));

  const data = GenerateBatchResponse.parse({ generated: results.length, prospects });
  res.status(201).json(data);
});

async function buildDataSummary(): Promise<{
  companies: number;
  people: number;
  totalEvents: number;
  activatedAccounts: number;
  highPriorityProspects: number;
  enterpriseEvaluators: number;
  atRiskImplementers: number;
  convertedAccounts: number;
  currentHypothesisVersion: string;
}> {
  const hypothesis = await ensureCurrentHypothesis();
  const [[{ companies }], [{ people }], [{ totalEvents }]] = await Promise.all([
    db.select({ companies: sql<number>`count(*)::int` }).from(companiesTable),
    db.select({ people: sql<number>`count(*)::int` }).from(peopleTable),
    db.select({ totalEvents: sql<number>`count(*)::int` }).from(productEventsTable),
  ]);

  const priorityRows = await db
    .select({ outreachPriority: researchAssessmentsTable.outreachPriority, count: sql<number>`count(*)::int` })
    .from(researchAssessmentsTable)
    .groupBy(researchAssessmentsTable.outreachPriority);
  const archetypeRows = await db
    .select({ archetype: peopleTable.archetype, count: sql<number>`count(*)::int` })
    .from(peopleTable)
    .groupBy(peopleTable.archetype);
  const trailRows = await db.select().from(behavioralTrailsTable);

  return {
    companies,
    people,
    totalEvents,
    activatedAccounts: trailRows.filter((t) => t.firstActivationAt != null).length,
    highPriorityProspects: priorityRows.find((r) => r.outreachPriority === "High")?.count ?? 0,
    enterpriseEvaluators: archetypeRows.find((r) => r.archetype === "enterprise_evaluator")?.count ?? 0,
    atRiskImplementers: archetypeRows.find((r) => r.archetype === "stalled_implementer")?.count ?? 0,
    convertedAccounts: archetypeRows.find((r) => r.archetype === "converted_account")?.count ?? 0,
    currentHypothesisVersion: hypothesis.version,
  };
}

router.post("/demo/reset", async (req, res): Promise<void> => {
  const now = new Date();
  await resetDemoData(now);
  req.log.info("Reset demo data to fixed seed");
  res.json(ResetDemoDataResponse.parse(await buildDataSummary()));
});

router.post("/demo/reseed", async (req, res): Promise<void> => {
  const now = new Date();
  await reseedDemoData(now);
  req.log.info("Reseeded demo data with new random seed");
  res.json(ReseedDemoDataResponse.parse(await buildDataSummary()));
});

router.post("/demo/simulate-days", async (req, res): Promise<void> => {
  const parsed = SimulateDaysBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const result = await simulateDays(parsed.data.days, now);
  req.log.info(result, "Simulated additional days of product activity");
  res.json(SimulateDaysResponse.parse(result));
});

router.post("/demo/recalculate", async (req, res): Promise<void> => {
  const now = new Date();
  const result = await recalculateAllAssessments(now);
  req.log.info(
    { updatedAssessmentsCount: result.updatedAssessmentsCount, changes: result.changes.length },
    "Recalculated research assessments",
  );
  res.json(RecalculateAssessmentsResponse.parse(result));
});

export default router;
