import type { Company, Person, ProductEvent, SignalWeights } from "@workspace/db";
import type { Archetype, OutreachPriority } from "./constants";
import { DEFAULT_MESSAGING_GUIDANCE } from "./hypothesis";

export interface AssessmentScores {
  icpFitScore: number;
  personaFitScore: number;
  activationScore: number;
  collaborationScore: number;
  enterpriseIntentScore: number;
  purchaseIntentScore: number;
  churnRiskScore: number;
  outreachPriority: OutreachPriority;
  recommendedAngle: string;
  rationale: string;
  riskNotes: string;
}

const SENIORITY_FIT: Record<string, number> = {
  "Individual Contributor": 35,
  Manager: 55,
  Director: 75,
  VP: 88,
  "C-Level": 92,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

/**
 * Computes the seven research assessment scores plus outreach priority, angle,
 * rationale, and risk notes for one person, given the current growth hypothesis
 * signal weights. Purely a function of observed events + the hypothesis --
 * never mutates raw behavioral data.
 */
export function scoreProspect(input: {
  person: Person;
  company: Company;
  events: ProductEvent[];
  weights: SignalWeights;
  messagingGuidance: Record<string, string> | null;
  now: Date;
}): AssessmentScores {
  const { person, company, events, weights, now } = input;
  const messagingGuidance = input.messagingGuidance ?? DEFAULT_MESSAGING_GUIDANCE;

  const signedUp = events.find((e) => e.eventName === "user_signed_up");
  const firstApp = events.find((e) => e.eventName === "application_created");
  const orgEnabled = events.find((e) => e.eventName === "organization_enabled");
  const inviteEvents = events.filter((e) => e.eventName === "teammate_invited");
  const inviteCount = inviteEvents.reduce(
    (sum, e) => sum + ((e.properties.count as number) ?? 1),
    0,
  );
  const ssoViews = events.filter((e) => e.eventName === "sso_documentation_viewed").length;
  const pricingViews = events.filter(
    (e) => e.eventName === "pricing_page_viewed" || e.eventName === "enterprise_page_viewed",
  ).length;
  const checkoutStarted = events.some((e) => e.eventName === "checkout_started");
  const subscriptionStarted = events.some((e) => e.eventName === "subscription_started");
  const integrationErrors = events.filter((e) => e.eventName === "integration_error").length;
  const inactivePeriods = events.filter((e) => e.eventName === "inactive_period").length;
  const returnedToProduct = events.filter((e) => e.eventName === "returned_to_product").length;

  const appWithin24h = !!(signedUp && firstApp && hoursBetween(signedUp.occurredAt, firstApp.occurredAt) <= 24);

  // --- ICP fit: company-level fit, independent of the hypothesis. ---
  const icpFitScore = clamp(company.icpFitScore);

  // --- Persona fit: seniority + purchase role of the contact. ---
  const personaFitScore = clamp(SENIORITY_FIT[person.seniority] ?? 50);

  // --- Activation: application-within-24h + organization enablement. ---
  let activationScore = 0;
  if (appWithin24h) activationScore += weights.applicationWithin24h * 60;
  else if (firstApp) activationScore += 20;
  if (orgEnabled) activationScore += weights.organizationEnablement * 40;
  activationScore = clamp(activationScore);

  // --- Collaboration: teammate invites, threshold of 2+ per the default rule. ---
  let collaborationScore = 0;
  if (inviteCount > 0) {
    collaborationScore =
      Math.min(1, inviteCount / 6) * weights.teammateInvitesThreshold * 100 +
      (inviteCount >= 2 ? 15 : 0);
  }
  collaborationScore = clamp(collaborationScore);

  // --- Enterprise intent: repeated SSO documentation views + enterprise page views. ---
  let enterpriseIntentScore = ssoViews > 0 ? Math.min(1, ssoViews / 4) * weights.repeatedSsoDocViews * 100 : 0;
  if (pricingViews > 0) enterpriseIntentScore += 10;
  if (company.employeeCount > 500) enterpriseIntentScore += 8;
  enterpriseIntentScore = clamp(enterpriseIntentScore);

  // --- Purchase intent: pricing views (weak) -> checkout (stronger) -> subscription (strongest). ---
  let purchaseIntentScore = pricingViews * 8 * weights.pricingViewsWithoutActivation;
  if (checkoutStarted) purchaseIntentScore += 35;
  if (subscriptionStarted) purchaseIntentScore = 100 * weights.subscriptionStart;
  purchaseIntentScore = clamp(purchaseIntentScore);

  // --- Churn risk: integration errors followed by inactivity, offset by returning after inactivity. ---
  let churnRiskScore = integrationErrors * 14 * weights.integrationErrorsThenInactivity + inactivePeriods * 18;
  if (returnedToProduct > 0) {
    churnRiskScore -= returnedToProduct * 25 * weights.returningAfterInactivity;
  }
  churnRiskScore = clamp(churnRiskScore);

  const composite =
    (icpFitScore +
      personaFitScore +
      activationScore +
      collaborationScore +
      enterpriseIntentScore +
      purchaseIntentScore) /
      6 -
    churnRiskScore * 0.3;

  let outreachPriority: OutreachPriority;
  if (subscriptionStarted) {
    outreachPriority = "Medium"; // already converted -- expansion motion, not new-business urgency
  } else if (churnRiskScore >= 70 && purchaseIntentScore < 20 && composite < 40) {
    outreachPriority = "Suppress";
  } else if (composite >= 50) {
    outreachPriority = "High";
  } else if (composite >= 30) {
    outreachPriority = "Medium";
  } else if (composite >= 12) {
    outreachPriority = "Low";
  } else {
    outreachPriority = "Suppress";
  }

  const { recommendedAngle, rationale, riskNotes } = buildNarrative({
    archetype: person.archetype as Archetype,
    messagingGuidance,
    appWithin24h,
    orgEnabled: !!orgEnabled,
    inviteCount,
    ssoViews,
    pricingViews,
    subscriptionStarted,
    integrationErrors,
    inactivePeriods,
    returnedToProduct,
    outreachPriority,
  });

  return {
    icpFitScore,
    personaFitScore,
    activationScore,
    collaborationScore,
    enterpriseIntentScore,
    purchaseIntentScore,
    churnRiskScore,
    outreachPriority,
    recommendedAngle,
    rationale,
    riskNotes,
  };
}

function buildNarrative(input: {
  archetype: Archetype;
  messagingGuidance: Record<string, string>;
  appWithin24h: boolean;
  orgEnabled: boolean;
  inviteCount: number;
  ssoViews: number;
  pricingViews: number;
  subscriptionStarted: boolean;
  integrationErrors: number;
  inactivePeriods: number;
  returnedToProduct: number;
  outreachPriority: OutreachPriority;
}): { recommendedAngle: string; rationale: string; riskNotes: string } {
  const recommendedAngle =
    input.messagingGuidance[input.archetype] ?? DEFAULT_MESSAGING_GUIDANCE[input.archetype];

  const rationaleParts: string[] = [];
  if (input.appWithin24h) rationaleParts.push("activated within 24 hours of signup");
  if (input.orgEnabled) rationaleParts.push("enabled an organization");
  if (input.inviteCount >= 2) rationaleParts.push(`invited ${input.inviteCount} teammates`);
  if (input.ssoViews >= 2) rationaleParts.push(`viewed SSO documentation ${input.ssoViews} times`);
  if (input.pricingViews > 0) rationaleParts.push(`viewed pricing/enterprise pages ${input.pricingViews} times`);
  if (input.subscriptionStarted) rationaleParts.push("started a paid subscription");
  const rationale =
    rationaleParts.length > 0
      ? `Assessed as ${input.outreachPriority} priority because the account ${rationaleParts.join(", ")}.`
      : `Assessed as ${input.outreachPriority} priority based on limited observed activity so far.`;

  const riskParts: string[] = [];
  if (input.integrationErrors > 0 && input.inactivePeriods > 0) {
    riskParts.push(
      `${input.integrationErrors} integration error(s) preceded a period of inactivity, a signal that may indicate unresolved setup friction rather than lost interest.`,
    );
  } else if (input.inactivePeriods > 0 && input.returnedToProduct === 0) {
    riskParts.push("Extended inactivity with no observed return increases churn risk.");
  } else if (input.returnedToProduct > 0) {
    riskParts.push("Returned after a dormant period -- treat renewed activity as tentative rather than confirmed intent.");
  }
  if (riskParts.length === 0) {
    riskParts.push("No elevated risk signals observed.");
  }

  return { recommendedAngle, rationale, riskNotes: riskParts.join(" ") };
}
