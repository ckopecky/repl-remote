import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  gtmSignalsTable,
  generativeAiEmailsTable,
  peopleTable,
  companiesTable,
  behavioralTrailsTable,
  researchAssessmentsTable,
} from "@workspace/db";
import {
  ListGtmSignalsQueryParams,
  ListGtmSignalsResponse,
  CreateGtmSignalBody,
  CreateGtmSignalResponse,
  GetGtmSignalParams,
  GetGtmSignalResponse,
  UpdateGtmSignalParams,
  UpdateGtmSignalBody,
  UpdateGtmSignalResponse,
  GetAttioExportPreviewParams,
  GetAttioExportPreviewResponse,
} from "@workspace/api-zod";
import { PROMPT_VERSION } from "../lib/gtm/constants";
import type { Archetype } from "../lib/gtm/constants";
import { buildAttioExportPreview, syncGtmSignalToAttio } from "../lib/gtm/attio";
import { generateOutreachContent } from "../lib/gtm/llm";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /gtm-signals
// ---------------------------------------------------------------------------
router.get("/gtm-signals", async (req, res): Promise<void> => {
  const parsed = ListGtmSignalsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select({
      id: gtmSignalsTable.id,
      personId: gtmSignalsTable.personId,
      personName: peopleTable.firstName,
      lastName: peopleTable.lastName,
      companyId: gtmSignalsTable.companyId,
      companyName: companiesTable.name,
      sourceSignal: gtmSignalsTable.sourceSignal,
      outreachPriority: researchAssessmentsTable.outreachPriority,
      outreachAngle: gtmSignalsTable.outreachAngle,
      authProblemAngle: gtmSignalsTable.authProblemAngle,
      status: gtmSignalsTable.status,
      attioSyncStatus: gtmSignalsTable.attioSyncStatus,
      attioPersonWebUrl: gtmSignalsTable.attioPersonWebUrl,
      attioSyncError: gtmSignalsTable.attioSyncError,
      generationStatus: gtmSignalsTable.generationStatus,
      generationError: gtmSignalsTable.generationError,
      rejectionFeedback: gtmSignalsTable.rejectionFeedback,
      createdAt: gtmSignalsTable.createdAt,
    })
    .from(gtmSignalsTable)
    .innerJoin(peopleTable, eq(gtmSignalsTable.personId, peopleTable.id))
    .innerJoin(companiesTable, eq(gtmSignalsTable.companyId, companiesTable.id))
    .innerJoin(researchAssessmentsTable, eq(researchAssessmentsTable.personId, peopleTable.id))
    .where(parsed.data.status ? eq(gtmSignalsTable.status, parsed.data.status) : undefined)
    .orderBy(desc(gtmSignalsTable.createdAt));

  const data = rows.map((r) => ({
    id: r.id,
    personId: r.personId,
    personName: `${r.personName} ${r.lastName}`,
    companyId: r.companyId,
    companyName: r.companyName,
    sourceSignal: r.sourceSignal,
    outreachPriority: r.outreachPriority,
    outreachAngle: r.outreachAngle,
    authProblemAngle: r.authProblemAngle,
    status: r.status,
    attioSyncStatus: r.attioSyncStatus,
    attioPersonWebUrl: r.attioPersonWebUrl,
    attioSyncError: r.attioSyncError,
    generationStatus: r.generationStatus,
    generationError: r.generationError,
    rejectionFeedback: r.rejectionFeedback,
    createdAt: r.createdAt,
  }));

  res.json(ListGtmSignalsResponse.parse(data));
});

// ---------------------------------------------------------------------------
// POST /gtm-signals
// ---------------------------------------------------------------------------
router.post("/gtm-signals", async (req, res): Promise<void> => {
  const parsed = CreateGtmSignalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { personId } = parsed.data;

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, personId));
  if (!person) {
    res.status(404).json({ error: "Prospect not found" });
    return;
  }

  const [behavioralTrail] = await db
    .select()
    .from(behavioralTrailsTable)
    .where(eq(behavioralTrailsTable.personId, personId));
  const [assessment] = await db
    .select()
    .from(researchAssessmentsTable)
    .where(eq(researchAssessmentsTable.personId, personId));

  if (!behavioralTrail || !assessment) {
    res.status(400).json({ error: "Prospect is missing behavioral trail or research assessment" });
    return;
  }

  const sourceSignal =
    assessment.activationScore >= assessment.enterpriseIntentScore
      ? "Fast activation"
      : assessment.enterpriseIntentScore >= assessment.purchaseIntentScore
        ? "Enterprise research signal"
        : "Purchase intent signal";

  const researchNotes = `${assessment.rationale} ${assessment.riskNotes}`;

  const [gtmSignal] = await db
    .insert(gtmSignalsTable)
    .values({
      personId: person.id,
      companyId: person.companyId,
      sourceSignal,
      behavioralTrail: behavioralTrail.chronologicalTrail,
      behaviorSummary: behavioralTrail.behaviorSummary,
      researchNotes,
      outreachAngle: assessment.recommendedAngle,
      hypothesisVersion: assessment.hypothesisVersion,
      promptVersion: PROMPT_VERSION,
      status: "Researching",
      exportedToAttio: false,
      generationStatus: "pending",
    })
    .returning();
  if (!gtmSignal) {
    req.log.error({ personId }, "Failed to create GTM signal");
    res.status(500).json({ error: "Failed to create GTM signal" });
    return;
  }

  const generated = await runGeneration(gtmSignal.id);
  const synced = await runAttioSync(generated.id);
  res.status(201).json(CreateGtmSignalResponse.parse(synced));
});

