---
name: Attio custom object sync quirks
description: Lessons from fixing the gtm_signals / generative_ai_emails sync pipeline against the live Attio workspace.
---

# Attio Custom Object Sync Quirks

## List entry payload shape (Attio v2)
`POST /lists/{id}/entries` requires `data.parent_object` + `data.parent_record_id`, NOT `data.record.{object, record_id}`.

**Why:** The old shape was the v1 API; v2 renamed the keys.

## List parent_object must match the list's configured object
The "H2 FY26 Growth" list (`7e460c9d-74b2-4316-8d48-7fcdd7d63070`) has `parent_object: ["people"]`. Adding a `gtm_signals` record to it returns 400. Add the Person record instead.

**Why:** Lists in this workspace are People-centric, not custom-object-centric.

## gtm_signals attribute slug corrections
| What we sent | What Attio expects |
|---|---|
| `research_notes` | `signal_summary` |
| `signal_date: ISO timestamp` | `signal_date: YYYY-MM-DD` (date field, not timestamp) |
| `auth_problem_angle: ""` | `auth_problem_angle: ["..."]` (required multiselect — must be non-empty array) |
| `behavior_flow: string[]` | `behavior_flow: string` (plain text — join array with `\n`) |

Also: `lifecycle_status` is required with predefined options. Only confirmed valid option: `"Prospect"`. Attio rejects unknown titles for this field (strict select).

`auth_problem_angle` by contrast is a dynamic multiselect — new option titles are created on write. Safe fallback: `"authentication"`.

## generative_ai_emails attribute slug corrections
| What we sent | What Attio expects |
|---|---|
| `gtm_signals: [id]` | `gtm_signal: id` (singular, not multiselect) |
| `email_version: number` | (field does not exist — omit) |
| `outreach_status: "not started"` | (omit — field is a Status type with predefined values and a default; "not started" is not a valid title) |

## select vs status field behavior
- `select` fields: Attio either allows dynamic option creation (no predefined options in config) or rejects unknown titles. Check by attempting a write.
- `status` fields (`type: "status"`): always have predefined statuses; sending a free-form string always fails. Omit if not required and a default is configured.

**How to apply:** Before syncing to any Attio object, verify attribute slugs and types via `GET /v2/objects/{slug}/attributes`. Pay special attention to `type`, `is_multiselect`, and `is_required`.
