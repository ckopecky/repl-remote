/**
 * Tests: POST /gtm-signals/:id/generate — rejection-feedback round-trip
 *
 * Verifies that runGeneration():
 * 1. Passes previousEmailSubject, previousEmailBody, and rejectionFeedback to
 *    generateOutreachContent when the signal has stored rejection feedback.
 * 2. Clears rejectionFeedback (sets it to null) on the saved signal after a
 *    successful generation.
 * 3. Preserves rejectionFeedback when generation fails (does not clear it).
 *
 * All DB calls and the LLM are mocked; no live database or API key required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// Hoisted stubs — evaluated before vi.mock() factories run
// ---------------------------------------------------------------------------

const { mockDbSelect, mockDbUpdate, mockDbInsert, mockGenerateOutreachContent } = vi.hoisted(
  () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDbSelect: vi.fn((..._args: unknown[]): any => undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDbUpdate: vi.fn((..._args: unknown[]): any => undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDbInsert: vi.fn((..._args: unknown[]): any => undefined),
    mockGenerateOutreachContent: vi.fn(),
  }),
);

// ---------------------------------------------------------------------------
// Mock @workspace/db before the route module is imported
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (...args: any[]) => mockDbSelect(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (...args: any[]) => mockDbUpdate(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insert: (...args: any[]) => mockDbInsert(...args),
  },
  gtmSignalsTable: {
    id: "id",
    personId: "personId",
    companyId: "companyId",
    status: "status",
    rejectionFeedback: "rejectionFeedback",
    createdAt: "createdAt",
  },
  generativeAiEmailsTable: {
    id: "id",
    gtmSignalId: "gtmSignalId",
    emailVersion: "emailVersion",
    attioEmailRecordId: "attioEmailRecordId",
    attioSyncStatus: "attioSyncStatus",
    attioSyncError: "attioSyncError",
  },
  peopleTable: { id: "id", firstName: "firstName", lastName: "lastName", companyId: "companyId" },
  companiesTable: { id: "id", name: "name" },
  behavioralTrailsTable: { id: "id", personId: "personId" },
  researchAssessmentsTable: {
    id: "id",
    personId: "personId",
    outreachPriority: "outreachPriority",
  },
}));

// Silence pino logger during tests
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub attio so runAttioSync never runs in these tests
vi.mock("../lib/gtm/attio", () => ({
  buildAttioExportPreview: vi.fn(),
  syncGtmSignalToAttio: vi.fn(),
}));

// Mock the LLM — we control its return value per test
vi.mock("../lib/gtm/llm", () => ({
  generateOutreachContent: (...args: unknown[]) => mockGenerateOutreachContent(...args),
}));

// ---------------------------------------------------------------------------
// Import subject AFTER mocks are registered
// ---------------------------------------------------------------------------

import gtmSignalsRouter from "./gtm-signals";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal gtm_signal row with stored rejection feedback. */
function makeSignalWithFeedback(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    personId: 1,
    companyId: 1,
    sourceSignal: "Fast activation",
    behavioralTrail: ["Logged in", "Invited teammate"],
    behaviorSummary: "Quick activation",
    researchNotes: "Strong ICP fit",
    authProblemAngle: "authentication",
    outreachAngle: "Speed to value",
    hypothesisVersion: "v1",
    promptVersion: "v1",
    status: "Rejected",
    exportedToAttio: false,
    attioSyncStatus: "not_synced",
    attioCompanyRecordId: null,
    attioPersonRecordId: null,
    attioGtmSignalRecordId: null,
    attioPersonWebUrl: null,
    attioSyncError: null,
    attioSyncedAt: null,
    generationStatus: "generated",
    generationError: null,
    agentConfidence: "high",
    outreachEmailSubject: "Enterprise auth for Acme",
    outreachEmailBody: "Hi Alice,\n\nLooking forward to connecting.\n\nAlex",
    // Non-null feedback triggers the previous-draft lookup
    rejectionFeedback: "Too generic — mention their recent SSO research.",
    batch: "batch_test",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Minimal person row. */
function makePersonRow() {
  return {
    id: 1,
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@acme.com",
    profileUrl: "https://linkedin.com/in/alice",
    title: "CTO",
    department: "engineering",
    seniority: "executive",
    persona: "technical implementer",
    purchaseRole: "decision maker",
    startDate: new Date("2023-01-01"),
    companyId: 1,
    archetype: "builder",
    contactPriority: "high",
    signupDate: new Date("2023-06-01"),
    lifecycleStage: "activated",
  };
}

/** Minimal company row. */
function makeCompanyRow() {
  return {
    id: 1,
    name: "Acme Corp",
    domain: "acme.com",
    industry: ["SaaS"],
    employeeCount: 50,
    employeeRange: "11-50",
    fundingStage: "series A",
    latestFundingDate: null,
    fundingAmount: null,
    headquarters: "San Francisco",
    productCategory: ["developer tools"],
    technologyContext: ["Node.js"],
    growthSignal: "Rapid hiring",
    icpFitScore: 0.9,
    createdAt: new Date("2024-01-01"),
  };
}

/** Minimal previous email draft row. */
function makePreviousEmailRow() {
  return {
    id: 10,
    gtmSignalId: 42,
    subject: "enterprise auth for acme",
    body: "Hi Alice,\n\nWanted to reach out about your auth stack.\n\nAlex",
    emailVersion: 1,
    agentConfidence: "high",
    attioEmailRecordId: null,
    attioSyncStatus: "not_synced",
    attioSyncError: null,
    createdAt: new Date("2024-01-01"),
  };
}

/** A successful LLM generation result. */
function makeSuccessResult() {
  return {
    ok: true as const,
    content: {
      verdictReason: "Reach out now — clear SSO signal",
      confidence: "high" as const,
      outreachAngle: "Enterprise SSO readiness",
      authProblemAngle: "enterprise SSO/SAML",
      researchSummary: "Company shows strong enterprise intent.",
      emailSubject: "sso for acme",
      emailBody: "Hi Alice,\n\nNoticed your team has been exploring SSO options.\n\nAlex",
    },
  };
}

/** A failed LLM generation result. */
function makeFailureResult() {
  return {
    ok: false as const,
    error: "Model timeout",
  };
}

/** Minimal saved signal row returned after the DB update (success path). */
function makeSavedSignalRow(overrides: Record<string, unknown> = {}) {
  return {
    ...makeSignalWithFeedback(),
    generationStatus: "generated",
    generationError: null,
    rejectionFeedback: null,
    status: "Needs Review",
    ...overrides,
  };
}

/** Build a minimal Express app that mounts the router (no pino-http). */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(gtmSignalsRouter);
  return app;
}

