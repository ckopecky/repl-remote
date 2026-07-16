import type { Company, GtmSignal, GenerativeAiEmail, Person } from "@workspace/db";
import {
  AttioApiError,
  createAttioRecord,
  patchAttioRecord,
  createAttioListEntry,
  upsertAttioRecord,
  GTM_SIGNALS_LIST_ID,
} from "./attioClient";
import { logger } from "../logger";

// ---------------------------------------------------------------------------
// Preview payload types (used by the /attio-export preview endpoint)
// ---------------------------------------------------------------------------

export interface AttioRecordPayload {
  objectSlug: string;
  values: Record<string, unknown>;
}

export interface AttioExportPreview {
  company: AttioRecordPayload;
  person: AttioRecordPayload;
  gtmSignal: AttioRecordPayload;
  generativeEmail: AttioRecordPayload | null;
}

/**
 * Builds a dry-run preview of the exact payloads `syncGtmSignalToAttio` will
 * send. Mirrors the real sync 1-to-1 (attribute slugs and all) so the
 * preview endpoint shows exactly what will be written. Never calls the API.
 */
export function buildAttioExportPreview(input: {
  company: Company;
  person: Person;
  gtmSignal: GtmSignal;
  generativeAiEmail?: GenerativeAiEmail;
}): AttioExportPreview {
  const { company, person, gtmSignal, generativeAiEmail } = input;

  const companyPayload: AttioRecordPayload = {
    objectSlug: "companies",
    values: {
      domains: [company.domain],
      name: company.name,
      description: buildCompanyDescription(company),
    },
  };

  const personPayload: AttioRecordPayload = {
    objectSlug: "people",
    values: {
      email_addresses: [person.email],
      name: {
        first_name: person.firstName,
        last_name: person.lastName,
        full_name: `${person.firstName} ${person.lastName}`,
      },
      job_title: person.title,
      company: company.domain,
    },
  };

  const gtmSignalPayload: AttioRecordPayload = {
    objectSlug: "gtm_signals",
    values: buildGtmSignalValues(gtmSignal),
  };

  const generativeEmailPayload: AttioRecordPayload | null = generativeAiEmail
    ? {
        objectSlug: "generative_ai_emails",
        // Note: gtm_signal (singular) and current_*_ref are added during real sync
        // (they require record IDs from prior steps), so they are absent here.
        values: buildGenerativeEmailValues(generativeAiEmail),
      }
    : null;

  return {
    company: companyPayload,
    person: personPayload,
    gtmSignal: gtmSignalPayload,
    generativeEmail: generativeEmailPayload,
  };
}

// ---------------------------------------------------------------------------
// Sync result types
// ---------------------------------------------------------------------------

export interface AttioGtmSyncSuccess {
  ok: true;
  companyRecordId: string;
  personRecordId: string;
  personWebUrl: string;
  gtmSignalRecordId: string;
  emailRecordId: string | null;
  syncedAt: Date;
}

export interface AttioGtmSyncFailure {
  ok: false;
  error: string;
}

export type AttioGtmSyncResult = AttioGtmSyncSuccess | AttioGtmSyncFailure;

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

function buildCompanyDescription(company: Company): string {
  const industry = company.industry.join(", ");
  return `${industry} · ${company.employeeCount} employees (${company.employeeRange}) · ${company.fundingStage}. ${company.growthSignal}.`;
}

/**
 * The four valid `auth_problem_angle` select option titles in Attio, in
 * priority order used by the fuzzy mapper below.
 */
const ATTIO_AUTH_ANGLES = [
  "multi-tenancy & orgs",
  "billing structure",
  "authentication",
  "enterprise SSO/SAML",
] as const;

type AttioAuthAngle = (typeof ATTIO_AUTH_ANGLES)[number];

/**
 * Maps a raw authProblemAngle string (as produced by the LLM) to the nearest
 * valid Attio select option title. The LLM is instructed to return one of the
 * four exact values, so an exact match is the common case. The fuzzy fallback
 * handles minor variations (e.g. "SSO/SAML" → "enterprise SSO/SAML").
 */
function mapAuthProblemAngle(raw: string | null | undefined): AttioAuthAngle {
  if (!raw) return "authentication";

  const normalized = raw.toLowerCase().trim();

  // Exact match first
  const exact = ATTIO_AUTH_ANGLES.find((a) => a === normalized);
  if (exact) return exact;

  // Keyword-based fuzzy matching
  if (normalized.includes("multi-tenant") || normalized.includes("org")) {
    return "multi-tenancy & orgs";
  }
  if (normalized.includes("billing") || normalized.includes("subscription") || normalized.includes("entitlement")) {
    return "billing structure";
  }
  if (normalized.includes("sso") || normalized.includes("saml") || normalized.includes("enterprise") || normalized.includes("scim")) {
    return "enterprise SSO/SAML";
  }

  // Default to the most generic option
  return "authentication";
}

function buildGtmSignalValues(gtmSignal: GtmSignal): Record<string, unknown> {
  return {
    gtm_signal_title: gtmSignal.sourceSignal,
    batch: gtmSignal.batch,
    // behavior_flow is a plain text field in Attio (not multiselect) — join the array
    behavior_flow: Array.isArray(gtmSignal.behavioralTrail)
      ? gtmSignal.behavioralTrail.join("\n")
      : gtmSignal.behavioralTrail,
    // Attio attribute slug is `signal_summary`, not `research_notes`
    signal_summary: gtmSignal.researchNotes,
    // auth_problem_angle is a required multiselect in Attio — must be a non-empty array.
    // Map the raw LLM string to one of the four valid Attio select option titles.
    auth_problem_angle: [mapAuthProblemAngle(gtmSignal.authProblemAngle)],
    // signal_date is a date field (not timestamp) — send YYYY-MM-DD only
    signal_date: gtmSignal.createdAt.toISOString().slice(0, 10),
    // lifecycle_status is a required select in Attio; "Prospect" is the correct
    // option for all records synced from this tool.
    lifecycle_status: "Prospect",
    synthetic_data: true,
  };
}

