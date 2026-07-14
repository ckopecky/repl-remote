---
name: gtm-signal-triage
description: >
  Triage funded founder batches into Attio GTM Signal records and product-researcher outreach
  drafts for Clerk. Use whenever Christina pastes a table of founders, prospects, or contacts to
  triage, research, or add to Attio — even without the word "triage". Trigger on "run this
  batch", "process these founders", "do they have Clerk accounts", "add these to GTM Signals",
  or any pasted MD/CSV with company + contact + funding columns. Checks PostHog first (account?
  app created?), triages, writes Person + Company + GTM Signal records, produces enriched briefs,
  deduces Auth Problem Angle, and drafts emails into Generative AI Emails for reach-out-now
  verdicts. Also trigger in PostHog-first cohort mode on "run the cohort", "who
  signed up but didn't ship", "who hit the paywall", or "find users to talk to". Supersedes
  funded-founders-daily-outreach, clerk-gtm-researcher, and clerk-growth-intent for triage and
  user-conversation sourcing.
---

# GTM Signal Triage

Understand why someone signed up for Clerk — then leave a complete paper trail in Attio: Person,
Company, GTM Signal record, and — where timing is right — a ready-to-review email in Generative AI Emails.

**The posture is product researcher, not seller.** Core questions for every person:
1. Do they have a Clerk account?
2. Have they created an app?
3. If not → why not? If yes → what are they building, and how is it going?

Every answer is useful. Curiosity about their build is the product. The email is a side effect.

---

## Entry Points

### Mode A — Batch (list-first)

A markdown table pasted into chat. Columns vary; work with whatever exists — don't ask for more.
Funding lists are mostly not-yet-users, so expect cold outreach. Cap at 10 people per run.

### Mode B — Cohort (PostHog-first)

For "find users to talk to" requests. Cap at 10 people per run; pick most recent or
highest-signal first. Start in PostHog, work outward. Cohorts in priority order:

| Cohort | PostHog definition | Email mode |
|---|---|---|
| **Stalled signups** | `Dashboard Sign Up` last 30–60 days, no app created since | Mode 2 — signed up, didn't build |
| **Gone-quiet builders** | App created, no events for 21+ days | Mode 3 — where did momentum stop |
| **Paywall non-upgraders** | `Dashboard_Paywall_Shown` without `Dashboard_Billing Screen_Plan Upgraded` | Mode 3 paywall variant |
| **Pricing modelers** | `pricing_calculator_estimated`, no checkout since | Mode 3 — what they modeled |
| **Interesting signups** | `Dashboard Sign Up` last 30–60 days + fast compounding activity: app created within days, team members added, week-over-week event growth | Mode 3, pure curiosity |

Cohort-mode pipeline differences vs batch:
- Steps run in reverse: PostHog cohort query → email/domain → Attio match-or-create → web enrichment → GTM Signal → email
- `batch` field line 1: `[cohort name] YYYY-MM-DD` · line 2: PostHog person identifier + signup date
- Paying customers and sales-form submitters are escalations (see Step 2), not cohort members
- For **interesting signups**: a recent self-serve upgrade is part of the signal, not a disqualifier — flag as upgraded in research_notes, keep email purely curious

**Batch ID:** today's date in `YYYY-MM-DD` format unless the user names the batch.

---

## ⚠️ Session Start: Resume Check

Before doing anything else — before PostHog, before reading the batch — run this check every time the skill is invoked.

1. **Call `whoami`** to get your workspace member ID.
2. **Search `gtm_signals`** for any record where `lifecycle_status` = `Incomplete Info` and `batch` starts with `__checkpoint__`.
3. If a match is found, read its `research_notes` field and parse the `OWNER` value.
4. If `OWNER` matches your workspace member ID → surface this message and stop:

> "Found an open batch from [date] — [COMPLETED] of [TOTAL] processed, [N] remaining ([REMAINING]). Resume where we left off?"

- **Yes** → restore state from the checkpoint (skip COMPLETED people, restore SENDER_INDEX, carry PENDING_FLAGS into Step 6), then continue the pipeline from the next unprocessed person.
- **No** → leave the checkpoint record untouched and proceed with the new batch fresh.

5. If no open checkpoint matches your member ID, proceed normally.

### Checkpoint record structure

One record per batch, written to `gtm_signals` at the start of the first person:

- `batch` = `__checkpoint__[batch_id]` (e.g. `__checkpoint__2026-06-21`)
- `gtm_signal_person_name` = same as `batch` value (required display title)
- `lifecycle_status` = `Incomplete Info`
- `research_notes` = structured block (plain text):

```
OWNER: [workspace_member_id from whoami]
STATUS: in_progress
TOTAL: 10
COMPLETED: alice@foo.com, bob@bar.com
REMAINING: carol@baz.com, dan@qux.com
SENDER_INDEX: 1
PENDING_FLAGS: Escalation — dan@example.com needs human review
```

