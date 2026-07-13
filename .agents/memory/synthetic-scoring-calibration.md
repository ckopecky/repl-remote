---
name: Calibrating synthetic scoring thresholds
description: How to avoid shipping composite-score/priority-bucket thresholds that never actually trigger the top bucket.
---

When a product spec gives only qualitative scoring rules ("prospects who activate fast
and show enterprise intent should be high priority") and you have to invent concrete
0–100 sub-scores plus a composite threshold, it's easy to pick round numbers (e.g.
"High ≥ 62") that look reasonable in isolation but are unreachable in practice.

The failure mode: if the composite is an average of N sub-scores and only 2-3 of them
are ever non-zero for any given archetype (because different archetypes trigger
different signals), the average dilutes even a "perfect" archetype's score well below a
threshold that was picked without checking real generated data.

**Why:** discovered when a full synthetic dataset (24 people, 6 archetypes) produced
zero "High" priority prospects — every archetype's best-case composite topped out
around 55-59 against a threshold of 62.

**How to apply:** after implementing a scoring/bucketing formula against synthetic or
sample data, actually run the generator and inspect the resulting bucket distribution
(e.g. `curl` the list endpoint and tally priorities) before considering the feature
done. Adjust thresholds empirically to produce a plausible spread (some High, most
Medium/Low, a few Suppress) rather than trusting round numbers chosen a priori.
