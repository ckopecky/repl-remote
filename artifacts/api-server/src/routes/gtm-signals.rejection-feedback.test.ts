/**
 * Tests: rejection feedback round-trips through the API
 *
 * Verifies:
 * 1. PATCH with feedback → response includes non-null rejectionFeedback
 * 2. PATCH with empty string → response field is null (not "")
 * 3. GET /gtm-signals list → rejectionFeedback surfaces on a rejected signal
 * 4. GET /gtm-signals list → null when no feedback was given
 * 5. DB update payload reflects the expected rejectionFeedback value
 *
 * All DB calls are mocked; no live database required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// Hoisted mock stubs — evaluated before vi.mock() factories run
// ---------------------------------------------------------------------------

const { mockDbSelect, mockDbUpdate, mockDbInsert } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDbSelect: vi.fn((..._args: unknown[]): any => undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDbUpdate: vi.fn((..._args: unknown[]): any => undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDbInsert: vi.fn((..._args: unknown[]): any => undefined),
}));

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
  researchAssessmentsTable: { id: "id", personId: "personId", outreachPriority: "outreachPriority" },
}));

// Silence pino logger during tests
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub attio and llm so helpers don't throw if accidentally called
vi.mock("../lib/gtm/attio", () => ({
  buildAttioExportPreview: vi.fn(),
  syncGtmSignalToAttio: vi.fn(),
}));
vi.mock("../lib/gtm/llm", () => ({
  generateOutreachContent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import subject AFTER mocks are registered
// ---------------------------------------------------------------------------

import gtmSignalsRouter from "./gtm-signals";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal gtm_signal row returned from the DB. */
function makeSignalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    personId: 1,
    companyId: 1,
    sourceSignal: "Fast activation",
    behavioralTrail: ["Logged in", "Invited teammate"],
    behaviorSummary: "Quick activation",
    researchNotes: "Strong ICP fit",
    authProblemAngle: null,
    outreachAngle: "Speed to value",
    hypothesisVersion: "v1",
    promptVersion: "v1",
    status: "Needs Review",
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
    outreachEmailBody: "Hi Alice,\n\nLooking forward to connecting.",
    rejectionFeedback: null,
    batch: "batch_test",
    createdAt: new Date("2024-01-01T00:00:00Z"),
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
 * Returns a chainable object that resolves to `rows` when awaited.
 * Covers the .from().innerJoin().where().orderBy() chain used by selects.
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
 * Returns a chainable object for update().set().where().returning() — resolves to `rows`.
 * Captures the `set()` argument for payload assertions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeUpdateChain(rows: unknown[]): { chain: any; capturedSet: { payload: unknown } } {
  const capturedSet = { payload: undefined as unknown };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// PATCH /gtm-signals/:id — rejectionFeedback persistence
// ===========================================================================

describe("PATCH /gtm-signals/:id — rejectionFeedback persistence", () => {
  it("returns the feedback string and writes it to the DB when non-empty feedback is provided", async () => {
    const feedback = "Too generic — mention their recent funding round.";
    const existingSignal = makeSignalRow({ status: "Needs Review" });
    const updatedSignal = makeSignalRow({ status: "Rejected", rejectionFeedback: feedback });

    const { chain: updateChain, capturedSet } = makeUpdateChain([updatedSignal]);
    mockDbSelect.mockReturnValueOnce(makeSelectChain([existingSignal]));
    mockDbUpdate.mockReturnValueOnce(updateChain);

    const res = await request(buildApp())
      .patch("/gtm-signals/42")
      .send({ status: "Rejected", rejectionFeedback: feedback })
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.rejectionFeedback).toBe(feedback);
    expect(res.body.status).toBe("Rejected");

    // Confirm the DB update payload carries the feedback string
    expect(capturedSet.payload).toMatchObject({ rejectionFeedback: feedback });
  });

  it("stores null (not '') when an empty string is submitted as feedback", async () => {
    const existingSignal = makeSignalRow({ status: "Needs Review" });
    const updatedSignal = makeSignalRow({ status: "Rejected", rejectionFeedback: null });

    const { chain: updateChain, capturedSet } = makeUpdateChain([updatedSignal]);
    mockDbSelect.mockReturnValueOnce(makeSelectChain([existingSignal]));
    mockDbUpdate.mockReturnValueOnce(updateChain);

    const res = await request(buildApp())
      .patch("/gtm-signals/42")
      .send({ status: "Rejected", rejectionFeedback: "" })
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    // Empty string must coerce to null — not persist as ""
    expect(res.body.rejectionFeedback).toBeNull();

    // The route converts "" → null before writing to the DB
    expect(capturedSet.payload).toMatchObject({ rejectionFeedback: null });
  });

  it("does NOT overwrite existing feedback when rejectionFeedback is omitted from the body", async () => {
    const existingSignal = makeSignalRow({
      status: "Rejected",
      rejectionFeedback: "Needs a better hook.",
    });
    const updatedSignal = makeSignalRow({
      status: "Paused",
      rejectionFeedback: "Needs a better hook.",
    });

    const { chain: updateChain, capturedSet } = makeUpdateChain([updatedSignal]);
    mockDbSelect.mockReturnValueOnce(makeSelectChain([existingSignal]));
    mockDbUpdate.mockReturnValueOnce(updateChain);

    const res = await request(buildApp())
      .patch("/gtm-signals/42")
      .send({ status: "Paused" })
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    // Response reflects what was returned from DB (preserved value)
    expect(res.body.rejectionFeedback).toBe("Needs a better hook.");

    // The DB update payload must NOT contain a rejectionFeedback key when
    // the field was not provided in the request body
    expect(capturedSet.payload).not.toHaveProperty("rejectionFeedback");
  });

  it("stores null when rejectionFeedback is undefined (field absent from body)", async () => {
    const existingSignal = makeSignalRow({ status: "Needs Review" });
    const updatedSignal = makeSignalRow({ status: "Rejected", rejectionFeedback: null });

    const { chain: updateChain, capturedSet } = makeUpdateChain([updatedSignal]);
    mockDbSelect.mockReturnValueOnce(makeSelectChain([existingSignal]));
    mockDbUpdate.mockReturnValueOnce(updateChain);

    const res = await request(buildApp())
      .patch("/gtm-signals/42")
      .send({ status: "Rejected" })
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.rejectionFeedback).toBeNull();

    // rejectionFeedback is not in the update payload (undefined means omitted)
    expect(capturedSet.payload).not.toHaveProperty("rejectionFeedback");
  });
});