// ---------------------------------------------------------------------------
// GET /gtm-signals/:id
// ---------------------------------------------------------------------------
router.get("/gtm-signals/:id", async (req, res): Promise<void> => {
  const params = GetGtmSignalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [gtmSignal] = await db
    .select()
    .from(gtmSignalsTable)
    .where(eq(gtmSignalsTable.id, params.data.id));
  if (!gtmSignal) {
    res.status(404).json({ error: "GTM signal not found" });
    return;
  }

  res.json(GetGtmSignalResponse.parse(gtmSignal));
});

// ---------------------------------------------------------------------------
// PATCH /gtm-signals/:id
// ---------------------------------------------------------------------------
router.patch("/gtm-signals/:id", async (req, res): Promise<void> => {
  const params = UpdateGtmSignalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateGtmSignalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(gtmSignalsTable)
    .where(eq(gtmSignalsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "GTM signal not found" });
    return;
  }

  const updateFields: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.rejectionFeedback !== undefined) {
    updateFields.rejectionFeedback = parsed.data.rejectionFeedback || null;
  }

  const [updated] = await db
    .update(gtmSignalsTable)
    .set(updateFields)
    .where(eq(gtmSignalsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "GTM signal not found" });
    return;
  }

  res.json(UpdateGtmSignalResponse.parse(updated));
});

// ---------------------------------------------------------------------------
// POST /gtm-signals/:id/generate
// ---------------------------------------------------------------------------
router.post("/gtm-signals/:id/generate", async (req, res): Promise<void> => {
  const params = GetGtmSignalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(gtmSignalsTable)
    .where(eq(gtmSignalsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "GTM signal not found" });
    return;
  }

  const gtmSignal = await runGeneration(params.data.id);
  res.status(gtmSignal.generationStatus === "failed" ? 502 : 200).json(
    GetGtmSignalResponse.parse(gtmSignal),
  );
});

// ---------------------------------------------------------------------------
// POST /gtm-signals/:id/attio-sync
// ---------------------------------------------------------------------------
router.post("/gtm-signals/:id/attio-sync", async (req, res): Promise<void> => {
  const params = GetGtmSignalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(gtmSignalsTable)
    .where(eq(gtmSignalsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "GTM signal not found" });
    return;
  }

  const gtmSignal = await runAttioSync(params.data.id);
  const syncFailed =
    gtmSignal.attioSyncStatus === "error" || gtmSignal.attioSyncStatus === "partial";
  res.status(syncFailed ? 502 : 200).json(
    GetGtmSignalResponse.parse(gtmSignal),
  );
});

// ---------------------------------------------------------------------------
// GET /gtm-signals/:id/attio-export
// ---------------------------------------------------------------------------
router.get("/gtm-signals/:id/attio-export", async (req, res): Promise<void> => {
  const params = GetAttioExportPreviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [gtmSignal] = await db
    .select()
    .from(gtmSignalsTable)
    .where(eq(gtmSignalsTable.id, params.data.id));
  if (!gtmSignal) {
    res.status(404).json({ error: "GTM signal not found" });
    return;
  }

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, gtmSignal.personId));
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, gtmSignal.companyId));
  if (!person || !company) {
    res.status(404).json({ error: "Person or company not found for GTM signal" });
    return;
  }

  const [generativeAiEmail] = await db
    .select()
    .from(generativeAiEmailsTable)
    .where(eq(generativeAiEmailsTable.gtmSignalId, gtmSignal.id))
    .orderBy(desc(generativeAiEmailsTable.emailVersion))
    .limit(1);

  const preview = buildAttioExportPreview({ company, person, gtmSignal, generativeAiEmail });
  res.json(GetAttioExportPreviewResponse.parse(preview));
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function runGeneration(gtmSignalId: number) {
  const [gtmSignal] = await db
    .select()
    .from(gtmSignalsTable)
    .where(eq(gtmSignalsTable.id, gtmSignalId));
  if (!gtmSignal) {
    throw new Error(`GTM signal ${gtmSignalId} not found`);
  }

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, gtmSignal.personId));
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, gtmSignal.companyId));
  if (!person || !company) {
    throw new Error(`Person or company not found for GTM signal ${gtmSignalId}`);
  }

  const result = await generateOutreachContent({
    company,
    person,
    archetype: person.archetype as Archetype,
    behavioralTrail: gtmSignal.behavioralTrail,
    behaviorSummary: gtmSignal.behaviorSummary,
    outreachPriority: gtmSignal.sourceSignal,
    sourceSignal: gtmSignal.sourceSignal,
  });

  // Count existing email versions for this signal so we increment correctly
  const existingEmails = await db
    .select({ id: generativeAiEmailsTable.id })
    .from(generativeAiEmailsTable)
    .where(eq(generativeAiEmailsTable.gtmSignalId, gtmSignalId));
  const nextVersion = existingEmails.length + 1;

  if (result.ok) {
    // Insert the generated email into the dedicated table
    await db.insert(generativeAiEmailsTable).values({
      gtmSignalId,
      subject: result.content.emailSubject,
      body: result.content.emailBody,
      emailVersion: nextVersion,
      agentConfidence: result.content.confidence,
    });
  }

  // Update the GTM signal with generation outcome (denormalised for list views)
  const [saved] = await db
    .update(gtmSignalsTable)
    .set(
      result.ok
        ? {
            generationStatus: "generated",
            generationError: null,
            agentConfidence: result.content.confidence,
            outreachAngle: result.content.outreachAngle,
            authProblemAngle: result.content.authProblemAngle,
            researchNotes: `${result.content.verdictReason} ${result.content.researchSummary}`,
            outreachEmailSubject: result.content.emailSubject,
            outreachEmailBody: result.content.emailBody,
            status: "Needs Review",
          }
        : {
            generationStatus: "failed",
            generationError: result.error,
          },
    )
    .where(eq(gtmSignalsTable.id, gtmSignalId))
    .returning();

  return saved!;
}

