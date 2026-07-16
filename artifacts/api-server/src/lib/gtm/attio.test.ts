/**
 * Unit tests for syncGtmSignalToAttio — specifically the create-vs-patch
 * deduplication logic that prevents duplicate Attio records on re-sync.
 *
 * All Attio API calls are mocked so these tests run without a live key.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Company, Person, GtmSignal, GenerativeAiEmail } from "@workspace/db";

// ---------------------------------------------------------------------------
// Hoisted declarations — these run before vi.mock factories are evaluated
// ---------------------------------------------------------------------------

const {
  MockAttioApiError,
  mockUpsertAttioRecord,
  mockCreateAttioRecord,
  mockPatchAttioRecord,
  mockCreateAttioListEntry,
} = vi.hoisted(() => {
  class MockAttioApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly body: unknown,
    ) {
      super(message);
      this.name = "AttioApiError";
    }
  }

  return {
    MockAttioApiError,
    mockUpsertAttioRecord: vi.fn(),
    mockCreateAttioRecord: vi.fn(),
    mockPatchAttioRecord: vi.fn(),
    mockCreateAttioListEntry: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mock the Attio client module before importing the subject under test
// ---------------------------------------------------------------------------

vi.mock("./attioClient", () => ({
  AttioApiError: MockAttioApiError,
  GTM_SIGNALS_LIST_ID: "test-list-id",
  upsertAttioRecord: (...args: unknown[]) => mockUpsertAttioRecord(...args),
  createAttioRecord: (...args: unknown[]) => mockCreateAttioRecord(...args),
  patchAttioRecord: (...args: unknown[]) => mockPatchAttioRecord(...args),
  createAttioListEntry: (...args: unknown[]) => mockCreateAttioListEntry(...args),
}));

// Silence logger output during tests
vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import the subject under test AFTER mocks are registered
import { syncGtmSignalToAttio } from "./attio";

// ---------------------------------------------------------------------------
// Helpers — minimal fixtures that satisfy the TypeScript types
// ---------------------------------------------------------------------------

function makeAttioRecordResponse(recordId: string) {
  return {
    data: {
      id: { workspace_id: "ws1", object_id: "obj1", record_id: recordId },
      created_at: "2024-01-01T00:00:00Z",
      web_url: `https://app.attio.com/records/${recordId}`,
      values: {},
    },
  };
}

function makeCompany(overrides?: Partial<Company>): Company {
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
    growthSignal: "Rapid hiring in engineering",
    icpFitScore: 0.9,
    createdAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makePerson(overrides?: Partial<Person>): Person {
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
    ...overrides,
  };
}

function makeGtmSignal(overrides?: Partial<GtmSignal>): GtmSignal {
  return {
    id: 42,
    personId: 1,
    companyId: 1,
    batch: "batch_test",
    sourceSignal: "SSO research spike",
    behavioralTrail: ["Visited SSO docs", "Opened pricing page"],
    behaviorSummary: "Exploring enterprise auth",
    researchNotes: "High intent around SSO",
    authProblemAngle: "enterprise SSO/SAML",
    outreachAngle: "enterprise features",
    hypothesisVersion: "v1",
    promptVersion: "v1",
    outreachEmailSubject: "Subject",
    outreachEmailBody: "Body",
    agentConfidence: "high",
    status: "Ready",
    exportedToAttio: false,
    attioSyncStatus: "not_synced",
    attioCompanyRecordId: null,
    attioPersonRecordId: null,
    attioGtmSignalRecordId: null,
    attioPersonWebUrl: null,
    attioSyncError: null,
    attioSyncedAt: null,
    generationStatus: "complete",
    generationError: null,
    rejectionFeedback: null,
    createdAt: new Date("2024-01-15"),
    ...overrides,
  };
}

function makeEmail(overrides?: Partial<GenerativeAiEmail>): GenerativeAiEmail {
  return {
    id: 10,
    gtmSignalId: 42,
    subject: "Unlock enterprise SSO for Acme",
    body: "Hi Alice, ...",
    emailVersion: 1,
    agentConfidence: "high",
    attioEmailRecordId: null,
    attioSyncStatus: "not_synced",
    attioSyncError: null,
    createdAt: new Date("2024-01-15"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: env key present
  process.env.ATTIO_API_KEY = "test-key";

  // Default happy-path responses
  mockUpsertAttioRecord
    .mockResolvedValueOnce(makeAttioRecordResponse("company-record-id"))
    .mockResolvedValueOnce(makeAttioRecordResponse("person-record-id"));

  mockCreateAttioRecord.mockResolvedValue(makeAttioRecordResponse("new-record-id"));
  mockPatchAttioRecord.mockResolvedValue(makeAttioRecordResponse("existing-record-id"));
  mockCreateAttioListEntry.mockResolvedValue({ data: { id: { entry_id: "entry-1" } } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("syncGtmSignalToAttio — deduplication (GTM Signal record)", () => {
  it("calls createAttioRecord for the GTM Signal on first sync (no existing record ID)", async () => {
    const signal = makeGtmSignal({ attioGtmSignalRecordId: null });

    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: signal,
    });

    expect(result.ok).toBe(true);
    expect(mockCreateAttioRecord).toHaveBeenCalledTimes(1);
    expect(mockCreateAttioRecord).toHaveBeenCalledWith(
      "gtm_signals",
      expect.objectContaining({ gtm_signal_title: "SSO research spike" }),
    );
    expect(mockPatchAttioRecord).not.toHaveBeenCalled();
  });

  it("calls patchAttioRecord for the GTM Signal on re-sync (existing record ID is set)", async () => {
    const signal = makeGtmSignal({ attioGtmSignalRecordId: "existing-gtm-record-id" });

    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: signal,
    });

    expect(result.ok).toBe(true);
    expect(mockPatchAttioRecord).toHaveBeenCalledWith(
      "gtm_signals",
      "existing-gtm-record-id",
      expect.objectContaining({ gtm_signal_title: "SSO research spike" }),
    );
    // createAttioRecord should NOT have been called for the GTM Signal
    expect(mockCreateAttioRecord).not.toHaveBeenCalledWith(
      "gtm_signals",
      expect.anything(),
    );
  });

  it("returns the existing record ID (not a new one) when patching the GTM Signal", async () => {
    mockPatchAttioRecord.mockResolvedValue(makeAttioRecordResponse("existing-gtm-record-id"));
    const signal = makeGtmSignal({ attioGtmSignalRecordId: "existing-gtm-record-id" });

    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: signal,
    });

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.gtmSignalRecordId).toBe("existing-gtm-record-id");
    }
  });
});

describe("syncGtmSignalToAttio — deduplication (Generative AI Email record)", () => {
  it("calls createAttioRecord for the email on first sync (no existing email record ID)", async () => {
    const signal = makeGtmSignal({ attioGtmSignalRecordId: null });
    const email = makeEmail({ attioEmailRecordId: null });

    await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: signal,
      generativeAiEmail: email,
    });

    expect(mockCreateAttioRecord).toHaveBeenCalledWith(
      "generative_ai_emails",
      expect.objectContaining({ subject: "Unlock enterprise SSO for Acme" }),
    );
    expect(mockPatchAttioRecord).not.toHaveBeenCalledWith(
      "generative_ai_emails",
      expect.anything(),
      expect.anything(),
    );
  });

  it("calls patchAttioRecord for the email on re-sync (existing email record ID is set)", async () => {
    // Signal already has a record, email also has one
    const signal = makeGtmSignal({ attioGtmSignalRecordId: "existing-gtm-id" });
    const email = makeEmail({ attioEmailRecordId: "existing-email-id" });

    await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: signal,
      generativeAiEmail: email,
    });

    expect(mockPatchAttioRecord).toHaveBeenCalledWith(
      "generative_ai_emails",
      "existing-email-id",
      expect.objectContaining({ subject: "Unlock enterprise SSO for Acme" }),
    );
    expect(mockCreateAttioRecord).not.toHaveBeenCalledWith(
      "generative_ai_emails",
      expect.anything(),
    );
  });

  it("skips email sync entirely when no generativeAiEmail is provided", async () => {
    await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: makeGtmSignal(),
    });

    expect(mockCreateAttioRecord).not.toHaveBeenCalledWith(
      "generative_ai_emails",
      expect.anything(),
    );
    expect(mockPatchAttioRecord).not.toHaveBeenCalledWith(
      "generative_ai_emails",
      expect.anything(),
      expect.anything(),
    );
  });

  it("skips email sync when email has no subject", async () => {
    const email = makeEmail({ subject: "" });

    await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: makeGtmSignal(),
      generativeAiEmail: email,
    });

    expect(mockCreateAttioRecord).not.toHaveBeenCalledWith(
      "generative_ai_emails",
      expect.anything(),
    );
  });
});

describe("syncGtmSignalToAttio — 404 fallback (deleted record recovery)", () => {
  it("falls back to CREATE when patchAttioRecord returns 404 for GTM Signal", async () => {
    mockPatchAttioRecord.mockRejectedValueOnce(
      new MockAttioApiError("Not found", 404, {}),
    );
    mockCreateAttioRecord.mockResolvedValueOnce(makeAttioRecordResponse("re-created-gtm-id"));

    const signal = makeGtmSignal({ attioGtmSignalRecordId: "stale-record-id" });

    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: signal,
    });

    expect(result.ok).toBe(true);
    expect(mockCreateAttioRecord).toHaveBeenCalledWith(
      "gtm_signals",
      expect.objectContaining({ gtm_signal_title: "SSO research spike" }),
    );
    if (result.ok === true) {
      expect(result.gtmSignalRecordId).toBe("re-created-gtm-id");
    }
  });

  it("falls back to CREATE when patchAttioRecord returns 404 for email", async () => {
    // GTM signal patch succeeds; email patch returns 404
    mockPatchAttioRecord
      .mockResolvedValueOnce(makeAttioRecordResponse("existing-gtm-id")) // GTM Signal patch
      .mockRejectedValueOnce(new MockAttioApiError("Not found", 404, {})); // email patch

    mockCreateAttioRecord.mockResolvedValueOnce(makeAttioRecordResponse("re-created-email-id"));

    const signal = makeGtmSignal({ attioGtmSignalRecordId: "existing-gtm-id" });
    const email = makeEmail({ attioEmailRecordId: "stale-email-id" });

    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: signal,
      generativeAiEmail: email,
    });

    expect(result.ok).toBe(true);
    expect(mockCreateAttioRecord).toHaveBeenCalledWith(
      "generative_ai_emails",
      expect.objectContaining({ subject: "Unlock enterprise SSO for Acme" }),
    );
    if (result.ok === true) {
      expect(result.emailRecordId).toBe("re-created-email-id");
    }
  });

  it("does NOT fall back to CREATE when patchAttioRecord returns a non-404 error for GTM Signal", async () => {
    mockPatchAttioRecord.mockRejectedValueOnce(
      new MockAttioApiError("Internal Server Error", 500, {}),
    );

    const signal = makeGtmSignal({ attioGtmSignalRecordId: "existing-gtm-id" });

    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: signal,
    });

    // Should be partial or failure, not success
    expect(result.ok).not.toBe(true);
    // createAttioRecord should NOT have been called for the GTM signal
    expect(mockCreateAttioRecord).not.toHaveBeenCalledWith(
      "gtm_signals",
      expect.anything(),
    );
  });
});

describe("syncGtmSignalToAttio — list entry (step 5)", () => {
  it("calls createAttioListEntry exactly once per sync invocation", async () => {
    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: makeGtmSignal(),
    });

    expect(result.ok).toBe(true);
    expect(mockCreateAttioListEntry).toHaveBeenCalledTimes(1);
    expect(mockCreateAttioListEntry).toHaveBeenCalledWith(
      "test-list-id",
      "people",
      "person-record-id",
    );
  });

  it("returns ok:true when Attio returns 409 (person already in list)", async () => {
    mockCreateAttioListEntry.mockRejectedValueOnce(
      new MockAttioApiError("Conflict — duplicate list entry", 409, {}),
    );

    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: makeGtmSignal(),
    });

    // A 409 from the list-entry step means the person is already a member —
    // the sync goal is satisfied, so the overall result must be ok:true.
    expect(result.ok).toBe(true);
    expect(mockCreateAttioListEntry).toHaveBeenCalledTimes(1);
  });

  it("returns ok:'partial' when Attio returns a non-409 error on the list entry step", async () => {
    mockCreateAttioListEntry.mockRejectedValueOnce(
      new MockAttioApiError("Internal Server Error", 500, {}),
    );

    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: makeGtmSignal(),
    });

    // A non-409 error on the list-entry step is a genuine failure, but
    // records 1–4 have already been written — return partial so callers
    // can persist those IDs without losing them.
    expect(result.ok).toBe("partial");
    if (result.ok === "partial") {
      expect(result.error).toMatch(/500/);
      // The IDs from steps 1–4 must be preserved in the partial result
      expect(result.companyRecordId).toBe("company-record-id");
      expect(result.personRecordId).toBe("person-record-id");
    }
  });
});

describe("syncGtmSignalToAttio — early exit", () => {
  it("returns ok:false when ATTIO_API_KEY is not set", async () => {
    delete process.env.ATTIO_API_KEY;

    const result = await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: makeGtmSignal(),
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/ATTIO_API_KEY/);
    }
    expect(mockUpsertAttioRecord).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mapAuthProblemAngle — tested indirectly via auth_problem_angle in the GTM
// Signal payload sent to createAttioRecord / patchAttioRecord.
// ---------------------------------------------------------------------------

describe("mapAuthProblemAngle — exact matches pass through unchanged", () => {
  it.each([
    "multi-tenancy & orgs",
    "billing structure",
    "authentication",
    "enterprise SSO/SAML",
  ] as const)(
    "maps '%s' to itself",
    async (angle) => {
      const signal = makeGtmSignal({ attioGtmSignalRecordId: null, authProblemAngle: angle });

      await syncGtmSignalToAttio({
        company: makeCompany(),
        person: makePerson(),
        gtmSignal: signal,
      });

      expect(mockCreateAttioRecord).toHaveBeenCalledWith(
        "gtm_signals",
        expect.objectContaining({ auth_problem_angle: [angle] }),
      );
    },
  );
});

// ---------------------------------------------------------------------------
// mapAuthProblemAngle — fuzzy near-miss mapping (table-driven)
//
// Near-miss strings are drawn directly from the prompt description text in
// llm.ts so the test suite stays coupled to the actual prompt wording and
// catches regressions when either the prompt or the keyword list changes.
//
// Each angle bucket has ≥ 3 near-miss strings. The final table section
// covers completely unrelated strings that must always fall back to the
// safe default "authentication".
// ---------------------------------------------------------------------------

describe("mapAuthProblemAngle — fuzzy near-miss mapping (table-driven)", () => {
  // Helper: run a sync with a custom authProblemAngle and return the first
  // auth_problem_angle value the GTM Signal was written with.
  async function mapAngle(raw: string | null): Promise<string> {
    vi.clearAllMocks();
    mockUpsertAttioRecord
      .mockResolvedValueOnce(makeAttioRecordResponse("company-record-id"))
      .mockResolvedValueOnce(makeAttioRecordResponse("person-record-id"));
    mockCreateAttioRecord.mockResolvedValue(makeAttioRecordResponse("new-record-id"));
    mockPatchAttioRecord.mockResolvedValue(makeAttioRecordResponse("existing-record-id"));
    mockCreateAttioListEntry.mockResolvedValue({ data: { id: { entry_id: "entry-1" } } });

    const signal = makeGtmSignal({ attioGtmSignalRecordId: null, authProblemAngle: raw });
    await syncGtmSignalToAttio({
      company: makeCompany(),
      person: makePerson(),
      gtmSignal: signal,
    });

    const call = mockCreateAttioRecord.mock.calls.find(
      ([slug]: [string]) => slug === "gtm_signals",
    );
    expect(call).toBeDefined();
    const [angle] = call![1].auth_problem_angle as string[];
    return angle;
  }

  // --- "enterprise SSO/SAML" near-misses (from prompt: SAML/OIDC SSO, SCIM provisioning,
  //     directory sync, enterprise customers) ---
  it.each([
    // keyword: "sso"
    ["SSO/SAML enterprise (reordered)", "SSO/SAML enterprise"],
    // keyword: "saml"
    ["SAML provisioning", "SAML provisioning"],
    // keyword: "scim"  — drawn from "SCIM provisioning" in the prompt description
    ["SCIM provisioning", "SCIM provisioning"],
    // keyword: "enterprise"  — drawn from "enterprise customers" in the prompt description
    ["enterprise directory sync", "enterprise directory sync"],
  ] as [string, string][])(
    "maps '%s' → 'enterprise SSO/SAML'",
    async (_label, raw) => {
      expect(await mapAngle(raw)).toBe("enterprise SSO/SAML");
    },
  );

  // --- "multi-tenancy & orgs" near-misses (from prompt: workspaces, teams, organizations,
  //     permissions, member invites, role management) ---
  it.each([
    // keyword: "multi-tenant"
    ["multi-tenant architecture", "multi-tenant architecture"],
    // keyword: "org" (substring of "organizations")
    ["org management", "org management"],
    // keyword: "org" — drawn from "organizations" in the prompt description
    ["organizations and workspaces", "organizations and workspaces"],
    // keyword: "org" — drawn from "role management" context in the prompt
    ["org-level role management", "org-level role management"],
  ] as [string, string][])(
    "maps '%s' → 'multi-tenancy & orgs'",
    async (_label, raw) => {
      expect(await mapAngle(raw)).toBe("multi-tenancy & orgs");
    },
  );

  // --- "billing structure" near-misses (from prompt: subscription tiers, seat-based
  //     pricing, entitlement gating) ---
  it.each([
    // keyword: "subscription" — drawn from "subscription tiers" in the prompt
    ["subscription tiers", "subscription tiers"],
    // keyword: "entitlement" — drawn from "entitlement gating" in the prompt
    ["entitlement gating check", "entitlement gating check"],
    // keyword: "billing"
    ["billing integration layer", "billing integration layer"],
    // keyword: "subscription" — drawn from "subscription entitlement" (combined near-miss)
    ["subscription entitlement", "subscription entitlement"],
  ] as [string, string][])(
    "maps '%s' → 'billing structure'",
    async (_label, raw) => {
      expect(await mapAngle(raw)).toBe("billing structure");
    },
  );

  // --- "authentication" fallback — completely unrelated strings with NO keyword match.
  //     These are drawn from the "authentication" prompt description (MFA, passwordless,
  //     social providers, sessions) which intentionally share no keywords with the other
  //     three buckets, so they must always land on the safe default. ---
  it.each([
    // From prompt: "sign-up/login flows, sessions, MFA, social providers, or passwordless"
    ["MFA setup (no bucket keyword)", "MFA setup"],
    ["passwordless login flow (no bucket keyword)", "passwordless login flow"],
    ["social provider integration (no bucket keyword)", "social provider integration"],
    // Completely unrelated — no bucket keyword at all
    ["totally unrelated string", "totally unrelated xyz string"],
    // null / undefined inputs
    ["null authProblemAngle", null],
  ] as [string, string | null][])(
    "maps '%s' → 'authentication' (safe default)",
    async (_label, raw) => {
      expect(await mapAngle(raw)).toBe("authentication");
    },
  );
});
