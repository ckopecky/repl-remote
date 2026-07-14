# ICP & Triage Reference

## What Clerk is, in one breath

Auth infrastructure for teams that would rather buy than build login, sessions, org hierarchies,
and SSO. Clerk's customer is the engineer or technical founder building the product — not the
product's end users. End users can be shoppers, patients, lawyers, or enterprise teams; what
matters is whether the company has engineers making infrastructure decisions.

## Strong fit

- Developer-led or PLG company
- Building a product with end users who log in, manage accounts, or hit access-controlled features
- Modern JS stack (Next.js, React, Node — any signal)
- Pre-seed to Series A/B, 2–50 employees
- Needs: authentication, authorization, organizations, multi-tenancy, or API access management
- Buying motion: an individual engineer can evaluate and adopt without procurement

## Not a fit

- No engineering team making infra decisions (agencies, dev shops, consultancies)
- Auth solved: 1,000+ employees, late stage, established platform
- Procurement-driven buying only
- Deep custom authorization (ABAC at scale, policy engines)
- Compliance-heavy identity layer (FedRAMP, KYC/AML at identity, FINRA)

**Healthcare:** in scope — Clerk signs BAAs. Disqualifier is EHR-level clinical identity or
FDA-regulated device identity, not the vertical.

## Auto-disqualify from row/Attio data alone (no research spend)

- `employee_range` > 1000
- `estimated_arr_usd` > $50M
- Categories: Education, Government, Manufacturing, Travel, Agriculture, Retail, Energy
- Agency / consultancy / dev shop in description
- Acquired company
- Research university, non-profit, VC firm
- No domain anywhere → flag as incomplete record, verdict Wait pending enrichment

## Best-customer calibration set

Compare prospects against: Browserbase (browser automation infra), Braintrust (AI evals),
Inngest (event-driven workflows), OpenRouter (AI model routing), Upstash (serverless
Redis/Kafka), Higgsfield (AI video), Cartesia (real-time voice AI), Consensus (AI research),
Samaya AI (enterprise AI research), Durable (AI website builder), Fashionphile (B2C luxury
resale — proof that the end user type doesn't matter when the engineering team is the buyer).

## Highest-signal moments (proven across live research)

1. Self-service platform just launched — multi-org access model appears overnight
2. Multi-tenancy on the public roadmap but not shipped
3. Auth built in-house recently, visible in changelog — they know the pain
4. Single OAuth provider at scale — breaks when enterprise IT asks for SAML
5. Ground-up platform rebuild — every infra decision is back on the table
6. YC-backed, tiny team, developer tooling — converts best
7. Privacy policy names Auth0/Firebase/Cognito — replaceable legacy auth
8. Personal Gmail in signup data — individual evaluator, warmer tone

## Data staleness (verified failure modes)

- Funding can be wildly outdated (record showed $2.2M; reality was $115M)
- Acquisitions go unrecorded for months
- Employee counts drift 5–20x
- Descriptions describe the previous product

Any record older than 6 months: treat stored funding/employee/category data as a hypothesis.
Verify before it shapes a verdict, and fix the record when wrong.

## Outreach Tier

Assign `outreach_tier` in Step 4. Used by the Attio workflow to route emails to auto-send vs. human review.

**`high`** — strong ICP match + a live high-signal moment:
- YC-backed, 2–50 employees, developer tooling or AI-adjacent
- Privacy policy names Auth0 / Firebase / Cognito (actively replaceable)
- Multi-tenancy on public roadmap or self-serve platform just launched
- Ground-up rebuild underway
- Calibration set proximity: looks like Browserbase, Braintrust, Inngest, Upstash, OpenRouter

**`medium`** — solid ICP fit but no live moment, or weaker fit with a strong moment:
- Pre-seed to Series A, modern stack, right size — but no urgent trigger visible
- Series B+, 51–150 employees, but clear auth pain signal present
- PostHog shows account + app but no paywall or pricing activity yet

**`low`** — fit is present but weak, unclear, or partially disqualified:
- Right stage/size but no stack signal, no auth moment visible
- Funding data stale and couldn't be verified
- 151–1,000 employees — possible fit but procurement risk
- Auto-disqualify criteria partially met (e.g. borderline category, borderline size)

**Auto-disqualify (no tier, no email):** `employee_range` > 1,000, or any hard disqualifier
from the Not a Fit list above. Record the reason in `research_notes` and stop.
