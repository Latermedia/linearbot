# World-Class Engineering Wrapped — Semantic Analysis Playbook

> This is the **semantic analysis layer** that turns your existing year-in-review outputs into a **credible hype reel**: _what mattered, why it mattered, who made it happen, and what it unlocked_.

This plan assumes you have **already run** the year-in-review script and generated files like `year-in-review/01-raw-stats.md`, `year-in-review/*.md`, and `year-in-review/insights/*`.

If `year-in-review/2025-WRAPPED.md` (or a final WRAPPED output) doesn’t exist yet, the workflow below **creates it** from the generated artifacts.

---

## What This Is (and What It’s Not)

- **This is**: a repeatable playbook for **inference + highlight selection + punchy storytelling** on top of your existing artifacts.
- **This is not**: a stats distillation workflow. Stats are **inputs**, not the output.
- **This is not**: a “top story points” list. Activity is not impact.

**Goal:** ship a Wrapped report that feels like a trailer for the year—**high signal, high taste, and defensible**.

---

## Inputs (You Already Have These)

- **Core inputs**:
  - `year-in-review/01-raw-stats.md`
  - `year-in-review/02-team-summaries.md`
  - `year-in-review/03-top-projects.md`
  - `year-in-review/04-engineer-highlights.md`
  - `year-in-review/05-initiatives.md`
  - `year-in-review/insights/01-themes-discovered.md`
  - `year-in-review/insights/02-impact-stories.md`
  - `year-in-review/insights/03-people-growth.md`
  - `year-in-review/insights/04-timeline-narrative.md`
  - `year-in-review/insights/05-claims-ledger.md`
  - `year-in-review/2025-WRAPPED.md` (draft or final; may not exist yet)
  - `year-in-review/FINAL-2025-narrative.md` (draft or final; optional companion)
- **Optional (for deeper proof / better quotes)**:
  - The SQLite DB (`linear-bot.db`) and project content/updates/issue titles
  - PRDs, launch posts, incident postmortems, stakeholder notes (if available)

---

## Outputs (What “World-Class” Looks Like)

- **Wrapped (final)** (`year-in-review/2025-WRAPPED.md`):
  - A **highlight reel**: dramatic reveals + crisp stories + awards + a thesis.
  - Built by **synthesizing all** `year-in-review/*.md` + `year-in-review/insights/*.md`.
- **Narrative (optional companion)** (`year-in-review/FINAL-2025-narrative.md`):
  - The “why it mattered” companion (leadership-ready).
- **Claims ledger (internal)** (`year-in-review/insights/05-claims-ledger.md`):
  - Mapping **claim → evidence → confidence**. This is what keeps hype honest.

---

## The Prime Directive: Credible Hype

Wrapped should feel bold, but it must remain **trustworthy**.

- **Every highlight needs a “because”**:
  - _“This mattered because it changed X for Y, evidenced by Z.”_
- **Separate facts from inference**:
  - Facts: counts, dates, names, titles, cycle times, team sizes.
  - Inference: “this repositioned us”, “this unlocked velocity”, “this reduced risk”.
- **Use confidence labels internally**:
  - **High**: directly supported by project descriptions/updates or known business context.
  - **Medium**: strongly implied by the work; some corroboration.
  - **Low**: plausible but not evidenced—either verify or soften language.

---

## The Semantic Analysis Framework

### 1) Convert Projects into “Impact Cards”

Start with your existing candidates (from `insights/02-impact-stories.md`, biggest builds, cross-team work, key milestones).
For each candidate, create an **Impact Card**:

- **Project**: name + ship date window
- **Surface area**: who used it (customers, CSMs, Finance, engineers, infra)
- **Before → After**: what changed in the workflow or capability
- **Impact archetype** (pick 1–2):
  - **Revenue enablement** (new monetization, conversion uplift, unlocks GTM)
  - **Retention/expansion** (stickiness, feature completeness, trust)
  - **Cost reduction** (manual hours removed, tooling consolidation)
  - **Risk reduction** (security, compliance, vendor/API volatility, data integrity)
  - **Velocity multiplier** (migration, platform work, standardization)
  - **Reliability/perf** (latency, uptime, incident reduction)
  - **Strategic focus** (sunsets, deprecations, simplification)
- **Evidence**:
  - Project description/content/updates, milestone notes, issue titles, known business constraints
