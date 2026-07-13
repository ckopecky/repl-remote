import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  peopleTable,
  companiesTable,
  productEventsTable,
  behavioralTrailsTable,
  researchAssessmentsTable,
  outreachPackagesTable,
} from "@workspace/db";
import {
  ListProspectsQueryParams,
  ListProspectsResponse,
  GetProspectDetailParams,
  GetProspectDetailResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const SORTABLE_COLUMNS = {
  icpFitScore: researchAssessmentsTable.icpFitScore,
  activationScore: researchAssessmentsTable.activationScore,
  enterpriseIntentScore: researchAssessmentsTable.enterpriseIntentScore,
  churnRiskScore: researchAssessmentsTable.churnRiskScore,
  outreachPriority: researchAssessmentsTable.outreachPriority,
  createdAt: peopleTable.signupDate,
} as const;

router.get("/prospects", async (req, res): Promise<void> => {
  const parsed = ListProspectsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { priority, archetype, department, status, eventType, search, sortBy, sortDir } = parsed.data;

  const conditions: SQL[] = [];
  if (priority) conditions.push(eq(researchAssessmentsTable.outreachPriority, priority));
  if (archetype) conditions.push(eq(peopleTable.archetype, archetype));
  if (department) conditions.push(eq(peopleTable.department, department));
  if (status) conditions.push(eq(outreachPackagesTable.status, status));
  if (eventType) {
    conditions.push(
      sql`exists (select 1 from ${productEventsTable} pe where pe.person_id = ${peopleTable.id} and pe.event_name = ${eventType})`,
    );
  }
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        ilike(peopleTable.firstName, like),
        ilike(peopleTable.lastName, like),
        ilike(companiesTable.name, like),
        ilike(peopleTable.title, like),
      )!,
    );
  }

  const orderColumn = SORTABLE_COLUMNS[sortBy ?? "createdAt"];
  const orderFn = sortDir === "asc" ? asc : desc;

  const rows = await db
    .select({
      personId: peopleTable.id,
      firstName: peopleTable.firstName,
      lastName: peopleTable.lastName,
      title: peopleTable.title,
      department: peopleTable.department,
      companyId: companiesTable.id,
      companyName: companiesTable.name,
      archetype: peopleTable.archetype,
      icpFitScore: researchAssessmentsTable.icpFitScore,
      activationScore: researchAssessmentsTable.activationScore,
      enterpriseIntentScore: researchAssessmentsTable.enterpriseIntentScore,
      churnRiskScore: researchAssessmentsTable.churnRiskScore,
      outreachPriority: researchAssessmentsTable.outreachPriority,
      outreachStatus: outreachPackagesTable.status,
      triggeredEventTypes: sql<string[]>`coalesce((
        select array_agg(distinct pe.event_name)
        from ${productEventsTable} pe
        where pe.person_id = ${peopleTable.id}
      ), '{}')`,
    })
    .from(peopleTable)
    .innerJoin(companiesTable, eq(peopleTable.companyId, companiesTable.id))
    .innerJoin(researchAssessmentsTable, eq(researchAssessmentsTable.personId, peopleTable.id))
    .leftJoin(outreachPackagesTable, eq(outreachPackagesTable.personId, peopleTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderFn(orderColumn));

  res.json(ListProspectsResponse.parse(rows));
});

router.get("/prospects/:personId", async (req, res): Promise<void> => {
  const params = GetProspectDetailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { personId } = params.data;

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, personId));
  if (!person) {
    res.status(404).json({ error: "Prospect not found" });
    return;
  }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, person.companyId));
  if (!company) {
    res.status(404).json({ error: "Company not found for prospect" });
    return;
  }

  const [events, [behavioralTrail], [researchAssessment], [outreachPackage]] = await Promise.all([
    db
      .select()
      .from(productEventsTable)
      .where(eq(productEventsTable.personId, personId))
      .orderBy(asc(productEventsTable.occurredAt)),
    db.select().from(behavioralTrailsTable).where(eq(behavioralTrailsTable.personId, personId)),
    db.select().from(researchAssessmentsTable).where(eq(researchAssessmentsTable.personId, personId)),
    db
      .select()
      .from(outreachPackagesTable)
      .where(eq(outreachPackagesTable.personId, personId))
      .orderBy(desc(outreachPackagesTable.createdAt))
      .limit(1),
  ]);

  if (!behavioralTrail || !researchAssessment) {
    req.log.error({ personId }, "Prospect missing trail or assessment");
    res.status(404).json({ error: "Prospect data incomplete" });
    return;
  }

  const data = GetProspectDetailResponse.parse({
    person,
    company,
    events,
    behavioralTrail,
    researchAssessment,
    outreachPackage: outreachPackage ?? null,
  });
  res.json(data);
});

export default router;