// ===========================================================================
// GET /gtm-signals — rejectionFeedback surfaces in the list response
// ===========================================================================

describe("GET /gtm-signals — rejectionFeedback surfaces in the list response", () => {
  /** Build the multi-join row shape the SELECT query produces. */
  function makeJoinRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 42,
      personId: 1,
      personName: "Alice",    // peopleTable.firstName alias
      lastName: "Smith",
      companyId: 1,
      companyName: "Acme Corp",
      sourceSignal: "Fast activation",
      outreachPriority: "High",
      outreachAngle: "Speed to value",
      authProblemAngle: null,
      status: "Rejected",
      attioSyncStatus: "not_synced",
      attioPersonWebUrl: null,
      attioSyncError: null,
      generationStatus: "generated",
      generationError: null,
      rejectionFeedback: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      ...overrides,
    };
  }

  it("includes non-null rejectionFeedback for a rejected signal", async () => {
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeJoinRow({ rejectionFeedback: "Too generic." })]),
    );

    const res = await request(buildApp())
      .get("/gtm-signals")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].rejectionFeedback).toBe("Too generic.");
  });

  it("returns null rejectionFeedback when no feedback was ever stored", async () => {
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([makeJoinRow({ status: "Needs Review", rejectionFeedback: null })]),
    );

    const res = await request(buildApp())
      .get("/gtm-signals")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body[0].rejectionFeedback).toBeNull();
  });

  it("returns rejectionFeedback for every item in a mixed list", async () => {
    const rows = [
      makeJoinRow({ id: 1, rejectionFeedback: "Needs a better hook.", status: "Rejected" }),
      makeJoinRow({ id: 2, rejectionFeedback: null, status: "Needs Review" }),
      makeJoinRow({ id: 3, rejectionFeedback: "Too long.", status: "Rejected" }),
    ];
    mockDbSelect.mockReturnValueOnce(makeSelectChain(rows));

    const res = await request(buildApp())
      .get("/gtm-signals")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].rejectionFeedback).toBe("Needs a better hook.");
    expect(res.body[1].rejectionFeedback).toBeNull();
    expect(res.body[2].rejectionFeedback).toBe("Too long.");
  });
});

// ===========================================================================
// PATCH /gtm-signals/:id — input validation and error handling
// ===========================================================================

describe("PATCH /gtm-signals/:id — input validation and error handling", () => {
  it("returns 400 when status is omitted from the request body", async () => {
    const res = await request(buildApp())
      .patch("/gtm-signals/42")
      .send({ rejectionFeedback: "Some feedback" })
      .set("Accept", "application/json");

    expect(res.status).toBe(400);
  });

  it("returns 400 when status is an unrecognised value", async () => {
    const res = await request(buildApp())
      .patch("/gtm-signals/42")
      .send({ status: "NotARealStatus" })
      .set("Accept", "application/json");

    expect(res.status).toBe(400);
  });

  it("returns 404 when the signal does not exist", async () => {
    // select returns empty array → signal not found
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const res = await request(buildApp())
      .patch("/gtm-signals/999")
      .send({ status: "Rejected" })
      .set("Accept", "application/json");

    expect(res.status).toBe(404);
  });
});