/**
 * Chainable select stub that resolves to `rows` when awaited.
 * Covers .from().where().orderBy().limit() and multi-join chains.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSelectChain(rows: unknown[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const m of ["from", "innerJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  chain.catch = (reject: (e: unknown) => unknown) => Promise.resolve(rows).catch(reject);
  return chain;
}

/**
 * Chainable update stub — captures the `set()` payload and resolves to `rows`.
 * Returns the captured-set box so callers can inspect it after the route runs.
 */
function makeUpdateChain(rows: unknown[]): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain: any;
  /** Inspect `.payload` after the route has run to see what was written. */
  capturedSet: { payload: unknown };
} {
  const capturedSet: { payload: unknown } = { payload: undefined };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.set = (payload: unknown) => {
    capturedSet.payload = payload;
    return chain;
  };
  chain.where = () => chain;
  chain.returning = () => ({
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (reject: (e: unknown) => unknown) => Promise.resolve(rows).catch(reject),
  });
  return { chain, capturedSet };
}

/**
 * Chainable insert stub — swallows .values() and resolves to `rows`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeInsertChain(rows: unknown[] = []): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.values = () => chain;
  chain.returning = () => ({
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (reject: (e: unknown) => unknown) => Promise.resolve(rows).catch(reject),
  });
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  chain.catch = (reject: (e: unknown) => unknown) => Promise.resolve(rows).catch(reject);
  return chain;
}

/**
 * Wire DB mock calls for POST /gtm-signals/:id/generate when the signal has
 * stored rejection feedback — success path.
 *
 * Select call order inside the route + runGeneration:
 *   1. Route:         fetch signal by id (existence check)
 *   2. runGeneration: fetch signal by id (helper re-reads)
 *   3. runGeneration: fetch person by id
 *   4. runGeneration: fetch company by id
 *   5. runGeneration: fetch latest email (rejectionFeedback is non-null)
 *   6. runGeneration: count existing email versions (always runs, before result check)
 *
 * Returns the capturedSet box so callers can assert on the update payload.
 */
