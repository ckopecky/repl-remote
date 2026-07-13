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
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { ensureCurrentHypothesis } from "../lib/gtm/seed";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  req.log.info("Fetching dashboard summary");
  const hypothesis = await ensureCurrentHypothesis();

  const [[{ companies }], [{ people }], [{ totalEvents }], activationRows, priorityRows, archetypeRows] =
    await Promise.all([
      db.select({ companies: sql<number>`count(*)::int` }).from(companiesTable),
      db.select({ people: sql<number>`count(*)::int` }).from(peopleTable),
      db.select({ totalEvents: sql<number>`count(*)::int` }).from(productEventsTable),
      db
        .select({ firstActivationAt: behavioralTrailsTable.firstActivationAt })
        .from(behavioralTrailsTable),
      db
        .select({
          outreachPriority: researchAssessmentsTable.outreachPriority,
          count: sql<number>`count(*)::int`,
        })
        .from(researchAssessmentsTable)
        .groupBy(researchAssessmentsTable.outreachPriority),
      db
        .select({
          archetype: peopleTable.archetype,
          count: sql<number>`count(*)::int`,
        })
        .from(peopleTable)
        .groupBy(peopleTable.archetype),
    ]);

  const activatedAccounts = activationRows.filter((r) => r.firstActivationAt != null).length;
  const highPriorityProspects =
    priorityRows.find((r) => r.outreachPriority === "High")?.count ?? 0;
  const enterpriseEvaluators =
    archetypeRows.find((r) => r.archetype === "enterprise_evaluator")?.count ?? 0;
  const atRiskImplementers =
    archetypeRows.find((r) => r.archetype === "stalled_implementer")?.count ?? 0;
  const convertedAccounts =
    archetypeRows.find((r) => r.archetype === "converted_account")?.count ?? 0;

  const data = GetDashboardSummaryResponse.parse({
    companies,
    people,
    totalEvents,
    activatedAccounts,
    highPriorityProspects,
    enterpriseEvaluators,
    atRiskImplementers,
    convertedAccounts,
    currentHypothesisVersion: hypothesis.version,
  });
  res.json(data);
});

export default router;
