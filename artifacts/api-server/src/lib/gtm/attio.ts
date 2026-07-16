import type { Company, GtmSignal, GenerativeAiEmail, Person } from "@workspace/db";
import {
  AttioApiError,
  createAttioRecord,
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

function buildGtmSignalValues(gtmSignal: GtmSignal): Record<string, unknown> {
  return {
    gtm_signal_title: gtmSignal.sourceSignal,
    batch: gtmSignal.batch,
    behavior_flow: gtmSignal.behavioralTrail,
    research_notes: gtmSignal.researchNotes,
    auth_problem_angle: gtmSignal.authProblemAngle ?? "",
    signal_date: gtmSignal.createdAt.toISOString(),
    synthetic_data: true,
  };
}

function buildGenerativeEmailValues(
  email: GenerativeAiEmail,
): Record<string, unknown> {
  return {
    subject: email.subject,
    body: email.body,
    email_version: email.emailVersion,
    agent_confidence: email.agentConfidence ?? "low",
    synthetic_data: true,
    outreach_status: "not started",
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

    // 3. Create GTM Signal record
    const gtmSignalRecord = await createAttioRecord("gtm_signals", {
      ...buildGtmSignalValues(gtmSignal),
      // Relate back to the Company and Person records we just upserted
      company: companyRecordId,
      person: personRecordId,
    });
    const gtmSignalRecordId = gtmSignalRecord.data.id.record_id;
    logger.info({ gtmSignalRecordId }, "Attio: GTM Signal record created");

    // 4. Create Generative AI Email record (optional — only if content exists)
    let emailRecordId: string | null = null;
    if (generativeAiEmail && generativeAiEmail.subject) {
      const emailRecord = await createAttioRecord("generative_ai_emails", {
        ...buildGenerativeEmailValues(generativeAiEmail),
        // Link back to the GTM Signal
        gtm_signals: [gtmSignalRecordId],
        current_person_ref: personRecordId,
        current_company_ref: companyRecordId,
      });
      emailRecordId = emailRecord.data.id.record_id;
      logger.info({ emailRecordId }, "Attio: Generative AI Email record created");
    }

    // 5. Add GTM Signal to the H2 FY26 Growth list
    await createAttioListEntry(GTM_SIGNALS_LIST_ID, "gtm_signals", gtmSignalRecordId);
    logger.info({ gtmSignalRecordId, listId: GTM_SIGNALS_LIST_ID }, "Attio: GTM Signal added to list");

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
