export const ARCHETYPES = [
  "rapid_team_activator",
  "enterprise_evaluator",
  "solo_builder",
  "stalled_implementer",
  "returning_evaluator",
  "converted_account",
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

export const ARCHETYPE_INFO: Record<
  Archetype,
  { label: string; description: string }
> = {
  rapid_team_activator: {
    label: "Rapid Team Activator",
    description:
      "Creates an application within 24 hours of signup, enables an organization, invites teammates, and returns repeatedly.",
  },
  enterprise_evaluator: {
    label: "Enterprise Evaluator",
    description:
      "Creates an application, enables an organization, views SSO and enterprise documentation, and visits pricing.",
  },
  solo_builder: {
    label: "Solo Builder",
    description:
      "Creates one application and an API key but shows little team or enterprise behavior.",
  },
  stalled_implementer: {
    label: "Stalled Implementer",
    description:
      "Creates an application, encounters errors, repeatedly views documentation, and becomes inactive.",
  },
  returning_evaluator: {
    label: "Returning Evaluator",
    description:
      "Initially becomes inactive, then returns, creates or configures an application, and views pricing or SSO resources.",
  },
  converted_account: {
    label: "Converted Account",
    description:
      "Activates, collaborates, evaluates advanced features, and starts a subscription.",
  },
};

// Product event taxonomy -- the full set of synthetic product analytics events
// that can appear in a person's raw event timeline.
export const PRODUCT_EVENTS = [
  "user_signed_up",
  "application_created",
  "application_configured",
  "organization_enabled",
  "teammate_invited",
  "sdk_installed",
  "api_key_created",
  "integration_error",
  "documentation_viewed",
  "sso_documentation_viewed",
  "mfa_enabled",
  "pricing_page_viewed",
  "enterprise_page_viewed",
  "checkout_started",
  "subscription_started",
  "inactive_period",
  "returned_to_product",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export const EVENT_CATEGORY: Record<ProductEventName, string> = {
  user_signed_up: "lifecycle",
  application_created: "product",
  application_configured: "product",
  organization_enabled: "team",
  teammate_invited: "team",
  sdk_installed: "product",
  api_key_created: "product",
  integration_error: "reliability",
  documentation_viewed: "research",
  sso_documentation_viewed: "research",
  mfa_enabled: "security",
  pricing_page_viewed: "commercial",
  enterprise_page_viewed: "commercial",
  checkout_started: "commercial",
  subscription_started: "commercial",
  inactive_period: "lifecycle",
  returned_to_product: "lifecycle",
};

export const OUTREACH_STATUSES = [
  "Researching",
  "Ready for Generation",
  "Generated",
  "Needs Review",
  "Regeneration Requested",
  "Regenerated",
  "Approved",
  "Rejected",
  "Paused",
  "Sent",
  "Replied",
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_PRIORITIES = ["High", "Medium", "Low", "Suppress"] as const;

export type OutreachPriority = (typeof OUTREACH_PRIORITIES)[number];

export const FIXED_DEMO_SEED = 20260101;

export const PROMPT_VERSION = "prompt-v1";
