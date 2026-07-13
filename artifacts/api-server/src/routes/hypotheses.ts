import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, growthHypothesesTable } from "@workspace/db";
import {
  ListHypothesesResponse,
  CreateHypothesisBody,
  CreateHypothesisResponse,
  GetCurrentHypothesisResponse,
} from "@workspace/api-zod";
import { ensureCurrentHypothesis, recalculateAllAssessments } from "../lib/gtm/seed";

const router: IRouter = Router();

router.get("/hypotheses", async (req, res): Promise<void> => {
  req.log.info("Listing growth hypothesis versions");
  const rows = await db
    .select()
    .from(growthHypothesesTable)
    .orderBy(desc(growthHypothesesTable.effectiveAt));
  res.json(ListHypothesesResponse.parse(rows));
});

router.get("/hypotheses/current", async (_req, res): Promise<void> => {
  const hypothesis = await ensureCurrentHypothesis();
  res.json(GetCurrentHypothesisResponse.parse(hypothesis));
});

router.post("/hypotheses", async (req, res): Promise<void> => {
  const parsed = CreateHypothesisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await ensureCurrentHypothesis();
  const versionCount = await db.select().from(growthHypothesesTable);
  const nextVersion = `v${(versionCount.length + 1).toFixed(1)}`;

  await db
    .update(growthHypothesesTable)
    .set({ isCurrent: false })
    .where(eq(growthHypothesesTable.isCurrent, true));

  const [hypothesis] = await db
    .insert(growthHypothesesTable)
    .values({
      version: nextVersion,
      title: parsed.data.title,
      description: parsed.data.description,
      signalWeights: parsed.data.signalWeights,
      messagingGuidance: parsed.data.messagingGuidance,
      knownLimitations: parsed.data.knownLimitations,
      isCurrent: true,
    })
    .returning();
  if (!hypothesis) {
    req.log.error("Failed to insert new growth hypothesis version");
    res.status(500).json({ error: "Failed to save hypothesis" });
    return;
  }

  const recalculation = await recalculateAllAssessments(new Date());

  const data = CreateHypothesisResponse.parse({ hypothesis, recalculation });
  res.status(201).json(data);
});

export default router;
