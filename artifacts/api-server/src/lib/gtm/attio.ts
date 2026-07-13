import type { Company, OutreachPackage, Person } from "@workspace/db";

export interface AttioRecordPayload {
  objectSlug: string;
  values: Record<string, unknown>;
}

export interface AttioExportPreview {
  company: AttioRecordPayload;
  person: AttioRecordPayload;
  email: AttioRecordPayload;
}

/**
 * Builds Attio-compatible export payload previews for a company, person, and
 * a Generative AI Email record derived from an outreach package. This never
 * calls the Attio API -- it is a preview of the payload shape only.
 */
export function buildAttioExportPreview(input: {
  company: Company;
  person: Person;
  outreachPackage: OutreachPackage;
}): AttioExportPreview {
  const { company, person, outreachPackage } = input;

  const companyPayload: AttioRecordPayload = {
    objectSlug: "companies",
    values: {
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      employee_count: company.employeeCount,
      funding_stage: company.fundingStage,
      latest_funding_date: company.latestFundingDate,
      funding_amount: company.fundingAmount,
      headquarters: company.headquarters,
      product_category: company.productCategory,
      technology_context: company.technologyContext,
      growth_signal: company.growthSignal,
      icp_fit_score: company.icpFitScore,
    },
  };

  const personPayload: AttioRecordPayload = {
    objectSlug: "people",
    values: {
      first_name: person.firstName,
      last_name: person.lastName,
      email_addresses: [person.email],
      title: person.title,
      department: person.department,
      seniority: person.seniority,
      persona: person.persona,
      purchase_role: person.purchaseRole,
      company: { target_object: "companies", relationship: "works_at" },
      lifecycle_stage: person.lifecycleStage,
      contact_priority: person.contactPriority,
    },
  };

  const emailPayload: AttioRecordPayload = {
    objectSlug: "generative_ai_emails",
    values: {
      person: { target_object: "people", relationship: "for_person" },
      company: { target_object: "companies", relationship: "for_company" },
      campaign: outreachPackage.campaign,
      source_signal: outreachPackage.sourceSignal,
      behavior_trail: outreachPackage.behavioralTrail,
      behavior_summary: outreachPackage.behaviorSummary,
      research_summary: outreachPackage.researchSummary,
      outreach_angle: outreachPackage.outreachAngle,
      growth_hypothesis_version: outreachPackage.hypothesisVersion,
      prompt_version: outreachPackage.promptVersion,
      status: "Ready for Generation",
    },
  };

  return { company: companyPayload, person: personPayload, email: emailPayload };
}
