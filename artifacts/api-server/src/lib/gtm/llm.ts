import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { Company, Person } from "@workspace/db";
import type { Archetype } from "./constants";
import { ARCHETYPE_INFO } from "./constants";
import { logger } from "../logger";

const MODEL = "claude-sonnet-4-6";

// Vendor-side ICP & positioning context. Framed generically around the messaging
// guidance already encoded in hypothesis.ts (activation, org/SSO, enterprise signals) --
// this is the perspective of the fictional vendor's growth team, not the prospect.
const ICP_CONTEXT = `
You are reasoning as a product-led growth researcher at an API-first identity & access
infrastructure vendor (auth, sessions, organizations, SSO -- the kind of product an
engineering team buys instead of building in-house).

Best-fit prospects:
- Developer-led or PLG companies with an engineering team making infra decisions
- Building a product with end users who log in, manage accounts, or hit access-controlled features
- Pre-seed to Series B, small-to-mid engineering team
- Strong-fit moments: fast activation (app created within 24h of signup), enabling an
  organization and inviting teammates, repeated SSO documentation views, or an
  enterprise/pricing page visit alongside SSO research

Weaker fit / lower urgency:
- Solo builder with no team or enterprise signal yet -- worth a light note, not a sales push
- High employee count (500+) without any observed product signal
- Integration errors followed by inactivity -- may be blocked on setup, not uninterested
- Long dormancy with no return -- treat as low urgency unless they've come back

The posture is product researcher, not seller. A "no, not right now" is a useful, welcome
answer. Curiosity about what they're building is the point; outreach is a side effect.
`.trim();

const EMAIL_VOICE_RULES = `
The reader is an engineer who deletes SDR email on pattern recognition alone. Avoid:
- News openers as fake personalization ("Saw your funding round -- congrats!")
- Discovery questions dressed as curiosity ("Curious what your current setup looks like")
- Pitch disclaimers ("No pitch, just trying to be useful"), "Happy to share what we've seen"
- Feature lists, fake urgency, exclamation points, more than one "happy to" (ideally zero)
- Banned words: seamless, effortless, magical, powerful, robust, world-class, best-in-class,
  industry-leading, next-gen, solution, simply, just, leverage, utilize
- "Worth a 15-min call?" closers

The antidote is honesty and specificity, not cleverer camouflage.

Pick ONE mode based on the account's observed state:
- No real activation yet (no app created, no org enabled): lead with the specific problem
  their stage/stack implies. Product name appears in the first sentence in the context of
  THEIR problem, never as a feature list. Hard limit 2-3 sentences of body. One genuine
  closing question; "not a problem for us right now" must be a welcome answer.
- Signed up but stalled (app created, then went quiet / hit an error and stopped): ask
  honestly what got in the way. Every answer is useful, including "we picked a competitor."
  Do not pitch. Do not offer a call.
- Actively building (activated, inviting teammates, or researching SSO/enterprise): genuine
  product curiosity -- what they're building, where the friction is. Reference what the
  trail actually shows, specifically enough to prove attention but not so granular it feels
  like surveillance.

Writing mechanics: sentence-case subject (never title case), Oxford comma, US English,
contractions fine, active voice, no exclamation points. Total email: 5-6 lines including a
one-line sign-off with just the sender's first name (no title, no company -- assume a
signature block is appended elsewhere). Plain text only, no markdown.
`.trim();

export interface GeneratedOutreachContent {
  verdictReason: string;
  confidence: "low" | "medium" | "high";
  outreachAngle: string;
  authProblemAngle: string;
  researchSummary: string;
  emailSubject: string;
  emailBody: string;
}

export interface GenerationSuccess {
  ok: true;
  content: GeneratedOutreachContent;
}

export interface GenerationFailure {
  ok: false;
  error: string;
}

export type GenerationResult = GenerationSuccess | GenerationFailure;

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model response did not contain a JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * The four exact values the LLM is instructed to return for authProblemAngle.
 * Validation warns (rather than rejects) on mismatch so the raw value is
 * preserved in the DB for inspection; mapping to valid Attio options happens
 * later, at sync time, in mapAuthProblemAngle (attio.ts).
 */
const VALID_AUTH_PROBLEM_ANGLES = [
  "multi-tenancy & orgs",
  "billing structure",
  "authentication",
  "enterprise SSO/SAML",
] as const;

function validateContent(raw: unknown): GeneratedOutreachContent {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Model response was not a JSON object");
  }
  const r = raw as Record<string, unknown>;
  const required = [
    "verdictReason",
    "confidence",
    "outreachAngle",
    "authProblemAngle",
    "researchSummary",
    "emailSubject",
    "emailBody",
  ];
  for (const key of required) {
    if (!isNonEmptyString(r[key])) {
      throw new Error(`Model response missing or empty field: ${key}`);
    }
  }
  const confidence = r.confidence as string;
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") {
    throw new Error(`Model response had invalid confidence: ${confidence}`);
  }
  const authProblemAngle = (r.authProblemAngle as string).trim();
  if (!(VALID_AUTH_PROBLEM_ANGLES as readonly string[]).includes(authProblemAngle)) {
    logger.warn(
      { rawAuthProblemAngle: authProblemAngle, validValues: VALID_AUTH_PROBLEM_ANGLES },
      "LLM returned unexpected authProblemAngle value — storing raw value; fuzzy mapping will apply at sync time",
    );
  }
  return {
    verdictReason: (r.verdictReason as string).trim(),
    confidence,
    outreachAngle: (r.outreachAngle as string).trim(),
    authProblemAngle,
    researchSummary: (r.researchSummary as string).trim(),
    emailSubject: (r.emailSubject as string).trim(),
    emailBody: (r.emailBody as string).trim(),
  };
}

