/**
 * Unit tests for llm.ts — specifically validateContent behaviour when the LLM
 * returns an unexpected authProblemAngle value.
 *
 * All Anthropic API calls are mocked so these tests run without a live key.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Company, Person } from "@workspace/db";
import type { Archetype } from "./constants";

// ---------------------------------------------------------------------------
// Hoisted declarations — must run before vi.mock factories are evaluated
// ---------------------------------------------------------------------------

const { mockCreate, mockLoggerWarn, mockLoggerInfo, mockLoggerError } = vi.hoisted(() => {
  return {
    mockCreate: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerError: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mock the Anthropic integration and logger before importing the subject
// ---------------------------------------------------------------------------

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock("../logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

// Import the subject under test AFTER mocks are registered
import { generateOutreachContent } from "./llm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps a JSON object as the text block Claude would return. */
function makeClaudeResponse(json: object) {
  return {
    content: [{ type: "text", text: JSON.stringify(json) }],
  };
}

/** A fully-valid LLM response payload (all required fields present). */
function makeValidPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verdictReason: "Reach out now — clear SSO signal",
    confidence: "high",
    outreachAngle: "Enterprise SSO readiness",
    authProblemAngle: "enterprise SSO/SAML",
    researchSummary: "Company shows strong enterprise intent with recurring SSO doc visits.",
    emailSubject: "enterprise auth for acme",
    emailBody: "Hi Alice,\n\nLooks like you're exploring SSO.\n\nAlex",
    ...overrides,
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

const MINIMAL_INPUT = {
  company: makeCompany(),
  person: makePerson(),
  archetype: "solo_builder" as Archetype,
  behavioralTrail: ["Visited SSO docs", "Opened pricing page"],
  behaviorSummary: "Exploring enterprise auth features",
  outreachPriority: "high",
  sourceSignal: "SSO research spike",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateOutreachContent — valid authProblemAngle (happy path)", () => {
  it.each([
    "multi-tenancy & orgs",
    "billing structure",
    "authentication",
    "enterprise SSO/SAML",
  ] as const)(
    "accepts '%s' without logging a warning",
    async (angle) => {
      mockCreate.mockResolvedValueOnce(
        makeClaudeResponse(makeValidPayload({ authProblemAngle: angle })),
      );

      const result = await generateOutreachContent(MINIMAL_INPUT);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.content.authProblemAngle).toBe(angle);
      }
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    },
  );
});

describe("generateOutreachContent — unexpected authProblemAngle (warn + preserve)", () => {
  it("logs a warning when the LLM returns an unrecognised authProblemAngle", async () => {
    const unexpectedAngle = "identity management";

    mockCreate.mockResolvedValueOnce(
      makeClaudeResponse(makeValidPayload({ authProblemAngle: unexpectedAngle })),
    );

    await generateOutreachContent(MINIMAL_INPUT);

    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
  });

  it("includes the raw unexpected value in the warning log object", async () => {
    const unexpectedAngle = "identity management";

    mockCreate.mockResolvedValueOnce(
      makeClaudeResponse(makeValidPayload({ authProblemAngle: unexpectedAngle })),
    );

    await generateOutreachContent(MINIMAL_INPUT);

    const [logObj] = mockLoggerWarn.mock.calls[0] as [Record<string, unknown>, string];
    expect(logObj).toMatchObject({ rawAuthProblemAngle: unexpectedAngle });
  });

  it("preserves the raw unexpected value in the returned content (does not replace it)", async () => {
    const unexpectedAngle = "identity management";

    mockCreate.mockResolvedValueOnce(
      makeClaudeResponse(makeValidPayload({ authProblemAngle: unexpectedAngle })),
    );

    const result = await generateOutreachContent(MINIMAL_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.authProblemAngle).toBe(unexpectedAngle);
    }
  });

  it("still returns all other content fields correctly alongside the unexpected angle", async () => {
    const unexpectedAngle = "passwordless auth";

    mockCreate.mockResolvedValueOnce(
      makeClaudeResponse(makeValidPayload({ authProblemAngle: unexpectedAngle })),
    );

    const result = await generateOutreachContent(MINIMAL_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.confidence).toBe("high");
      expect(result.content.verdictReason).toBeTruthy();
      expect(result.content.emailSubject).toBeTruthy();
      expect(result.content.emailBody).toBeTruthy();
    }
  });

  it("handles a whitespace-padded unexpected value: trims it and still warns", async () => {
    const paddedAngle = "  identity management  ";
    const trimmedAngle = "identity management";

    mockCreate.mockResolvedValueOnce(
      makeClaudeResponse(makeValidPayload({ authProblemAngle: paddedAngle })),
    );

    const result = await generateOutreachContent(MINIMAL_INPUT);

    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    // The stored value should be trimmed (validateContent trims all strings)
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.authProblemAngle).toBe(trimmedAngle);
    }
  });
});