async function runAttioSync(gtmSignalId: number) {
  const [gtmSignal] = await db
    .select()
    .from(gtmSignalsTable)
    .where(eq(gtmSignalsTable.id, gtmSignalId));
  if (!gtmSignal) {
    throw new Error(`GTM signal ${gtmSignalId} not found`);
  }

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, gtmSignal.personId));
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, gtmSignal.companyId));
  if (!person || !company) {
    throw new Error(`Person or company not found for GTM signal ${gtmSignalId}`);
  }

  // Fetch the most recent Generative AI Email for this signal (if any)
  const [generativeAiEmail] = await db
    .select()
    .from(generativeAiEmailsTable)
    .where(eq(generativeAiEmailsTable.gtmSignalId, gtmSignalId))
    .orderBy(desc(generativeAiEmailsTable.emailVersion))
    .limit(1);

  const result = await syncGtmSignalToAttio({ company, person, gtmSignal, generativeAiEmail });

  // Persist the Attio record IDs on the email row if we got one back.
  // This applies for both full success and partial success (steps 1–4 done,
  // list-entry step failed) so the email record is never orphaned.
  const emailIdToSave =
    result.ok === true || result.ok === "partial" ? result.emailRecordId : null;
  if (generativeAiEmail && emailIdToSave) {
    await db
      .update(generativeAiEmailsTable)
      .set({
        attioEmailRecordId: emailIdToSave,
        attioSyncStatus: result.ok === true ? "synced" : "partial",
        attioSyncError: result.ok === "partial" ? result.error : null,
      })
      .where(eq(generativeAiEmailsTable.id, generativeAiEmail.id));
  }

  // Build the DB update payload based on the result variant.
  // - ok: true  → full success, mark as synced
  // - ok: partial → steps 1–4 wrote records to Attio but step 5 (list entry) failed;
  //                 persist the IDs we have so a retry won't create duplicates
  // - ok: false → nothing was created in Attio
  const gtmSignalUpdate =
    result.ok === true
      ? {
          attioSyncStatus: "synced" as const,
          exportedToAttio: true,
          attioCompanyRecordId: result.companyRecordId,
          attioPersonRecordId: result.personRecordId,
          attioGtmSignalRecordId: result.gtmSignalRecordId,
          attioPersonWebUrl: result.personWebUrl,
          attioSyncedAt: result.syncedAt,
          attioSyncError: null,
        }
      : result.ok === "partial"
        ? {
            attioSyncStatus: "partial" as const,
            // Persist whatever IDs were created so a retry only handles what's missing
            ...(result.companyRecordId ? { attioCompanyRecordId: result.companyRecordId } : {}),
            ...(result.personRecordId ? { attioPersonRecordId: result.personRecordId } : {}),
            ...(result.personWebUrl ? { attioPersonWebUrl: result.personWebUrl } : {}),
            ...(result.gtmSignalRecordId ? { attioGtmSignalRecordId: result.gtmSignalRecordId } : {}),
            attioSyncError: `Partial sync — records created in Attio but list-entry step failed: ${result.error}`,
          }
        : {
            attioSyncStatus: "error" as const,
            attioSyncError: result.error,
          };

  const [saved] = await db
    .update(gtmSignalsTable)
    .set(gtmSignalUpdate)
    .where(eq(gtmSignalsTable.id, gtmSignalId))
    .returning();

  return saved!;
}

export default router;