- **What it unlocked**:
  - What became possible next that wasn’t possible before?
- **Soundbite** (one line):
  - “We turned ** from ** into \_\_.”
- **Confidence**: High / Medium / Low

**Prompt that produces great cards:**

> “What changed on Monday morning after this shipped—who noticed, what got easier, what became possible, and what stopped hurting?”

### 2) Group Cards into 3–6 “Pillars”

People remember **themes**, not lists.
Choose pillars like:

- Platform unification
- Reporting/analytics trust
- Modernization (migrations, foundations)
- Payments maturity
- AI to production
- Strategic sunsets

Each pillar must answer:

- **Why did we bet on this?**
- **What did we unlock?**
- **How does it compound into next year?**

### 3) Find the “Arc Moment”

Wrapped needs a turning point (a spike month, a pivotal launch, a forcing function).
Pick **one** “arc moment” and explain it like a trailer:

- “Everything we built earlier set up this moment.”
- “This was the month the platform clicked.”

---

## Highlight Selection: A Scoring Rubric (So It’s Not Vibes)

Score 0–3 for each category (quick and rough is fine):

- **Strategic significance**: did this move a company-level priority?
- **Customer impact**: did it change outcomes or trust, not just features?
- **Business leverage**: revenue/retention/cost/risk (any strong lever counts)
- **Compounding effect**: does this make future work faster/easier/better?
- **Cross-team complexity**: did we coordinate meaningfully across boundaries?
- **Story quality**: can we explain it in 2–3 sentences with a clear before/after?
- **Evidence strength**: do we have proof, not just intuition?

**Selection targets for Wrapped:**

- **1 flagship transformation** (the “cover” story)
- **3–5 marquee builds** (big swings)
- **5–10 fast-hit vignettes** (breadth + momentum)
- **3–6 awards** (people + teams + moments)
- **1 sunset** (taste + strategy + focus)
- **1 thesis** (the “what we actually built” close)

---

## Wrapped Writing Templates (Copy That Works)

### The “Marquee Project” Block

- **Name + dramatic number** (points/issues/teams/month—pick the best “stage prop”)
- **Before**: what was painful / slow / untrusted
- **After**: what became fast / trusted / self-serve
- **Impact line**: “This moved us from ** to **.”
- **Unlock**: “Now we can \_\_.”

### The “Infrastructure That Compounds” Block

- **One sentence**: “This wasn’t flashy. It was foundational.”
- **What it removed**: manual work, fragility, inconsistency
- **What it enabled**: faster shipping, fewer incidents, unified data, new capabilities
- **Proof**: cycle time improvement, shipped follow-ons, reduced toil

### The “Sunset” Block

- **The hard call**: what we chose to stop doing
- **The why**: cost/risk/usage/reliability
- **The execution**: coordinated, clean, respectful to customers
- **The payoff**: focus reclaimed; complexity reduced

### The “People” Block (Recognition with Substance)

Avoid generic praise. Tie recognition to **what they made possible**:

- “They bridged ** and **.”
- “They led \_\_.”
- “They carried context across \_\_.”
- “They made the platform simpler/faster/safer.”

---

## Style Guide (The Taste Layer)

- **Stats are seasoning**: one killer number per section is better than ten okay ones.
- **One idea per paragraph**: punchy lines, fast scroll velocity.
- **Translate jargon**: if an acronym isn’t obvious, explain it in 3–6 words.
- **Prefer before/after over adjectives**: show change, don’t claim greatness.
- **Celebrate foundations**: migrations, infra, debt paydown, and sunsets are the mark of maturity.
- **Be specific about the beneficiary**: “CSMs”, “Finance”, “brands”, “creators”, “on-call”, “new hires”.

---

## Quality Bar Checklist (Ship-Ready)

- **Each highlight has**: what + who + why + before/after + unlock + evidence.
- **No empty superlatives**: if it’s “biggest” or “fastest”, prove it or soften it.
- **No vanity metrics**: volume only matters when connected to outcomes.
- **Fairness**: recognition spans visible + invisible work (product + platform).
- **Consistency**: numbers match the `year-in-review/*` sources (or are clearly labeled approximate).

---

## Recommended Workflow (30–90 Minutes, Repeatable)