### Checkpoint update cadence

After each person completes Step 3 (Attio write confirmed), update the checkpoint record's `research_notes` — move that person from REMAINING to COMPLETED, update SENDER_INDEX, append any new PENDING_FLAGS.

When the batch completes, update `STATUS: complete`. Do not delete the record — it serves as a run history.

---

## ⚠️ Before Any Query: PostHog Project

Switch to **Production (86309)** before every run. The MCP connection defaults to Development
(82324), which is ~82% internal dogfooding and will return false "not in system" results.
Call `switch-project` first — every time, no exceptions.

---

## ⚠️ Internal Traffic Filter

Before creating any escalation or email for a personal-domain account, confirm the person isn't
a Clerk employee. Tells of internal traffic: instant app config at signup, heavy feature-flag
volume, repeated marketing-page variant events, sales-form submissions with no follow-up
expectation. Filter `%clerk%` emails but know team members dogfood under personal domains.
Report the internal/external split in the chat summary every run.

---

## Pipeline

Run per person, in this order.

### Step 1 — PostHog check

**Check A — Person lookup:** search by email, then company domain.

**Check B — Recent activity (if matched):** pull events for last 90 days, ordered. Key events:

| Event | Meaning |
|---|---|
| `Dashboard Sign Up` | Has an account |
| `Dashboard_Applications_New Application Card Clicked` | Created/creating an app |
| `pricing_calculator_estimated` | Modeling pricing (check `plan` property) |
| `Dashboard_Paywall_Shown` | Hit a feature limit |
| `Dashboard_Checkout_Opened` | Started checkout |
| `Dashboard_Billing Screen_Plan Upgraded` | **Paying customer — flag as expansion, skip pipeline** |
| `Sales contact form submitted` | **Highest intent — escalate, skip pipeline** |

Also capture `$referring_domain` / `$initial_referring_domain` — reveals signup trigger.

**Classify:**

| State | Research lens |
|---|---|
| No account | Standard prospect — is this even a fit? |
| Account, no app | Signed up but didn't build — what stopped them? |
| Account + app | Builder — what are they building, where's the friction? |
| Paying / sales form | Escalation — flag and stop, no email |

Save the raw ordered event list verbatim for `behavior_trail`.

### Step 2 — Timing verdict

Apply ICP in `references/icp.md` for context, but the goal isn't to disqualify — it's to decide
when and how to reach out.

**Escalation rule:** paying customers or sales-form submitters found at any step → write GTM
Signal with ESCALATION header in research_notes, create Attio task with same-day deadline linked
to the person, draft no email. Stop here.

**Verdict, stated plainly:** `Reach out now` / `Wait — [specific trigger]` / `Skip — [reason, e.g. bad data / internal account]`.
No softening. End triage notes with `Confidence: NN/100 — [one-line reason]`.

### Step 3 — Write to Attio (every person, every verdict)

See `references/attio-schema.md` for full slugs, types, and write guidance.

1. **Company:** search by domain → name. Match → use it. No match → create.
2. **Person:** search by email → name. Match → use it. No match → create.
3. **GTM Signal record:**
   - `person`, `company`, `signal_date` (today), `batch`, `behavior_trail`, `research_notes`
   - `gtm_signal_person_name` — **required.** Format: `[Person Full Name] — [Company Name] — [Lifecycle Status]` e.g. `Royce Hsu — Dutch Vet — Prospect`. Use the lifecycle status from the verdict. This is the display title for the record.
   - `lifecycle_status` — **required.** `Prospect` (reach out / wait) · `Non-Qualified Lead` (not a fit) · `Incorrect Info` (bad data, internal account)
   - `outreach_status` — `Not a Fit` (deprioritize) · `Not Started` (wait) · set in Step 4 if proceeding

Stop here for **wait** and **not a fit** verdicts.

### Step 4 — Full brief (Reach Out Now verdicts)

Research: accelerator history, funding round (verify against the row — data drifts), recent
coverage, stack signals (job postings, GitHub, privacy-policy trick: fetch `[domain]/privacy`
for third-party auth disclosures). Connect funding/launch timeline to PostHog trail — tell the
story, don't just list findings.

Update stale Attio fields with `update-record`; note corrections in research_notes.

Write `signal_summary`:
```
[2–3 sentences: who they are, stage, what they're building, vs. Clerk's best-customer profile]

Why now: [the moment — funding, launch, event history inflection]
PostHog story: [plain-language interpretation of the trail]
Auth angle: [the specific auth problem shaping up]
Verdict: Reach out now — [the one true, timely, specific hook]
```

