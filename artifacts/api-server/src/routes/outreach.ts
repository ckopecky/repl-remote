import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  outreachPackagesTable,
  peopleTable,
  companiesTable,
  behavioralTrailsTable,
  researchAssessmentsTable,
} from "@workspace/db";
import {
  ListOutreachPackagesQueryParams,
  ListOutreachPackagesResponse,
  CreateOutreachPackageBody,
  CreateOutreachPackageResponse,
  GetOutreachPackageParams,
  GetOutreachPackageResponse,
  UpdateOutreachPackageParams,
  UpdateOutreachPackageBody,
  UpdateOutreachPackageResponse,
  GetAttioExportPreviewParams,
  GetAttioExportPreviewResponse,
} from "@workspace/api-zod";
import { PROMPT_VERSION } from "../lib/gtm/constants";
import { buildAttioExportPreview, syncOutreachPackageToAttio } from "../lib/gtm/attio";

const router: IRouter = Router();

router.get("/outreach-packages", async (req, res): Promise<void> => {
  const parsed = ListOutreachPackagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select({
      id: outreachPackagesTable.id,
      personId: outreachPackagesTable.personId,
      personName: peopleTable.firstName,
      lastName: peopleTable.lastName,
      companyId: outreachPackagesTable.companyId,
      companyName: companiesTable.name,
      sourceSignal: outreachPackagesTable.sourceSignal,
      outreachPriority: researchAssessmentsTable.outreachPriority,
      outreachAngle: outreachPackagesTable.outreachAngle,
      status: outreachPackagesTable.status,
      attioSyncStatus: outreachPackagesTable.attioSyncStatus,
      attioPersonWebUrl: outreachPackagesTable.attioPersonWebUrl,
      attioSyncError: outreachPackagesTable.attioSyncError,
      createdAt: outreachPackagesTable.createdAt,
    })
    .from(outreachPackagesTable)
    .innerJoin(peopleTable, eq(outreachPackagesTable.personId, peopleTable.id))
    .innerJoin(companiesTable, eq(outreachPackagesTable.companyId, companiesTable.id))
    .innerJoin(researchAssessmentsTable, eq(researchAssessmentsTable.personId, peopleTable.id))
    .where(parsed.data.status ? eq(outreachPackagesTable.status, parsed.data.status) : undefined)
    .orderBy(desc(outreachPackagesTable.createdAt));

  const data = rows.map((r) => ({
    id: r.id,
    personId: r.personId,
    personName: `${r.personName} ${r.lastName}`,
    companyId: r.companyId,
    companyName: r.companyName,
    sourceSignal: r.sourceSignal,
    outreachPriority: r.outreachPriority,
    outreachAngle: r.outreachAngle,
    status: r.status,
    attioSyncStatus: r.attioSyncStatus,
    attioPersonWebUrl: r.attioPersonWebUrl,
    attioSyncError: r.attioSyncError,
    createdAt: r.createdAt,
  }));

  res.json(ListOutreachPackagesResponse.parse(data));
});

router.post("/outreach-packages", async (req, res): Promise<void> => {
  const parsed = CreateOutreachPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { personId, campaign } = parsed.data;

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

  const researchSummary = `${assessment.rationale} ${assessment.riskNotes}`;

  const [outreachPackage] = await db
    .insert(outreachPackagesTable)
    .values({
      personId: person.id,
      companyId: person.companyId,
      campaign: campaign ?? `${person.archetype}-outreach`,
      sourceSignal,
      behavioralTrail: behavioralTrail.chronologicalTrail,
      behaviorSummary: behavioralTrail.behaviorSummary,
      researchSummary,
      outreachAngle: assessment.recommendedAngle,
      hypothesisVersion: assessment.hypothesisVersion,
      promptVersion: PROMPT_VERSION,
      status: "Researching",
      exportedToAttio: false,
    })
    .returning();
  if (!outreachPackage) {
    req.log.error({ personId }, "Failed to create outreach package");
    res.status(500).json({ error: "Failed to create outreach package" });
    return;
  }

  res.status(201).json(CreateOutreachPackageResponse.parse(outreachPackage));
});