1. **Pick candidates** (10–25 projects) from `insights/02-impact-stories.md` + big builds list + timeline milestones.
2. **Write Impact Cards** (quick bullets) and assign confidence.
3. **Choose pillars + thesis** (3–6) and one arc moment.
4. **Draft Wrapped sections** using templates; keep a tight “trailer” pacing.
5. **Run a credibility pass**: verify “biggest/fastest/most” and soften anything not evidenced.
6. **Polish for taste**: fewer words, stronger verbs, cleaner reveals.

---

## Final WRAPPED Synthesis Prompt (Copy/Paste)

Use this when you’re ready to turn the artifacts into the **final** `year-in-review/2025-WRAPPED.md`.

> **Task**: Write the final WRAPPED report for 2025. You MUST read and synthesize ALL markdown files under `year-in-review/` and `year-in-review/insights/` as inputs. Your output MUST be a single file: `year-in-review/2025-WRAPPED.md`.
>
> **Inputs to consume (all of them):**
>
> - `year-in-review/01-raw-stats.md` (source of truth for totals + quarterly/monthly issue trends)
> - `year-in-review/02-team-summaries.md` (team leaderboard + counts)
> - `year-in-review/03-top-projects.md` (top projects + metrics)
> - `year-in-review/04-engineer-highlights.md` (people stats + cross-team)
> - `year-in-review/05-initiatives.md` (initiative-level narrative)
> - `year-in-review/insights/01-themes-discovered.md` (pillars)
> - `year-in-review/insights/02-impact-stories.md` (Impact Cards)
> - `year-in-review/insights/03-people-growth.md` (growth + recognition cues)
> - `year-in-review/insights/04-timeline-narrative.md` (arc moment + metric definitions)
> - `year-in-review/insights/05-claims-ledger.md` (claim → evidence guardrails)
>
> **Non-negotiables: credible hype**
>
> - Do **not** introduce any new metric, date, or “before/after” claim unless it is backed by the inputs. If not backed, either omit it or soften language (“suggests”, “appears”, “likely”).
> - Keep “projects closed” vs “issues shipped” distinct. If you mention November, state which metric you mean.
> - If a number appears in multiple sources, treat `01-raw-stats.md` as the tie-breaker for totals and the relevant table source (`02-04` files) as the tie-breaker for leaderboards.
>
> **Structure targets**
>
> - 1 flagship transformation (cover story)
> - 3–5 marquee builds (big swings)
> - 5–10 fast-hit vignettes (momentum + breadth)
> - 3–6 awards (people + teams + moments, tied to substance)
> - 1 sunset (taste + strategy + focus)
> - 1 final thesis (what we actually built; why it compounds into next year)
>
> **Style**
>
> - Fast scroll velocity. One idea per paragraph.
> - One killer stat per section (seasoning, not soup).
> - Prefer before/after and beneficiary specificity (CSMs, Finance, on-call, creators, brands).
>
> **Output requirement**
>
> - Write only the final markdown content for `year-in-review/2025-WRAPPED.md`.
> - No extra commentary, no intermediate notes, no TODOs in the output.

---

## Optional: Deeper Proof via SQLite (When You Need Better Receipts)

Use DB queries to turn “this seems impactful” into “we can say this with confidence”.

### Project count accuracy (avoid empty projects)

```sql
SELECT COUNT(*) FROM projects p
WHERE p.completed_at LIKE '2025%'
AND EXISTS (
  SELECT 1 FROM issues i
  WHERE i.project_id = p.project_id
  AND i.completed_at LIKE '2025%'
);
```

### Pull project descriptions/updates for better “before/after” language

```sql
SELECT
  p.project_name,
  p.project_description,
  p.project_content,
  p.project_updates
FROM projects p
WHERE p.completed_at LIKE '2025%'
AND p.project_name LIKE '%Reports%';
```

### Find cross-team, high-coordination projects (story gold)

```sql
SELECT
  p.project_name,
  p.teams,
  p.story_points,
  p.completed_at
FROM projects p
WHERE p.completed_at LIKE '2025%'
AND p.teams IS NOT NULL
ORDER BY p.story_points DESC;
```

---

## The North Star (The Final Slide)

End with a thesis that’s bigger than any single project:

> “You didn’t just ship features. You built a platform.”

If every section ladders up to that kind of line—**you’ve got a world-class Wrapped.**
