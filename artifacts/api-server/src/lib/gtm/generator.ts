import { faker } from "@faker-js/faker";
import type { InsertCompany, InsertPerson, InsertProductEvent } from "@workspace/db";
import { EVENT_CATEGORY, type Archetype, type ProductEventName } from "./constants";

const INDUSTRIES = [
  "Financial Services",
  "Healthcare Technology",
  "E-commerce",
  "Developer Tools",
  "Logistics",
  "Cybersecurity",
  "Marketing Technology",
  "Insurance",
  "EdTech",
  "Climate Tech",
];

const PRODUCT_CATEGORIES = [
  "API Infrastructure",
  "Workflow Automation",
  "Data Platform",
  "Identity & Access",
  "Payments",
  "Observability",
];

const FUNDING_STAGES = [
  "Bootstrapped",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Public",
];

const DEPARTMENTS_BY_SENIORITY: Record<string, string[]> = {
  "Individual Contributor": ["Engineering", "Product", "Data", "Design"],
  Manager: ["Engineering", "Product", "Operations", "Marketing"],
  Director: ["Engineering", "Revenue Operations", "IT", "Product"],
  VP: ["Engineering", "Sales", "Product", "IT"],
  "C-Level": ["Executive", "Engineering", "Operations"],
};

const SENIORITIES = [
  "Individual Contributor",
  "Manager",
  "Director",
  "VP",
  "C-Level",
];

const PURCHASE_ROLES: Record<string, string> = {
  "Individual Contributor": "influencer",
  Manager: "influencer",
  Director: "champion",
  VP: "economic_buyer",
  "C-Level": "economic_buyer",
};

const PERSONAS_BY_DEPARTMENT: Record<string, string> = {
  Engineering: "Technical Implementer",
  Product: "Product Strategist",
  Data: "Data Practitioner",
  Design: "Design Practitioner",
  Operations: "Ops Generalist",
  Marketing: "Growth Marketer",
  "Revenue Operations": "RevOps Analyst",
  IT: "IT Administrator",
  Sales: "Sales Leader",
  Executive: "Executive Sponsor",
};

export interface GeneratedEvent {
  eventName: ProductEventName;
  occurredAt: Date;
  source: string;
  properties: Record<string, unknown>;
}

export interface GeneratedProspect {
  company: InsertCompany;
  person: Omit<InsertPerson, "companyId">;
  events: GeneratedEvent[];
}

function pick<T>(arr: readonly T[]): T {
  return faker.helpers.arrayElement(arr as T[]);
}

/** Picks a random, deduplicated subset of `arr` of size between `min` and `max` (inclusive). */
function pickMany<T>(arr: readonly T[], min: number, max: number): T[] {
  const count = faker.number.int({ min, max: Math.min(max, arr.length) });
  return faker.helpers.arrayElements(arr as T[], count);
}

const EMPLOYEE_RANGE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "1-10", min: 1, max: 10 },
  { label: "11-50", min: 11, max: 50 },
  { label: "51-200", min: 51, max: 200 },
  { label: "201-500", min: 201, max: 500 },
  { label: "501-1000", min: 501, max: 1000 },
  { label: "1001-5000", min: 1001, max: 5000 },
  { label: "5000+", min: 5001, max: Infinity },
];

/** Maps a raw employee count to the standard headcount bucket(s) it falls into. */
function employeeRangeFor(count: number): string[] {
  const bucket =
    EMPLOYEE_RANGE_BUCKETS.find((b) => count >= b.min && count <= b.max) ??
    EMPLOYEE_RANGE_BUCKETS[EMPLOYEE_RANGE_BUCKETS.length - 1]!;
  return [bucket.label];
}

/** Returns the funding stages a company has raised through, in order, up to and including `currentStage`. */
function fundingStageHistory(currentStage: string): string[] {
  const idx = FUNDING_STAGES.indexOf(currentStage);
  return idx === -1 ? [currentStage] : FUNDING_STAGES.slice(0, idx + 1);
}

