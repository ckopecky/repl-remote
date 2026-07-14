# Email Voice Reference

The reader has been a software engineer for years and deletes SDR email on pattern recognition
alone. Patterns that trigger instant deletion:

- News openers as fake personalization ("Saw your funding round — congrats!")
- Discovery questions dressed as curiosity ("Curious what your current setup looks like")
- Pitch disclaimers ("No pitch, just trying to be useful")
- "Happy to share what we've seen"

The antidote is honesty and specificity, not cleverer camouflage.

## The three modes

### Mode 1 — No Clerk account (cold, dev-to-dev)

Lead with the specific auth problem their stage and product imply. Clerk appears in the first
sentence in the context of *their* problem, never as a feature list.

- **Subject:** problem-specific, sentence case. Good: `org hierarchy for Frontier`,
  `auth for agents + humans in the same system`. Bad: `Quick thought about [Company]`.
- **Opening:** first 10 words are the inbox preview. Clerk + their problem. Never open with who
  the sender is — the signature handles that.
- **Body:** hard limit 2–3 sentences. One problem, one line on why it compounds in their setup.
- **Closing:** one genuine question. "Not a problem for us right now" must be a welcome answer.
- **Total:** 5–6 lines including signature. Fails a 5-second skim → cut.

### Mode 2 — Account, no app (signed up, didn't build)

They signed up and stopped. The honest move is to say so and ask why. This is a research
question, and every answer is valuable — "we picked Supabase" tells the product team something.

Frame: "Noticed [Company] signed up for Clerk a while back but didn't get an app going — I'm
trying to understand where people get stuck. What got in the way?" Then one specific guess based
on their stack if you have one ("if it was the Remix integration, that's improved since").

Do not pitch. Do not offer a call. Ask the question and stop.

### Mode 3 — Account + app (builder feedback)

They're building. The note is genuine product curiosity: what are they building, how far along,
where's the friction. Reference what their PostHog activity actually shows — specifically enough to
prove attention, not so granularly it feels like surveillance. "Saw [Company] has an app going
on Clerk" is right. "Saw you clicked the new application card at 2:14pm Tuesday" is not.

If the trail shows a paywall hit or pricing calculator run, address it directly and helpfully:
"Looks like you ran into the [X] limit — wanted to make sure you knew what's on the next tier
before it blocks you mid-build."

For fast-scaling signups (interesting-signups cohort), the energy is genuine enthusiasm without
flattery: name what the trail shows at the surface level ("team's grown, usage is climbing"),
ask what they're building and what made Clerk click at project start. No upsell, no tier talk —
they're already moving; the only goal is the story. Their answer about why it clicked is the
growth-intent trigger data the team has been hunting.

## Warm-signal handling

- Existing account: always acknowledge it. Never pretend a warm email is cold.
- Prior inbound from a colleague: reference it. "Someone from [Company] reached out a while
  back — making sure it didn't fall through the cracks."
- Personal Gmail: individual evaluator — warmer, less formal.
- Paying customer or sales form submitted: **no email from this pipeline.** Flag for human.

## Writing mechanics (every email)

- Sentence case subjects and CTAs · Oxford comma · US English · contractions fine
- Active voice · no exclamation points · em-dashes only for real parentheticals
- Numbers: spell out one–nine, digits 10+, always digits with units ("5 minutes")
- Clerk features capitalized when named (Organizations, Sessions); code in monospace: `<SignIn />`
- Plain text body — no markdown, no HTML

**Always cut:** seamless, effortless, magical, powerful, robust, world-class, best-in-class,
industry-leading, next-gen, solution, simply, just
**Earn or cut** (proof in the same sentence or delete): fast, secure, reliable, scalable, flexible
**Replace:** leverage/utilize → use · facilitate → help or let · unlock/supercharge/elevate/
transform → the actual change · "we're excited to announce" → open with the thing

**Constructions to avoid:** "It's not X, it's Y" · staccato fragments ("Fast. Secure. Scalable.")
· summarizing their company back to them · quoting their news back to them · feature lists ·
more than one "happy to" (ideally zero) · "Worth a 15-min call?" closers

## agent_confidence rubric

- `high` — PostHog signal + verified recent moment + clear auth angle all align
- `medium` — solid fit and angle, but the moment is inferred rather than confirmed, or data
  needed correction
- `low` — worth sending but built mostly on stage/stack inference; flag what would raise it