router.get("/outreach-packages/:id", async (req, res): Promise<void> => {
  const params = GetOutreachPackageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [outreachPackage] = await db
    .select()
    .from(outreachPackagesTable)
    .where(eq(outreachPackagesTable.id, params.data.id));
  if (!outreachPackage) {
    res.status(404).json({ error: "Outreach package not found" });
    return;
  }

  res.json(GetOutreachPackageResponse.parse(outreachPackage));
});

router.patch("/outreach-packages/:id", async (req, res): Promise<void> => {
  const params = UpdateOutreachPackageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateOutreachPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(outreachPackagesTable)
    .where(eq(outreachPackagesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Outreach package not found" });
    return;
  }

  const [updated] = await db
    .update(outreachPackagesTable)
    .set({ status: parsed.data.status })
    .where(eq(outreachPackagesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Outreach package not found" });
    return;
  }

  // Automatically push to the connected Attio workspace the moment a package
  // transitions into "Sent". This is a real write -- not a preview.
  if (parsed.data.status === "Sent" && existing.status !== "Sent") {
    const outreachPackage = await runAttioSync(updated.id);
    res.json(UpdateOutreachPackageResponse.parse(outreachPackage));
    return;
  }

  res.json(UpdateOutreachPackageResponse.parse(updated));
});

async function runAttioSync(outreachPackageId: number) {
  const [outreachPackage] = await db
    .select()
    .from(outreachPackagesTable)
    .where(eq(outreachPackagesTable.id, outreachPackageId));
  if (!outreachPackage) {
    throw new Error(`Outreach package ${outreachPackageId} not found`);
  }
  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, outreachPackage.personId));
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, outreachPackage.companyId));
  if (!person || !company) {
    throw new Error(`Person or company not found for outreach package ${outreachPackageId}`);
  }

  const result = await syncOutreachPackageToAttio({ company, person, outreachPackage });

  const [saved] = await db
    .update(outreachPackagesTable)
    .set(
      result.ok
        ? {
            attioSyncStatus: "synced",
            exportedToAttio: true,
            attioCompanyRecordId: result.companyRecordId,
            attioPersonRecordId: result.personRecordId,
            attioPersonWebUrl: result.personWebUrl,
            attioNoteId: result.noteId,
            attioSyncedAt: result.syncedAt,
            attioSyncError: null,
          }
        : {
            attioSyncStatus: "error",
            attioSyncError: result.error,
          },
    )
    .where(eq(outreachPackagesTable.id, outreachPackageId))
    .returning();

  return saved!;
}

router.post("/outreach-packages/:id/attio-sync", async (req, res): Promise<void> => {
  const params = GetOutreachPackageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(outreachPackagesTable)
    .where(eq(outreachPackagesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Outreach package not found" });
    return;
  }

  const outreachPackage = await runAttioSync(params.data.id);
  res.status(outreachPackage.attioSyncStatus === "error" ? 502 : 200).json(
    GetOutreachPackageResponse.parse(outreachPackage),
  );
});

router.get("/outreach-packages/:id/attio-export", async (req, res): Promise<void> => {
  const params = GetAttioExportPreviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [outreachPackage] = await db
    .select()
    .from(outreachPackagesTable)
    .where(eq(outreachPackagesTable.id, params.data.id));
  if (!outreachPackage) {
    res.status(404).json({ error: "Outreach package not found" });
    return;
  }

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, outreachPackage.personId));
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, outreachPackage.companyId));
  if (!person || !company) {
    res.status(404).json({ error: "Person or company not found for outreach package" });
    return;
  }

  const preview = buildAttioExportPreview({ company, person, outreachPackage });
  res.json(GetAttioExportPreviewResponse.parse(preview));
});

export default router;