function buildGenerativeEmailValues(
  email: GenerativeAiEmail,
): Record<string, unknown> {
  return {
    subject: email.subject,
    body: email.body,
    // `email_version` does not exist in the Attio schema — omitted
    agent_confidence: email.agentConfidence ?? "low",
    synthetic_data: true,
    // outreach_status is omitted — Attio uses its configured default value.
  };
}

// ---------------------------------------------------------------------------
// Real sync
// ---------------------------------------------------------------------------

/**
 * Pushes a GTM Signal — and its associated Generative AI Email if one exists —
 * to Attio. Sync order:
 *   1. Upsert Company  (standard object, matched by domain)
 *   2. Upsert Person   (standard object, matched by email)
 *   3. Create GTM Signal record  (custom object: gtm_signals)
 *   4. Create Generative AI Email record  (custom object: generative_ai_emails)
 *   5. Add GTM Signal to the H2 FY26 Growth list
 *
 * Never throws — returns a result object so callers can persist
 * success/failure state.
 */
export async function syncGtmSignalToAttio(input: {
  company: Company;
  person: Person;
  gtmSignal: GtmSignal;
  generativeAiEmail?: GenerativeAiEmail;
}): Promise<AttioGtmSyncResult> {
  const { company, person, gtmSignal, generativeAiEmail } = input;

  if (!process.env.ATTIO_API_KEY) {
    return { ok: false, error: "ATTIO_API_KEY is not configured" };
  }

  try {
    // 1. Upsert Company
    const companyRecord = await upsertAttioRecord("companies", "domains", {
      domains: [company.domain],
      name: company.name,
      description: buildCompanyDescription(company),
    });
    const companyRecordId = companyRecord.data.id.record_id;
    logger.info({ companyRecordId }, "Attio: company upserted");

    // 2. Upsert Person
    const personRecord = await upsertAttioRecord("people", "email_addresses", {
      email_addresses: [person.email],
      name: {
        first_name: person.firstName,
        last_name: person.lastName,
        full_name: `${person.firstName} ${person.lastName}`,
      },
      job_title: person.title,
      company: company.domain,
    });
    const personRecordId = personRecord.data.id.record_id;
    logger.info({ personRecordId }, "Attio: person upserted");

    // 3. Create or update GTM Signal record
    // If a record was already synced (attioGtmSignalRecordId is set), patch it
    // to avoid creating a duplicate on re-sync.
    const gtmSignalValues = {
      ...buildGtmSignalValues(gtmSignal),
      // Relate back to the Company and Person records we just upserted
      company: companyRecordId,
      person: personRecordId,
    };
    const existingGtmSignalRecordId = gtmSignal.attioGtmSignalRecordId;
    const gtmSignalRecord = existingGtmSignalRecordId
      ? await patchAttioRecord("gtm_signals", existingGtmSignalRecordId, gtmSignalValues)
      : await createAttioRecord("gtm_signals", gtmSignalValues);
    const gtmSignalRecordId = gtmSignalRecord.data.id.record_id;
    logger.info(
      { gtmSignalRecordId, updated: !!existingGtmSignalRecordId },
      existingGtmSignalRecordId ? "Attio: GTM Signal record updated" : "Attio: GTM Signal record created",
    );

    // 4. Create or update Generative AI Email record (optional — only if content exists)
    let emailRecordId: string | null = null;
    if (generativeAiEmail && generativeAiEmail.subject) {
      const emailValues = {
        ...buildGenerativeEmailValues(generativeAiEmail),
        // Attio attribute slug is `gtm_signal` (singular, not multiselect)
        gtm_signal: gtmSignalRecordId,
        current_person_ref: personRecordId,
        current_company_ref: companyRecordId,
      };
      const existingEmailRecordId = generativeAiEmail.attioEmailRecordId;
      const emailRecord = existingEmailRecordId
        ? await patchAttioRecord("generative_ai_emails", existingEmailRecordId, emailValues)
        : await createAttioRecord("generative_ai_emails", emailValues);
      emailRecordId = emailRecord.data.id.record_id;
      logger.info(
        { emailRecordId, updated: !!existingEmailRecordId },
        existingEmailRecordId ? "Attio: Generative AI Email record updated" : "Attio: Generative AI Email record created",
      );
    }

    // 5. Add the Person to the H2 FY26 Growth list.
    // The list is configured with parent_object "people", so we add the person record.
    await createAttioListEntry(GTM_SIGNALS_LIST_ID, "people", personRecordId);
    logger.info({ personRecordId, listId: GTM_SIGNALS_LIST_ID }, "Attio: Person added to H2 FY26 Growth list");

    return {
      ok: true,
      companyRecordId,
      personRecordId,
      personWebUrl: personRecord.data.web_url,
      gtmSignalRecordId,
      emailRecordId,
      syncedAt: new Date(),
    };
  } catch (err) {
    const message =
      err instanceof AttioApiError
        ? `Attio API error (${err.status}): ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unknown error syncing to Attio";
    logger.error({ err }, "Attio sync failed");
    return { ok: false, error: message };
  }
}
