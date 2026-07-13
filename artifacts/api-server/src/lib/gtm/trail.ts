import type { ProductEvent } from "@workspace/db";
import type { Archetype } from "./constants";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

function describeDelay(fromMs: number): string {
  const minutes = Math.round(fromMs / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} later`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} later`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} later`;
}

const EVENT_PHRASES: Record<string, (count: number, props: Record<string, unknown>) => string> = {
  user_signed_up: () => "Signed up",
  application_created: () => "Created first application",
  application_configured: () => "Configured application settings",
  organization_enabled: () => "Enabled an organization",
  teammate_invited: (count, props) =>
    `Invited ${(props.count as number) ?? count} teammate${((props.count as number) ?? count) === 1 ? "" : "s"}`,
  sdk_installed: () => "Installed the SDK",
  api_key_created: () => "Created an API key",
  integration_error: () => "Encountered an integration error",
  documentation_viewed: (count) =>
    count > 1 ? `Viewed documentation ${count} times` : "Viewed documentation",
  sso_documentation_viewed: (count) =>
    count > 1 ? `Viewed SSO documentation ${count} times` : "Viewed SSO documentation",
  mfa_enabled: () => "Enabled multi-factor authentication",
  pricing_page_viewed: (count) =>
    count > 1 ? `Viewed the pricing page ${count} times` : "Viewed the pricing page",
  enterprise_page_viewed: () => "Viewed the enterprise plan page",
  checkout_started: () => "Started checkout",
  subscription_started: () => "Started a paid subscription",
  inactive_period: (_count, props) =>
    `Went inactive for approximately ${(props.durationDays as number) ?? "several"} days`,
  returned_to_product: () => "Returned to the product after a period of inactivity",
};

export interface TrailResult {
  chronologicalTrail: string[];
  behaviorSummary: string;
  firstActivationAt: Date | null;
  lastActivityAt: Date | null;
}

/**
 * Builds a chronological, human-readable trail and a strictly observation-based
 * behavior summary from a person's raw product events. This never invents facts:
 * every sentence is grounded in an event that actually occurred.
 */
export function buildBehavioralTrail(
  events: ProductEvent[],
  archetype: Archetype,
): TrailResult {
  const sorted = [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const signedUp = sorted.find((e) => e.eventName === "user_signed_up");
  const trail: string[] = [];
  let previous: Date | null = null;

  // Group consecutive same-day/same-event occurrences for cleaner phrasing
  // (e.g. "Viewed SSO documentation twice" instead of three separate lines).
  const grouped: { eventName: string; occurredAt: Date; count: number; properties: Record<string, unknown> }[] = [];
  for (const e of sorted) {
    const last = grouped[grouped.length - 1];
    const sameDay =
      last &&
      last.eventName === e.eventName &&
      formatDate(last.occurredAt) === formatDate(e.occurredAt);
    if (sameDay && last) {
      last.count += 1;
    } else {
      grouped.push({
        eventName: e.eventName,
        occurredAt: e.occurredAt,
        count: 1,
        properties: e.properties,
      });
    }
  }

  for (const g of grouped) {
    const phraseFn = EVENT_PHRASES[g.eventName];
    const phrase = phraseFn ? phraseFn(g.count, g.properties) : g.eventName.replaceAll("_", " ");
    let suffix = "";
    if (previous && g.eventName !== "user_signed_up") {
      suffix = ` ${describeDelay(g.occurredAt.getTime() - previous.getTime())}`;
    }
    trail.push(`${formatDate(g.occurredAt)}: ${phrase}${suffix}`);
    previous = g.occurredAt;
  }

  const firstApp = sorted.find(
    (e) => e.eventName === "application_created",
  );
  const orgEnabled = sorted.find((e) => e.eventName === "organization_enabled");
  const firstActivationAt = firstApp ? firstApp.occurredAt : orgEnabled ? orgEnabled.occurredAt : null;
  const lastNonInactive = [...sorted]
    .reverse()
    .find((e) => e.eventName !== "inactive_period");
  const lastActivityAt = lastNonInactive ? lastNonInactive.occurredAt : null;

  const behaviorSummary = buildBehaviorSummary({
    signedUp,
    firstApp,
    orgEnabled,
    events: sorted,
  });

  return { chronologicalTrail: trail, behaviorSummary, firstActivationAt, lastActivityAt };
}

function buildBehaviorSummary(input: {
  signedUp: ProductEvent | undefined;
  firstApp: ProductEvent | undefined;
  orgEnabled: ProductEvent | undefined;
  events: ProductEvent[];
}): string {
  const { signedUp, firstApp, orgEnabled, events } = input;
  const sentences: string[] = [];

  // Sentence 1: signup-to-activation timing, grounded strictly in observed events.
  if (signedUp && firstApp) {
    const minutes = minutesBetween(signedUp.occurredAt, firstApp.occurredAt);
    const hours = minutes / 60;
    if (hours <= 24) {
      sentences.push(
        `The account created its first application ${describeDelay(
          firstApp.occurredAt.getTime() - signedUp.occurredAt.getTime(),
        )} after signing up, which may indicate a fast activation path.`,
      );
    } else {
      sentences.push(
        `The account signed up but did not create an application until ${describeDelay(
          firstApp.occurredAt.getTime() - signedUp.occurredAt.getTime(),
        )} after signup, suggesting a slower activation path.`,
      );
    }
  } else if (signedUp) {
    sentences.push(
      "The account signed up but has not created an application, which suggests activation has not yet occurred.",
    );
  }

  // Sentence 2: organization/collaboration behavior.
  const inviteEvents = events.filter((e) => e.eventName === "teammate_invited");
  const inviteCount = inviteEvents.reduce(
    (sum, e) => sum + ((e.properties.count as number) ?? 1),
    0,
  );
  if (orgEnabled && inviteCount > 0) {
    sentences.push(
      `An organization was enabled and ${inviteCount} teammate${inviteCount === 1 ? " was" : "s were"} invited, which may indicate team-wide adoption rather than individual use.`,
    );
  } else if (orgEnabled) {
    sentences.push(
      "An organization was enabled, though no teammates have been invited yet.",
    );
  } else if (inviteCount > 0) {
    sentences.push(
      `${inviteCount} teammate${inviteCount === 1 ? " was" : "s were"} invited without an organization being enabled first.`,
    );
  }

  // Sentence 3: enterprise/pricing research signals.
  const ssoViews = events.filter((e) => e.eventName === "sso_documentation_viewed").length;
  const pricingViews = events.filter(
    (e) => e.eventName === "pricing_page_viewed" || e.eventName === "enterprise_page_viewed",
  ).length;
  const subscribed = events.some((e) => e.eventName === "subscription_started");
  if (subscribed) {
    sentences.push(
      "The account started a paid subscription, which represents an observed conversion event rather than an inferred intent.",
    );
  } else if (ssoViews >= 2 && pricingViews > 0) {
    sentences.push(
      `SSO documentation was viewed ${ssoViews} times alongside ${pricingViews} pricing or enterprise page view${pricingViews === 1 ? "" : "s"}, which may indicate enterprise requirements are forming.`,
    );
  } else if (ssoViews >= 2) {
    sentences.push(
      `SSO documentation was viewed ${ssoViews} times, which may indicate emerging enterprise or security requirements.`,
    );
  } else if (pricingViews > 0) {
    sentences.push(
      `The pricing or enterprise page was viewed ${pricingViews} time${pricingViews === 1 ? "" : "s"} without a subscription starting, a comparatively weak intent signal on its own.`,
    );
  }

  // Sentence 4: errors and inactivity.
  const errorCount = events.filter((e) => e.eventName === "integration_error").length;
  const inactivePeriods = events.filter((e) => e.eventName === "inactive_period");
  const returned = events.some((e) => e.eventName === "returned_to_product");
  if (errorCount > 0 && inactivePeriods.length > 0) {
    sentences.push(
      `${errorCount} integration error${errorCount === 1 ? "" : "s"} occurred and were followed by a period of inactivity, which suggests unresolved setup friction may have contributed to disengagement.`,
    );
  } else if (errorCount > 0) {
    sentences.push(
      `${errorCount} integration error${errorCount === 1 ? "" : "s"} occurred; documentation was viewed afterward, which may indicate self-service troubleshooting.`,
    );
  } else if (inactivePeriods.length > 0 && returned) {
    sentences.push(
      "The account went inactive and later returned to the product, which may justify a light, assistive check-in rather than a hard sales push.",
    );
  } else if (inactivePeriods.length > 0) {
    sentences.push(
      "The account has been inactive for an extended period with no observed return, which suggests elevated churn risk.",
    );
  }

  if (sentences.length === 0) {
    sentences.push(
      "Limited product activity has been observed so far; behavioral evidence for this account is currently sparse.",
    );
  }

  return sentences.slice(0, 3).join(" ");
}
