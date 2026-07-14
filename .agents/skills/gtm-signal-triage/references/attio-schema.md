# Attio Schema Reference — GTM Signal Triage

Verified against the live workspace on 2026-06-22. If a write fails on an unknown slug, re-run
`list-attribute-definitions` for the object — the schema may have changed since.

## gtm_signals (custom object)

One record per person per batch.

| Title | api_slug | Type | Write guidance |
|---|---|---|---|
| Person | `person` | record-reference → people | `{"target_object": "people", "target_record_id": "<uuid>"}` |
| Company | `company` | record-reference → companies | `{"target_object": "companies", "target_record_id": "<uuid>"}` |
| Signal Date | `signal_date` | date | `YYYY-MM-DD`, no time |
| Behavior Trail | `behavior_trail` | text | Raw ordered PostHog event list, verbatim. "Not in PostHog" if no match |
| Signal Summary | `signal_summary` | text | Interpreted narrative — full brief (Step 4 only) |
| Research Notes | `research_notes` | text | Triage findings; ends with `Confidence: NN/100 — reason` |
| Batch | `batch` | text | Line 1: batch date (`2026-06-11`). Line 2: raw MD row verbatim |
| Auth Problem Angle | `auth_problem_angle_6` | select, **multiselect** | Pass array of EXISTING option titles only — Attio rejects unknown titles (verified 2026-06-11; options are NOT created on write). If no existing option fits, omit this field, name the proposed category in `research_notes` prefixed "AUTH PROBLEM ANGLE:", and flag in the chat summary so Christina can add the option in the Attio UI |
| Outreach Status | `outreach_status` | select | Exactly one of: `Not Started`, `Sent`, `Replied`, `Not a Fit`, `Drafting`, `In Review` |
| Generated Email | `generated_email` | record-reference → generative_ai_emails | Written automatically by Attio's relationship when the email record is created in Step 6 — do not write manually |

⚠️ `gtm_signals` has no `subject` or `body` fields. Email content is null on this object by
design. All email content belongs on `generative_ai_emails` only.

| Lifecycle Status | `lifecycle_status` | status (pipeline), **REQUIRED** | Agent writes exactly one of three: `Prospect` (worth pursuing — reach out now or wait), `Non-Qualified Lead`, or `Incorrect Info` (row data wrong, internal/test account, or false-positive record). Later stages (`Marketing Qualified Lead`, `Sales Qualified Lead`, `Sales Qualified Deal`, `Closed/Won`, `Closed/Lost`, `Nurture`) are owned by humans and downstream workflows — never set them |

Status semantics in this pipeline:
- `Not a Fit` — deprioritized at triage
- `Not Started` — Wait verdict; re-check trigger named in research_notes
- `In Review` — always set this when an email is drafted; all emails require human review before sending
- `Drafting` — do not use; kept for reference only
- `Sent` / `Replied` — owned by Christina's downstream workflow; never set these

## generative_ai_emails (custom object)

The three content fields below are **required** — record creation is atomic and arms the
Attio workflow. Create only for Reach Out Now verdicts with final drafts.

| Title | api_slug | Type | Write guidance |
|---|---|---|---|
| subject | `subject` | text, required | Sentence case, problem-specific |
| body | `body` | text, required | Plain text. No markdown, no HTML. End with sender first name + email (see Step 5 round-robin). Full signature block is appended by Christina's Attio workflow — do not add title or company |
| agent_confidence | `agent_confidence` | select, required | Exactly one of: `low`, `medium`, `high` (lowercase) |
| outreach_tier | `outreach_tier` | select, required | Exactly one of: `low`, `medium`, `high` (lowercase). Derived from ICP tier rules in Step 4. All emails default to In Review regardless of tier — no auto-send. |
| sender_email | `sender_email` | text, required | Sender's email from the round-robin (e.g. `christina@clerk.dev`). Used by Attio workflow to route to the correct sending mailbox. |
| GTM Signal - Person | `gtm_signal_person` | record-reference → gtm_signals (relationship) | Reference the GTM Signal record created in Step 3 |

`sender` (legacy field) is **not required** — omit it.

⚠️ Email content does not belong on `gtm_signals`. The `subject` and `body` of any outreach
email live exclusively on `generative_ai_emails`. Never write email content to GTM Signal
fields — those fields do not exist on this object and any attempt will fail.

If creation fails with a permission error on this object, stop and tell Christina to check the
object's access settings in Attio (Settings → Objects → Generative AI Emails) — do not retry
blindly or write the email into a different field as a workaround.

## people / companies (standard objects)

Match before creating:
- Company: `search-records` by domain first, then name
- Person: `search-records` by email first, then name

Enrichment updates via `update-record` when verified research contradicts stored values.
Known-stale fields to watch: `estimated_arr_usd`, `employee_range`, funding fields,
`categories`, description. Records older than 6 months: treat all enrichment as hypothesis.

## Tool call order per person

1. `PostHog:exec` — person/domain lookup + event trail
2. `Attio:search-records` (companies) → `Attio:create-record` if no match
3. `Attio:search-records` (people) → `Attio:create-record` if no match
4. `Attio:create-record` (gtm_signals)
5. *(Reach Out Now only)* web research → `Attio:update-record` for stale fields →
   `Attio:update-record` (gtm_signals: `signal_summary`, `auth_problem_angle_6`, `outreach_status`)
   ⚠️ Do NOT write `outreach_tier` to gtm_signals — it does not exist on that object
6. *(Reach Out Now only)* `Attio:create-record` (generative_ai_emails) with `outreach_tier`, `sender_email`, `agent_confidence`, `subject`, `body`, `gtm_signal_person`
7. *(Reach Out Now only)* `Attio:add-record-to-list` → Growth Campaign - H2 F27

---

## Growth Campaign - H2 F27 (list on People)

List ID: `0e1be6c1-57e0-49b3-b569-0112bed21fb8`
API slug: `press_outreach_2`
Parent object: `people`

Add every person with a Reach Out Now verdict to this list at the end of Step 5.

| Title | api_slug | Type | Write guidance |
|---|---|---|---|
| Contact Owner | `contact_owner` | actor-reference | Set to the assigned sender's email (e.g. `christina@clerk.dev`). This is the round-robin sender for this person. |
| Outreach type | `outreach_type` | select | Always `Growth Outreach` |
| Outreach topic | `outreach_topic` | select | Always `New User - What are you building?` |
| Status | `status` | status | Set to `Approaching` on add |
| Priority | `priority` | select | Optional — mirror `outreach_tier` if useful: `high` → `High`, `medium` → `Medium`, `low` → `Low` |
| Notes | `notes` | text | Optional — can mirror a one-line summary from `signal_summary` |

`Entry ID`, `Added to list at`, and `Added to list by` are system fields — not writable.