function wireGenerationWithFeedback(
  llmResult: ReturnType<typeof makeSuccessResult> | ReturnType<typeof makeFailureResult>,
  savedRow: Record<string, unknown>,
): { capturedSet: { payload: unknown } } {
  const { chain: updateChain, capturedSet } = makeUpdateChain([savedRow]);

  mockDbSelect
    .mockReturnValueOnce(makeSelectChain([makeSignalWithFeedback()])) // 1. route check
    .mockReturnValueOnce(makeSelectChain([makeSignalWithFeedback()])) // 2. helper signal
    .mockReturnValueOnce(makeSelectChain([makePersonRow()])) // 3. person
    .mockReturnValueOnce(makeSelectChain([makeCompanyRow()])) // 4. company
    .mockReturnValueOnce(makeSelectChain([makePreviousEmailRow()])) // 5. latest email
    .mockReturnValueOnce(makeSelectChain([{ id: 10 }])); // 6. email count (1 row)

  if (llmResult.ok) {
    mockDbInsert.mockReturnValueOnce(makeInsertChain()); // email insert (success only)
  }
  mockDbUpdate.mockReturnValueOnce(updateChain); // signal update

  mockGenerateOutreachContent.mockResolvedValueOnce(llmResult);

  return { capturedSet };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1. generateOutreachContent receives the previous draft and reviewer feedback
// ===========================================================================

describe("POST /gtm-signals/:id/generate — feedback forwarded to LLM", () => {
  it("calls generateOutreachContent with non-null previousEmailSubject when rejectionFeedback is stored", async () => {
    wireGenerationWithFeedback(makeSuccessResult(), makeSavedSignalRow());

    await request(buildApp()).post("/gtm-signals/42/generate").set("Accept", "application/json");

    expect(mockGenerateOutreachContent).toHaveBeenCalledTimes(1);
    const [callArg] = mockGenerateOutreachContent.mock.calls[0] as [Record<string, unknown>];
    expect(callArg.previousEmailSubject).toBe("enterprise auth for acme");
  });

  it("calls generateOutreachContent with non-null previousEmailBody when rejectionFeedback is stored", async () => {
    wireGenerationWithFeedback(makeSuccessResult(), makeSavedSignalRow());

    await request(buildApp()).post("/gtm-signals/42/generate").set("Accept", "application/json");

    const [callArg] = mockGenerateOutreachContent.mock.calls[0] as [Record<string, unknown>];
    expect(typeof callArg.previousEmailBody).toBe("string");
    expect((callArg.previousEmailBody as string).length).toBeGreaterThan(0);
  });

  it("calls generateOutreachContent with the stored rejectionFeedback string", async () => {
    wireGenerationWithFeedback(makeSuccessResult(), makeSavedSignalRow());

    await request(buildApp()).post("/gtm-signals/42/generate").set("Accept", "application/json");

    const [callArg] = mockGenerateOutreachContent.mock.calls[0] as [Record<string, unknown>];
    expect(callArg.rejectionFeedback).toBe("Too generic — mention their recent SSO research.");
  });

  it("does NOT pass previousEmailSubject/Body when rejectionFeedback is null (first generation)", async () => {
    const signalNoFeedback = makeSignalWithFeedback({ rejectionFeedback: null });
    const savedRow = makeSavedSignalRow({ rejectionFeedback: null });
    const { chain: updateChain } = makeUpdateChain([savedRow]);

    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([signalNoFeedback])) // route check
      .mockReturnValueOnce(makeSelectChain([signalNoFeedback])) // helper signal
      .mockReturnValueOnce(makeSelectChain([makePersonRow()])) // person
      .mockReturnValueOnce(makeSelectChain([makeCompanyRow()])) // company
      // No email lookup — rejectionFeedback is null, so the helper skips it
      .mockReturnValueOnce(makeSelectChain([])); // email count

    mockDbInsert.mockReturnValueOnce(makeInsertChain());
    mockDbUpdate.mockReturnValueOnce(updateChain);
    mockGenerateOutreachContent.mockResolvedValueOnce(makeSuccessResult());

    await request(buildApp()).post("/gtm-signals/42/generate").set("Accept", "application/json");

    const [callArg] = mockGenerateOutreachContent.mock.calls[0] as [Record<string, unknown>];
    expect(callArg.previousEmailSubject).toBeUndefined();
    expect(callArg.previousEmailBody).toBeUndefined();
    expect(callArg.rejectionFeedback).toBeUndefined();
  });
});

