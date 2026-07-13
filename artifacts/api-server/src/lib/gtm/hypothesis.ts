import type { SignalWeights, MessagingGuidance } from "@workspace/db";

export const DEFAULT_HYPOTHESIS_VERSION = "v1.0";

export const DEFAULT_HYPOTHESIS_TITLE = "Activation-Led Growth v1";

export const DEFAULT_HYPOTHESIS_DESCRIPTION =
  "Prospects who reach product activation quickly, enable team/organization features, and show " +
  "enterprise or purchase research signals convert at a higher rate than those who evaluate in " +
  "isolation. Integration errors followed by inactivity are the strongest early churn indicator, " +
  "while a return after a dormant period may still justify a light-touch, assistive outreach.";

// Default signal weights (0-1) implementing the eight default rules from the product spec:
//   1. Application creation within 24 hours is a strong activation signal.
//   2. Organization enablement is a stronger team signal than application creation alone.
//   3. Inviting two or more teammates indicates collaboration or expansion.
//   4. Repeated SSO documentation views may indicate enterprise requirements.
//   5. Pricing views without activation are weak intent signals.
//   6. Integration errors followed by inactivity increase churn risk.
//   7. Returning after inactivity may justify assistive outreach.
//   8. Subscription start represents conversion.
export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  applicationWithin24h: 0.9,
  organizationEnablement: 0.85,
  teammateInvitesThreshold: 0.7,
  repeatedSsoDocViews: 0.6,
  pricingViewsWithoutActivation: 0.3,
  integrationErrorsThenInactivity: 0.75,
  returningAfterInactivity: 0.5,
  subscriptionStart: 1,
};

export const DEFAULT_MESSAGING_GUIDANCE: MessagingGuidance = {
  rapid_team_activator:
    "Lead with team expansion and emerging SSO requirements -- this account activated fast and is already inviting collaborators.",
  enterprise_evaluator:
    "Lead with security/compliance readiness and enterprise plan fit; this account is actively researching SSO and pricing.",
  solo_builder:
    "Solo builder not yet ready for sales outreach -- nurture with product education rather than a sales-led motion.",
  stalled_implementer:
    "Offer implementation assistance after repeated errors; this account may be blocked on setup rather than uninterested.",
  returning_evaluator:
    "Returning evaluator showing renewed intent after a dormant period -- a light, assistive check-in may reopen the conversation.",
  converted_account:
    "Rapid activation and evaluation of advanced features -- position an expansion or upsell conversation.",
};

export const DEFAULT_KNOWN_LIMITATIONS =
  "Weights are hand-tuned heuristics, not learned from real conversion data. Company- and persona-fit " +
  "scores are derived from synthetic firmographic and title text and do not reflect real buying intent. " +
  "Small event-count prospects can swing priority sharply from a single new event.";