function hoursAfter(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function daysAfter(base: Date, days: number): Date {
  return hoursAfter(base, days * 24);
}

export function generateCompany(): InsertCompany {
  const employeeCount = faker.number.int({ min: 4, max: 6000 });
  const fundingStage =
    employeeCount > 1500
      ? pick(["Series C", "Public"])
      : employeeCount > 300
        ? pick(["Series B", "Series C"])
        : employeeCount > 50
          ? pick(["Series A", "Series B"])
          : pick(["Bootstrapped", "Seed", "Series A"]);
  const hasFunding = fundingStage !== "Bootstrapped";
  const icpFitScore = Math.round(
    faker.number.float({ min: 20, max: 96 }) +
      (employeeCount > 100 && employeeCount < 3000 ? 3 : 0),
  );

  return {
    name: faker.company.name(),
    domain: faker.internet.domainName(),
    industry: pickMany(INDUSTRIES, 1, 2),
    employeeCount,
    employeeRange: employeeRangeFor(employeeCount),
    fundingStage: fundingStageHistory(fundingStage),
    latestFundingDate: hasFunding
      ? faker.date.past({ years: 2 }).toISOString().slice(0, 10)
      : null,
    fundingAmount: hasFunding
      ? faker.number.int({ min: 500_000, max: 250_000_000 })
      : null,
    headquarters: `${faker.location.city()}, ${faker.location.countryCode()}`,
    productCategory: pickMany(PRODUCT_CATEGORIES, 1, 2),
    technologyContext: `${pick(["React", "Vue", "Django", "Rails", "Go", "Java/Spring"])} stack, ${pick([
      "AWS",
      "GCP",
      "Azure",
    ])}-hosted`,
    growthSignal: pick([
      "Recently raised funding",
      "Hiring surge in engineering",
      "Expanding into new markets",
      "Steady headcount growth",
      "Recent leadership change",
    ]),
    icpFitScore: Math.min(99, Math.max(1, icpFitScore)),
  };
}

export function generatePerson(): Omit<InsertPerson, "companyId"> {
  const seniority = pick(SENIORITIES);
  const department = pick(DEPARTMENTS_BY_SENIORITY[seniority]!);
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const titlePrefix =
    seniority === "C-Level"
      ? "Chief"
      : seniority === "VP"
        ? "VP of"
        : seniority === "Director"
          ? "Director of"
          : seniority === "Manager"
            ? `${department} Manager,`
            : "";
  const title =
    seniority === "C-Level"
      ? `Chief ${pick(["Technology", "Product", "Revenue", "Operating"])} Officer`
      : `${titlePrefix} ${department}`.trim();

  return {
    firstName,
    lastName,
    email: faker.internet
      .email({ firstName, lastName, provider: "example.com" })
      .toLowerCase(),
    profileUrl: `https://app.example.com/u/${faker.string.alphanumeric(10).toLowerCase()}`,
    title,
    department,
    seniority,
    persona: PERSONAS_BY_DEPARTMENT[department] ?? "Practitioner",
    purchaseRole: PURCHASE_ROLES[seniority]!,
    startDate: faker.date.past({ years: 3 }),
    contactPriority: pick(["High", "Medium", "Low"]),
    signupDate: faker.date.past({ years: 1 }),
    lifecycleStage: "prospect",
    archetype: "solo_builder",
  };
}

function ev(
  eventName: ProductEventName,
  occurredAt: Date,
  sessionId: string,
  properties: Record<string, unknown> = {},
): GeneratedEvent {
  return {
    eventName,
    occurredAt,
    source: pick(["web_app", "mobile_app", "api", "cli"]),
    properties: { sessionId, ...properties },
  };
}

/**
 * Generates a realistic, weighted event sequence for a given archetype, anchored on signupDate.
 * All timestamps are derived deterministically relative to signupDate using the seeded faker RNG.
 */
export function generateEventSequence(
  archetype: Archetype,
  signupDate: Date,
  now: Date,
): GeneratedEvent[] {
  const events: GeneratedEvent[] = [];
  const session = () => faker.string.uuid();

  events.push(ev("user_signed_up", signupDate, session()));

  switch (archetype) {
    case "rapid_team_activator": {
      const appAt = hoursAfter(signupDate, faker.number.float({ min: 0.2, max: 20 }));
      events.push(ev("application_created", appAt, session()));
      events.push(
        ev("application_configured", hoursAfter(appAt, faker.number.int({ min: 1, max: 6 })), session()),
      );
      const orgAt = hoursAfter(appAt, faker.number.int({ min: 2, max: 12 }));
      events.push(ev("organization_enabled", orgAt, session()));
      const inviteCount = faker.number.int({ min: 3, max: 9 });
      events.push(
        ev("teammate_invited", hoursAfter(orgAt, 1), session(), { count: inviteCount }),
      );
      events.push(ev("sdk_installed", daysAfter(signupDate, 1), session()));
      events.push(ev("api_key_created", daysAfter(signupDate, 1), session()));
      const returnDays = faker.helpers.arrayElement([2, 3, 5, 7, 9, 12]);
      for (const d of [returnDays, returnDays + 3, returnDays + 7]) {
        if (daysAfter(signupDate, d) < now) {
          events.push(ev("documentation_viewed", daysAfter(signupDate, d), session()));
        }
      }
      break;
    }
    case "enterprise_evaluator": {
      const appAt = daysAfter(signupDate, faker.number.float({ min: 0.5, max: 3 }));
      events.push(ev("application_created", appAt, session()));
      const orgAt = daysAfter(appAt, faker.number.int({ min: 1, max: 3 }));
      events.push(ev("organization_enabled", orgAt, session()));
      events.push(
        ev("teammate_invited", hoursAfter(orgAt, 4), session(), {
          count: faker.number.int({ min: 1, max: 3 }),
        }),
      );
      const ssoViews = faker.number.int({ min: 2, max: 5 });
      let cursor = daysAfter(signupDate, 3);
      for (let i = 0; i < ssoViews; i++) {
        cursor = daysAfter(cursor, faker.number.int({ min: 1, max: 4 }));
        if (cursor >= now) break;
        events.push(ev("sso_documentation_viewed", cursor, session()));
      }
      events.push(ev("enterprise_page_viewed", daysAfter(signupDate, 4), session()));
      events.push(ev("pricing_page_viewed", daysAfter(signupDate, 5), session()));
      events.push(ev("mfa_enabled", daysAfter(signupDate, 6), session()));
      break;
    }
    case "solo_builder": {
      const appAt = daysAfter(signupDate, faker.number.float({ min: 0.1, max: 2 }));
      events.push(ev("application_created", appAt, session()));
      events.push(ev("api_key_created", hoursAfter(appAt, faker.number.int({ min: 1, max: 5 })), session()));
      events.push(ev("sdk_installed", hoursAfter(appAt, faker.number.int({ min: 2, max: 10 })), session()));
      const docViews = faker.number.int({ min: 0, max: 3 });
      let cursor = appAt;
      for (let i = 0; i < docViews; i++) {
        cursor = daysAfter(cursor, faker.number.int({ min: 1, max: 5 }));
        if (cursor >= now) break;
        events.push(ev("documentation_viewed", cursor, session()));
      }
      break;
    }
    case "stalled_implementer": {
      const appAt = daysAfter(signupDate, faker.number.float({ min: 0.5, max: 2 }));
      events.push(ev("application_created", appAt, session()));
      const errorCount = faker.number.int({ min: 2, max: 5 });
      let cursor = appAt;
      for (let i = 0; i < errorCount; i++) {
        cursor = hoursAfter(cursor, faker.number.int({ min: 2, max: 30 }));
        if (cursor >= now) break;
        events.push(ev("integration_error", cursor, session()));
        events.push(ev("documentation_viewed", hoursAfter(cursor, 1), session()));
      }
      const inactiveStart = daysAfter(appAt, faker.number.int({ min: 3, max: 6 }));
      if (inactiveStart < now) {
        events.push(
          ev("inactive_period", inactiveStart, session(), {
            durationDays: faker.number.int({ min: 10, max: 40 }),
          }),
        );
      }
      break;
    }
    case "returning_evaluator": {
      const inactiveStart = daysAfter(signupDate, faker.number.int({ min: 1, max: 4 }));
      events.push(
        ev("inactive_period", inactiveStart, session(), {
          durationDays: faker.number.int({ min: 20, max: 60 }),
        }),
      );
      const returnAt = daysAfter(inactiveStart, faker.number.int({ min: 25, max: 65 }));
      if (returnAt < now) {
        events.push(ev("returned_to_product", returnAt, session()));
        events.push(ev("application_configured", hoursAfter(returnAt, 2), session()));
        events.push(ev("pricing_page_viewed", daysAfter(returnAt, 1), session()));
        events.push(ev("sso_documentation_viewed", daysAfter(returnAt, 2), session()));
      }
      break;
    }
    case "converted_account": {
      const appAt = hoursAfter(signupDate, faker.number.float({ min: 1, max: 18 }));
      events.push(ev("application_created", appAt, session()));
      const orgAt = hoursAfter(appAt, faker.number.int({ min: 2, max: 10 }));
      events.push(ev("organization_enabled", orgAt, session()));
      events.push(
        ev("teammate_invited", hoursAfter(orgAt, 3), session(), {
          count: faker.number.int({ min: 2, max: 6 }),
        }),
      );
      events.push(ev("enterprise_page_viewed", daysAfter(signupDate, 3), session()));
      events.push(ev("pricing_page_viewed", daysAfter(signupDate, 4), session()));
      events.push(ev("checkout_started", daysAfter(signupDate, 5), session()));
      const subAt = daysAfter(signupDate, faker.number.int({ min: 5, max: 8 }));
      if (subAt < now) {
        events.push(ev("subscription_started", subAt, session()));
      }
      events.push(ev("mfa_enabled", daysAfter(signupDate, 9), session()));
      break;
    }
  }

  return events
    .filter((e) => e.occurredAt <= now)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

export function toProductEventRows(
  personId: number,
  companyId: number,
  events: GeneratedEvent[],
): InsertProductEvent[] {
  return events.map((e) => ({
    personId,
    companyId,
    sessionId: (e.properties.sessionId as string) ?? faker.string.uuid(),
    eventName: e.eventName,
    eventCategory: EVENT_CATEGORY[e.eventName],
    occurredAt: e.occurredAt,
    source: e.source,
    properties: e.properties,
  }));
}
