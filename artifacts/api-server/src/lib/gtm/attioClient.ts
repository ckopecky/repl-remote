import { logger } from "../logger";

const ATTIO_API_BASE = "https://api.attio.com/v2";

/** List ID for "H2 FY 26 Growth" in Attio */
export const GTM_SIGNALS_LIST_ID = "7e460c9d-74b2-4316-8d48-7fcdd7d63070";

export class AttioApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "AttioApiError";
  }
}

export function getApiKey(): string {
  const key = process.env.ATTIO_API_KEY;
  if (!key) {
    throw new Error("ATTIO_API_KEY is not configured");
  }
  return key;
}

async function attioRequest<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${ATTIO_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message =
      (json && typeof json === "object" && "message" in json && String(json.message)) ||
      `Attio API request failed with status ${res.status}`;
    logger.error({ path, status: res.status, body: json }, "Attio API request failed");
    throw new AttioApiError(message, res.status, json);
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Branded ID types — used in the interface definitions below so TypeScript
// catches accidental swaps between Company, Person, GTMSignal, and Email IDs.
// ---------------------------------------------------------------------------
type _Brand<T extends string> = { readonly __brand: T };
export type CompanyId = string & _Brand<"CompanyId">;
export type PeopleId = string & _Brand<"PeopleId">;
export type ListId = string & _Brand<"ListId">;
export type GTMSignalId = string & _Brand<"GTMSignalId">;
export type GenerativeEmailId = string & _Brand<"GenerativeEmailId">;

// ---------------------------------------------------------------------------
// Attio object shapes (mirrors the custom/standard objects in the workspace)
// ---------------------------------------------------------------------------

export interface AttioPeopleObject {
  first_name: string;
  last_name: string;
  name: string;
  email_addresses: string[];
  job_title: string;
  company: CompanyId[];
  department: "engineering" | "product" | "design" | "GTM" | "executive" | "founder" | "other";
  activation_score: number;
  behavior_archetype: string;
  behavior_summary: string;
  behavior_trail: string[];
  collaboration_score: number;
  description: string;
  enterprise_intent_score: number;
  customer_status: "signup" | "activated" | "evaluating" | "converted" | "churned";
  persona:
    | "technical implementer"
    | "product strategist"
    | "data practitioner"
    | "design practitioner"
    | "ops generalist"
    | "growth marketer"
    | "revops analyst"
    | "IT administrator"
    | "sales leader"
    | "executive sponsor";
  primary_location: { city: string; state: string; country: string };
  seniority:
    | "executive"
    | "VP"
    | "director"
    | "manager"
    | "senior individual contributor"
    | "associate individual contributor";
  purchase_role:
    | "decision maker"
    | "champion"
    | "technical evaluator"
    | "end user"
    | "influencer"
    | "procurement specialist";
  signup_date: string;
  synthethic_demo_record: boolean;
  churn_risk_score: number;
  persona_fit_score: number;
}

export interface AttioCompaniesObject {
  domains: string[];
  name: string;
  description: string;
  employee_count: number;
  employee_range:
    | "1-10"
    | "11-50"
    | "51-200"
    | "201-500"
    | "501-1000"
    | "1001-5000"
    | "5K-10K"
    | "10K-50K"
    | "50K-100K"
    | "100K+";
  funding_stage:
    | "bootstrapped"
    | "seed"
    | "series A"
    | "series B"
    | "series C"
    | "series D"
    | "public";
  funding_raised: number;
  primary_location: { city: string; state: string; country: string };
  industry_vertical:
    | "software as a service"
    | " information technology"
    | "infrastructure as a service"
    | "retail"
    | "manufacturing"
    | "other technology"
    | "financial services"
    | "healthcare"
    | "education"
    | "non-profit";
  product_category:
    | "developer tools"
    | "AI"
    | "SaaS"
    | "IaaS"
    | "PaaS"
    | "data"
    | "workflow automation"
    | "identity and access"
    | "payments"
    | "observability"
    | "other";
  technology_context: string[];
  synthethic_demo_record: boolean;
  icp_fit_score: number;
  icp_tier: "tier 1" | "tier 2" | "tier 3" | "not ICP";
  growth_signal: string;
  primary_signal:
    | "rapid activation"
    | "team expansion"
    | "enterprise research"
    | "SSO research"
    | "pricing activity"
    | "implementation blocker"
    | "returning after inactivity"
    | "conversion"
    | "churn risk";
  team: PeopleId[];
  outreach_priority: "high" | "medium" | "low" | "suppress";
  strongest_connection: { person: PeopleId; persona_fit_score: number };
  estimated_arr: number;
  first_calendar_interaction: string;
  last_calendar_interaction: string;
  first_outreach_interaction: string;
  last_outreach_interaction: string;
  gtm_signal: GTMSignalId[];
}

/** Custom object: gtm_signals */
export interface AttioGTMSignalObject {
  company: CompanyId;
  person: PeopleId;
  /** Chronological list of behavioral events */
  behavior_flow: string[];
  /** Free-text research & context notes */
  research_notes: string;
  /** The recommended auth problem angle for this prospect */
  auth_problem_angle: string;
  signal_date: string;
  batch: string;
  gtm_signal_title: string;
  /** Back-references to GenerativeAIEmail records */
  generative_ai_emails: GenerativeEmailId[];
}

/** Custom object: generative_ai_emails */
export interface AttioGenerativeEmailObject {
  subject: string;
  body: string;
  email_version: number;
  agent_confidence: "low" | "medium" | "high";
  /** Relation back to parent GTM Signal(s) */
  gtm_signals: GTMSignalId[];
  current_person_ref: PeopleId;
  current_company_ref: CompanyId;
  synthetic_data: boolean;
  outreach_status:
    | "not started"
    | "thinking"
    | "approval needed"
    | "email done"
    | "needs regeneration"
    | "calendar booked"
    | "meeting done"
    | "converted";
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface AttioRecordRef {
  workspace_id: string;
  object_id: string;
  record_id: string;
}

export interface AttioRecordResponse {
  data: {
    id: AttioRecordRef;
    created_at: string;
    web_url: string;
    values: Record<string, unknown>;
  };
}

export interface AttioNoteResponse {
  data: {
    id: { workspace_id: string; note_id: string };
    parent_object: string;
    parent_record_id: string;
    title: string;
  };
}

export interface AttioListEntryResponse {
  data: {
    id: {
      workspace_id: string;
      list_id: string;
      entry_id: string;
    };
    record_id: AttioRecordRef;
    entry_values: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Upserts (creates or updates) a record on a standard Attio object, matched
 * by a unique attribute (e.g. `domains` for companies, `email_addresses` for
 * people). Use this for standard objects where deduplication is desired.
 */
export async function upsertAttioRecord(
  objectSlug: string,
  matchingAttribute: string,
  values: Record<string, unknown>,
): Promise<AttioRecordResponse> {
  return attioRequest<AttioRecordResponse>(
    `/objects/${objectSlug}/records?matching_attribute=${matchingAttribute}`,
    { method: "PUT", body: { data: { values } } },
  );
}

/**
 * Creates a new record on a custom Attio object. Unlike `upsertAttioRecord`
 * this always creates — suitable for GTM Signals and Generative AI Emails
 * where each record is intentionally unique.
 */
export async function createAttioRecord(
  objectSlug: string,
  values: Record<string, unknown>,
): Promise<AttioRecordResponse> {
  return attioRequest<AttioRecordResponse>(`/objects/${objectSlug}/records`, {
    method: "POST",
    body: { data: { values } },
  });
}

/**
 * Adds a record to an Attio list. The record must already exist in Attio.
 * `objectSlug` is the slug of the object the record belongs to (e.g.
 * `"gtm_signals"`), and `recordId` is the Attio record_id UUID.
 */
export async function createAttioListEntry(
  listId: string,
  objectSlug: string,
  recordId: string,
): Promise<AttioListEntryResponse> {
  return attioRequest<AttioListEntryResponse>(`/lists/${listId}/entries`, {
    method: "POST",
    body: {
      data: {
        record: { object: objectSlug, record_id: recordId },
        entry_values: {},
      },
    },
  });
}

/**
 * Creates a note on an existing Attio record.
 */
export async function createAttioNote(input: {
  parentObject: string;
  parentRecordId: string;
  title: string;
  content: string;
}): Promise<AttioNoteResponse> {
  return attioRequest<AttioNoteResponse>("/notes", {
    method: "POST",
    body: {
      data: {
        parent_object: input.parentObject,
        parent_record_id: input.parentRecordId,
        title: input.title,
        format: "plaintext",
        content: input.content,
      },
    },
  });
}
