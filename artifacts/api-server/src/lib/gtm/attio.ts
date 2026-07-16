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

export interface AttioGtmSyncPartial {
  ok: "partial";
  error: string;
  // IDs for records that were successfully created/updated before the failure
  companyRecordId?: string;
  personRecordId?: string;
  personWebUrl?: string;
  gtmSignalRecordId?: string;
  emailRecordId?: string | null;
}

export interface AttioGtmSyncFailure {
  ok: false;
  error: string;
}

export type AttioGtmSyncResult =
  | AttioGtmSyncSuccess
  | AttioGtmSyncPartial
  | AttioGtmSyncFailure;

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

  // Track IDs as they are created so a partial failure can persist whatever
  // was written to Attio and avoid orphaning those records on a retry.
  let companyRecordId: string | undefined;
  let personRecordId: string | undefined;
  let personWebUrl: string | undefined;
  let gtmSignalRecordId: string | undefined;
  let emailRecordId: string | null = null;

  function buildPartialError(err: unknown): AttioGtmSyncPartial {
    const message =
      err instanceof AttioApiError
        ? `Attio API error (${err.status}): ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unknown error syncing to Attio";
    logger.error({ err }, "Attio sync failed (partial)");
    return {
      ok: "partial",
      error: message,
      companyRecordId,
      personRecordId,
      personWebUrl,
      gtmSignalRecordId,
      emailRecordId,
    };
  }

  try {
    // 1. Upsert Company
    const companyRecord = await upsertAttioRecord("companies", "domains", {
      domains: [company.domain],
      name: company.name,
      description: buildCompanyDescription(company),
    });
    companyRecordId = companyRecord.data.id.record_id;
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
    personRecordId = personRecord.data.id.record_id;
    personWebUrl = personRecord.data.web_url;
    logger.info({ personRecordId }, "Attio: person upserted");

    // 3. Create or update GTM Signal record
    // If a record was already synced (attioGtmSignalRecordId is set), patch it
    // to avoid creating a duplicate on re-sync. If Attio returns 404 (the record
    // was manually deleted), fall back to CREATE so the signal can recover
    // automatically on the next sync.
    const gtmSignalValues = {
      ...buildGtmSignalValues(gtmSignal),
      // Relate back to the Company and Person records we just upserted
      company: companyRecordId,
      person: personRecordId,
    };
    const existingGtmSignalRecordId = gtmSignal.attioGtmSignalRecordId;
    let gtmSignalRecord: Awaited<ReturnType<typeof createAttioRecord>>;
    if (existingGtmSignalRecordId) {
      try {
        gtmSignalRecord = await patchAttioRecord("gtm_signals", existingGtmSignalRecordId, gtmSignalValues);
        logger.info({ gtmSignalRecordId: existingGtmSignalRecordId }, "Attio: GTM Signal record updated");
      } catch (err) {
        if (err instanceof AttioApiError && err.status === 404) {
          logger.warn(
            { existingGtmSignalRecordId },
            "Attio: GTM Signal record not found (deleted in Attio) — falling back to CREATE",
          );
          gtmSignalRecord = await createAttioRecord("gtm_signals", gtmSignalValues);
          logger.info({ gtmSignalRecordId: gtmSignalRecord.data.id.record_id }, "Attio: GTM Signal record re-created");
        } else {
          throw err;
        }
      }
    } else {
      gtmSignalRecord = await createAttioRecord("gtm_signals", gtmSignalValues);
      logger.info({ gtmSignalRecordId: gtmSignalRecord.data.id.record_id }, "Attio: GTM Signal record created");
    }
    gtmSignalRecordId = gtmSignalRecord.data.id.record_id;

    // 4. Create or update Generative AI Email record (optional — only if content exists)
    if (generativeAiEmail && generativeAiEmail.subject) {
      const emailValues = {
        ...buildGenerativeEmailValues(generativeAiEmail),
        // Attio attribute slug is `gtm_signal` (singular, not multiselect)
        gtm_signal: gtmSignalRecordId,
        current_person_ref: personRecordId,
        current_company_ref: companyRecordId,
      };
      const existingEmailRecordId = generativeAiEmail.attioEmailRecordId;
      let emailRecord: Awaited<ReturnType<typeof createAttioRecord>>;
      if (existingEmailRecordId) {
        try {
          emailRecord = await patchAttioRecord("generative_ai_emails", existingEmailRecordId, emailValues);
          logger.info({ emailRecordId: existingEmailRecordId }, "Attio: Generative AI Email record updated");
        } catch (err) {
          if (err instanceof AttioApiError && err.status === 404) {
            logger.warn(
              { existingEmailRecordId },
              "Attio: Generative AI Email record not found (deleted in Attio) — falling back to CREATE",
            );
            emailRecord = await createAttioRecord("generative_ai_emails", emailValues);
            logger.info(
              { emailRecordId: emailRecord.data.id.record_id },
              "Attio: Generative AI Email record re-created",
            );
          } else {
            throw err;
          }
        }
      } else {
        emailRecord = await createAttioRecord("generative_ai_emails", emailValues);
        logger.info({ emailRecordId: emailRecord.data.id.record_id }, "Attio: Generative AI Email record created");
      }
      emailRecordId = emailRecord.data.id.record_id;
    }
  } catch (err) {
    // One of steps 1–4 failed. Return whatever IDs were collected so far so
    // the caller can persist them and avoid orphaning already-created records.
    return buildPartialError(err);
  }

  // 5. Add the Person to the H2 FY26 Growth list.
  // This step is wrapped in its own try-catch because steps 1–4 have already
  // written records to Attio. A list-entry failure must not orphan those records —
  // we return a partial result so the caller can persist the IDs before recording
  // the error.
  //
  // A 409 Conflict from Attio means the person is already a member of the list
  // (duplicate list entry). This is not an error — the sync goal (person is in
  // the list) is already satisfied, so we log and continue rather than returning
  // a partial failure.
  try {
    await createAttioListEntry(GTM_SIGNALS_LIST_ID, "people", personRecordId!);
    logger.info({ personRecordId, listId: GTM_SIGNALS_LIST_ID }, "Attio: Person added to H2 FY26 Growth list");
  } catch (err) {
    if (err instanceof AttioApiError && err.status === 409) {
      logger.info(
        { personRecordId, listId: GTM_SIGNALS_LIST_ID },
        "Attio: Person already in H2 FY26 Growth list (409 duplicate) — skipping",
      );
    } else {
      return buildPartialError(err);
    }
  }

  return {
    ok: true,
    companyRecordId: companyRecordId!,
    personRecordId: personRecordId!,
    personWebUrl: personWebUrl!,
    gtmSignalRecordId: gtmSignalRecordId!,
    emailRecordId,
    syncedAt: new Date(),
  };
}
