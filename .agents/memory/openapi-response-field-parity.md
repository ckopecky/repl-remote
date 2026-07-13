---
name: OpenAPI response schema field parity with hand-built queries
description: >-
  Adding a required field to an OpenAPI response schema (e.g. a list-item schema) breaks
  every route that builds that response from a manually `.select()`ed/mapped object, not
  just the ones you meant to touch.
---

When a schema (e.g. `OutreachPackageListItem`) gains new required fields, every route
handler that constructs a matching object by hand — a Drizzle `.select({...})` projection
mapped into a plain object, not a full table row — needs the same fields added to both the
query projection and the mapped response object, or `Schema.parse(data)` throws at request
time.

**Why:** TypeScript won't catch this. The handler's local object type is whatever the
`.select()` projection produces, and `zodSchema.parse(...)` only fails when the route
actually runs — so `tsc --noEmit` passes cleanly while the endpoint 500s. This is easy to
miss because full-row schemas (e.g. the singular `OutreachPackage`, built from a full table
row via `db.update(...).returning()`) pick up new columns automatically and typecheck fine,
while list/summary schemas built from a hand-picked projection do not.

**How to apply:** After adding a field to any OpenAPI response schema, grep the codebase for
every route that returns that schema and check whether it does a full-row return (safe) or
a manual `.select({...})`/object-literal mapping (needs the new field added in two places:
the select projection and the returned object). Then actually hit the endpoint (curl or a
screenshot of the page that calls it) rather than trusting typecheck alone.