**Auth Problem Angle:** write to `auth_problem_angle_6` using existing option titles only —
Attio rejects unknown titles. If no option fits, omit the field, record "AUTH PROBLEM ANGLE:
[category]" in research_notes, and flag in the chat summary. Live options (verified 2026-06-11):
`Multi-Tenancy & Orgs` · `Enterprise SSO/SAML` · `DIY Auth Replacement` · `Legacy Provider
Migration` · `Agentic/Service Auth` · `B2C Scale Auth` · `Compliance (BAA/HIPAA)` ·
`Activation Stalled` · `Pricing Eval`

If a write fails on an unknown title, re-fetch via `list-attribute-definitions` before retrying.

Assign `outreach_tier` using the tier rules in `references/icp.md` — `high`, `medium`, or `low`.
If research confirms a hard disqualifier (employee_range > 1,000 or any Not a Fit criterion),
update `lifecycle_status` to `Non-Qualified Lead`, note the reason in `research_notes`, and
stop — no email.

Set `outreach_status` to `In Review`.

### Step 5 — Draft the email (Reach Out Now only)

Read `references/email-voice.md` before writing. Frame by PostHog state:

| State | Frame |
|---|---|
| No account | Dev-to-dev cold note about the specific auth problem their stage implies |
| Account, no app | Honest question — "what got in the way?" Every answer is useful |
| Account + app | Product feedback — what are you building, how's it going, where's the friction |

**Sender — round-robin, state persisted across sessions:**

Senders in rotation order:
1. Christina Kopecky — christina@clerk.dev
2. Yuri Santana — yuri@clerk.dev
3. Akriti Keswani — akriti@clerk.dev

**Before drafting any email this run**, retrieve the current sender index from Attio:
- Search for a record in `gtm_signals` where `batch` = `__sender_state__`
- The `research_notes` field holds the last-used sender index (0, 1, or 2)
- If no record exists, create one with `batch` = `__sender_state__`, `research_notes` = `0`, `lifecycle_status` = `Incomplete Info` (so it never surfaces in real pipeline views)

Assign senders sequentially to emails created this run, starting from `(last_index + 1) % 3`.
Count only emails actually created — Wait/Skip verdicts do not advance the index.

**After the last email is created**, update the `__sender_state__` record's `research_notes` to the index of the last sender used this run.

Write the sender's first name + email as the `body` sign-off — first name on one line, email on the next. Do not add title or company — Christina's Attio workflow appends the full signature block.

Create `generative_ai_emails` record with these fields:
- `subject` — required. First word is ALWAYS capitalized. All other words lowercase unless they are a proper noun (e.g. a person's name, company name) or a Clerk product name (e.g. Clerk, Organizations, B2B). Never title case. Example: "Auth for your new platform" not "auth for your new platform" and not "Auth For Your New Platform".
- `body` — required. Plain text, no markdown, no HTML. End with sender first name + email as above.
- `agent_confidence` — required. Exactly one of: `low` / `medium` / `high`
- `outreach_tier` — required. Exactly one of: `low` / `medium` / `high`. Derived in Step 4.
- `sender_email` — required. The sender's email address from the round-robin (e.g. `christina@clerk.dev`).
- `gtm_signal_person` — reference to the GTM Signal record created in Step 3

`sender` (the legacy field) is not required — omit it.

Only create for Reach Out Now verdicts with final drafts.

**After creating the email record**, add the Person to the `Growth Campaign - H2 F27` list
and assign the sender as contact owner:

```
add-record-to-list:
  list: "press_outreach_2"
  parent_object: "people"
  parent_record_id: [Person record ID from Step 3]
  entry_values:
    contact_owner: [sender email from round-robin, e.g. "christina@clerk.dev"]
    outreach_type: "Growth Outreach"
    outreach_topic: "New User - What are you building?"
    status: "Approaching"
    gtm_signal: [GTM Signal record ID from Step 3]
```

If the person is already in the list (duplicate error), update the existing entry instead using
`update-list-entry-by-record-id` with the same `entry_values` (including `gtm_signal`).

### Step 6 — Report back

One compact table only — no per-person narration during the run:

`Person · Company · PostHog state · Verdict · Confidence · Auth angle · Email (Y/N)`

Below the table, flag anything needing human attention: escalations, stale-data corrections,
new Auth Problem Angle categories to add in Attio UI, internal/external split.

---

## Rules

- **PostHog before everything.** Never research or draft before knowing account state.
- **Never cold-pitch someone already in the system.** Acknowledge what they've done.
- **Researcher, not seller.** "No" or "we went with Supabase" is a welcome answer.
- **No fabricated urgency.** No real moment → verdict is Wait, trigger named.
- **Direct verdicts.** Timing calls stated plainly — no hedging.
- **Stale data is a hypothesis.** Verify before it shapes a verdict; fix the record when wrong.
- **Email record = armed trigger.** Reach Out Now verdicts only, finished drafts only.
- **Suppress mid-run chatter.** Work silently per person; surface only the Step 6 table.