// ===========================================================================
// 2. rejectionFeedback cleared after successful generation
// ===========================================================================

describe("POST /gtm-signals/:id/generate — rejectionFeedback cleared on success", () => {
  it("sets rejectionFeedback to null in the DB update payload after a successful generation", async () => {
    const { capturedSet } = wireGenerationWithFeedback(makeSuccessResult(), makeSavedSignalRow());

    const res = await request(buildApp())
      .post("/gtm-signals/42/generate")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(capturedSet.payload).toMatchObject({ rejectionFeedback: null });
  });

  it("returns rejectionFeedback as null in the response body after a successful generation", async () => {
    wireGenerationWithFeedback(
      makeSuccessResult(),
      makeSavedSignalRow({ rejectionFeedback: null }),
    );

    const res = await request(buildApp())
      .post("/gtm-signals/42/generate")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.rejectionFeedback).toBeNull();
  });

  it("sets generationStatus to 'generated' in the DB update payload on success", async () => {
    const { capturedSet } = wireGenerationWithFeedback(makeSuccessResult(), makeSavedSignalRow());

    await request(buildApp()).post("/gtm-signals/42/generate").set("Accept", "application/json");

    expect(capturedSet.payload).toMatchObject({ generationStatus: "generated" });
  });
});

// ===========================================================================
// 3. rejectionFeedback preserved when generation fails
// ===========================================================================

describe("POST /gtm-signals/:id/generate — rejectionFeedback preserved on failure", () => {
  it("does NOT include rejectionFeedback in the DB update payload when generation fails", async () => {
    const failedRow = makeSignalWithFeedback({
      generationStatus: "failed",
      generationError: "Model timeout",
    });
    const { capturedSet } = wireGenerationWithFeedback(makeFailureResult(), failedRow);

    await request(buildApp()).post("/gtm-signals/42/generate").set("Accept", "application/json");

    // The failure update must NOT overwrite rejectionFeedback — field absent from payload
    expect(capturedSet.payload).not.toHaveProperty("rejectionFeedback");
  });

  it("sets generationStatus to 'failed' in the DB update payload when generation fails", async () => {
    const failedRow = makeSignalWithFeedback({
      generationStatus: "failed",
      generationError: "Model timeout",
    });
    const { capturedSet } = wireGenerationWithFeedback(makeFailureResult(), failedRow);

    await request(buildApp()).post("/gtm-signals/42/generate").set("Accept", "application/json");

    expect(capturedSet.payload).toMatchObject({
      generationStatus: "failed",
      generationError: "Model timeout",
    });
  });

  it("returns 502 when generation fails", async () => {
    const failedRow = makeSignalWithFeedback({
      generationStatus: "failed",
      generationError: "Model timeout",
    });
    wireGenerationWithFeedback(makeFailureResult(), failedRow);

    const res = await request(buildApp())
      .post("/gtm-signals/42/generate")
      .set("Accept", "application/json");

    expect(res.status).toBe(502);
  });

  it("still calls generateOutreachContent with rejectionFeedback even when it ultimately fails", async () => {
    const failedRow = makeSignalWithFeedback({
      generationStatus: "failed",
      generationError: "Model timeout",
    });
    wireGenerationWithFeedback(makeFailureResult(), failedRow);

    await request(buildApp()).post("/gtm-signals/42/generate").set("Accept", "application/json");

    // The feedback was still forwarded even though the LLM failed to produce a result
    const [callArg] = mockGenerateOutreachContent.mock.calls[0] as [Record<string, unknown>];
    expect(callArg.rejectionFeedback).toBe("Too generic — mention their recent SSO research.");
  });
});