/**
 * Calls Claude to reason over a prospect's real (synthetic) behavioral trail and company
 * context, producing a research narrative, a specific outreach angle, and a voice-matched
 * draft outreach email -- replacing what would otherwise be static, templated copy. Never
 * throws; returns a discriminated result so callers can persist success/failure state.
 */
export async function generateOutreachContent(input: {
  company: Company;
  person: Person;
  archetype: Archetype;
  behavioralTrail: string[];
  behaviorSummary: string;
  outreachPriority: string;
  sourceSignal: string;
  /** Present when regenerating after a reviewer rejection. */
  previousEmailSubject?: string;
  previousEmailBody?: string;
  rejectionFeedback?: string;
}): Promise<GenerationResult> {
  const { company, person, archetype, behavioralTrail, behaviorSummary, outreachPriority, sourceSignal, previousEmailSubject, previousEmailBody, rejectionFeedback } = input;

  const archetypeInfo = ARCHETYPE_INFO[archetype];

  const userPrompt = `
Prospect company: ${company.name} (${company.domain})
- Industry: ${company.industry.join(", ")}
- Employees: ${company.employeeCount} (${company.employeeRange})
- Product category: ${company.productCategory.join(", ")}
- Funding stage: ${company.fundingStage}
- Technology context: ${company.technologyContext.join(", ")}
- Growth signal: ${company.growthSignal}
- Company ICP fit score (0-100, higher = better fit): ${company.icpFitScore}

Contact: ${person.firstName} ${person.lastName}, ${person.title} (${person.seniority}, ${person.department})

Behavioral archetype (a label already assigned by the product's classifier, for context
only -- form your own judgment from the trail below, don't just repeat this label back):
${archetypeInfo.label} -- ${archetypeInfo.description}

Quantitative source signal already computed: ${sourceSignal}
Quantitative outreach priority bucket already computed: ${outreachPriority}

Chronological behavioral trail (grounded fact -- every line is a real observed event):
${behavioralTrail.map((line) => `- ${line}`).join("\n")}

Behavior summary (grounded, already written from the trail above):
${behaviorSummary}

Task: write a JSON object (and ONLY a JSON object, no other text) with exactly these keys:
- "verdictReason": one sentence stating your timing call plainly (e.g. "Reach out now --
  [specific reason]" or "Worth a light touch, but no urgent trigger yet") and why, grounded
  in the trail and company context above. No hedging.
- "confidence": one of "low" | "medium" | "high", per how well-aligned the signal, ICP fit,
  and a clear moment all are.
- "outreachAngle": one sentence naming the specific angle to lead with (not a generic
  category -- specific to this person/company).
- "authProblemAngle": the primary auth infrastructure problem this prospect is likely facing,
  expressed as one of exactly these four values (pick the closest fit):
  "multi-tenancy & orgs" -- building a product where users belong to workspaces, teams, or
    organizations; permissions, member invites, and role management are the core concern.
  "billing structure" -- the auth layer must integrate tightly with subscription tiers,
    seat-based pricing, or entitlement gating.
  "authentication" -- core identity: sign-up/login flows, sessions, MFA, social providers,
    or passwordless. The prospect hasn't yet hit org or enterprise complexity.
  "enterprise SSO/SAML" -- enterprise customers are requiring SAML/OIDC SSO, SCIM
    provisioning, or directory sync as a procurement condition.
- "researchSummary": 2-4 sentences synthesizing who they are, what stage they're at, and
  why now (or why not yet) -- connect the company context and the trail, don't just list facts.
- "emailSubject": per the voice rules.
- "emailBody": per the voice rules, ending with a one-line sign-off using just the first
  name "Alex" (this is a demo -- always sign as Alex, no title or company).
${
  rejectionFeedback && previousEmailSubject && previousEmailBody
    ? `
IMPORTANT — this is a regeneration request. A reviewer already rejected the previous draft.
You must meaningfully address the feedback below; do not produce a trivially similar email.

Previous email subject: ${previousEmailSubject}
Previous email body:
${previousEmailBody}

Reviewer feedback / improvement notes:
${rejectionFeedback}

Address the feedback directly. If the feedback asks for a tighter angle, different hook, or
different tone — honour it. The output must be a noticeably improved second draft.
`.trim()
    : ""
}`.trim();

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `${ICP_CONTEXT}\n\n${EMAIL_VOICE_RULES}\n\nRespond with ONLY a single JSON object matching the requested shape. No markdown fences, no prose before or after.`,
      messages: [{ role: "user", content: userPrompt }],
    });

    const block = message.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return { ok: false, error: "Model response contained no text content" };
    }

    const content = validateContent(extractJson(block.text));
    return { ok: true, content };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error generating outreach content";
    return { ok: false, error: message };
  }
}
