---
name: Orval nullable date-time fields must avoid oneOf
description: How to declare a nullable date-time property in openapi.yaml so generated Zod validation doesn't silently corrupt null values.
---

When an OpenAPI schema declares a nullable date-time as `oneOf: [{type: string, format: date-time}, {type: "null"}]`,
Orval generates `zod.union([zod.coerce.date(), zod.null()])`. Zod tries the first union branch first, and
`new Date(null)` succeeds (epoch `1970-01-01T00:00:00.000Z`) instead of throwing, so real `null` values are
silently coerced into a fake timestamp and never reach the `zod.null()` branch.

**Why:** discovered when a "not yet synced" nullable timestamp field rendered as `1970-01-01` instead of `null`
in an API response, because the response was validated with the generated union schema.

**How to apply:** for nullable date-time properties, use `{ type: ["string", "null"], format: date-time }` instead
of `oneOf`. This generates `zod.coerce.date().nullable()`, which checks for `null` before attempting coercion and
behaves correctly. This pattern already works correctly for nullable plain-string fields (oneOf is fine there,
since `z.string()` correctly rejects `null` and falls through) — the bug is specific to `z.coerce.date()` combined
with `z.union`.
