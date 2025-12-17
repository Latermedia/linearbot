# Agentic 2025 Year in Review - Plan

> How we use LLM-driven exploration to craft meaningful narratives from data

## The Problem with Stats-Only Reports

Raw statistics tell you _what_ happened but not _why it matters_. A project with 301 story points could be mundane maintenance or a transformational product launch. This approach uses agentic exploration to uncover the real stories.

---

## Approach: Iterative Discovery

Rather than a script that dumps data, we:

1. **Query the database directly** via terminal SQLite commands
2. **Reason about results** - look at project names, descriptions, patterns
3. **Ask follow-up questions** - drill into interesting findings
4. **Synthesize narratives** - write insights as we discover them
5. **Build the report incrementally** - saving to markdown as themes emerge

```
┌─────────┐     ┌─────────────┐     ┌─────────────────┐
│ Query   │────▶│ Analyze     │────▶│ Reason About    │
│ DB      │     │ Results     │     │ Impact          │
└─────────┘     └─────────────┘     └────────┬────────┘
     ▲                                       │
     │          ┌─────────────┐              │
     └──────────│ Drill       │◀─────────────┤
                │ Deeper      │              │
                └─────────────┘              ▼
                                    ┌─────────────────┐
                                    │ Write to        │
                                    │ Markdown        │
                                    └─────────────────┘
```

---

## Exploration Phases

### Phase 1: Discover Major Themes

- What types of projects dominated? (migrations, new features, infrastructure, etc.)
- Which initiatives represented strategic bets?
- What patterns emerge in project naming/descriptions?

### Phase 2: Find Impact Stories

- Projects that unblocked other work
- Cross-team collaborations that shipped
- Technical debt paid down
- New capabilities launched
- Customer-facing improvements

### Phase 3: People and Growth

- Engineers who expanded their scope
- Teams that scaled up or pivoted
- Leadership emerging on projects

### Phase 4: Timeline Narrative

- What shipped each quarter and why it mattered
- Momentum and velocity changes
- Key milestones and turning points

### Phase 5: Synthesize the Narrative

- Craft a cohesive story of the year
- Highlight 3-5 biggest wins with context
- Call out unsung heroes and hidden gems

### Phase 6: Create the Wrapped

- Generate a Spotify Wrapped-style celebration
- Big, dramatic number reveals
- Fun superlatives (Most Issues, Fastest Growing, Hottest Month)
- Celebratory tone with emojis
- Shareable format for team-wide distribution

---

## Output Structure

```
year-in-review/
  insights/
    01-themes-discovered.md      # Major patterns found
    02-impact-stories.md         # Deep dives on high-impact work
    03-people-growth.md          # Team and individual highlights
    04-timeline-narrative.md     # Quarter-by-quarter story
  FINAL-2025-narrative.md        # Polished narrative report
  2025-WRAPPED.md                # Spotify Wrapped-style celebration
```

### Report Styles

**Narrative Report** (`FINAL-2025-narrative.md`)

- Long-form storytelling
- Deep context and analysis
- Strategic insights
- Suitable for leadership reviews

**Wrapped Report** (`2025-WRAPPED.md`)

- Spotify/Apple Music Wrapped aesthetic
- Celebratory, fun tone
- Big dramatic number reveals
- Superlatives and awards
- Shareable with the whole team

---

## Key Database Fields for Context

| Table         | Fields                                   | Why It Matters              |
| ------------- | ---------------------------------------- | --------------------------- |
| `projects`    | `project_description`, `project_content` | Understand what was built   |
| `projects`    | `project_updates`                        | Status narratives over time |
| `projects`    | `labels`                                 | Categorization and themes   |
| `projects`    | `teams`                                  | Cross-team collaboration    |
| `initiatives` | `name`, `description`, `content`         | Strategic context           |
| `initiatives` | `health_updates`                         | Progress narratives         |
| `issues`      | `title`, `labels`                        | Granular work patterns      |

---

## What Makes This Different

| Stats Report       | Agentic Narrative                                                        | Wrapped Style                            |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| "301 story points" | "Reports Section transformed how brands understand campaign performance" | "🚀 Your #1 project shipped 301 points!" |
| "10 engineers"     | "Cross-functional team bridged Campaigns and Analytics"                  | "👥 Biggest Team Effort: 10 engineers"   |
| "Q4 peak"          | "November push delivered 3 major features before holiday freeze"         | "🔥 November was UNHINGED: 50 projects"  |

The goal is reports people actually want to read - narrative for depth, wrapped for celebration.

---

## How to Re-run This Process

1. Open this repo in Cursor with Claude
2. Reference this plan file
3. Ask Claude to "run the agentic year in review exploration"
4. Claude will query the database, reason about findings, and build the narrative incrementally
5. Ask for a "Wrapped-style report" for the celebratory team-shareable version

The insights are generated through conversation, not automation - that's what makes them meaningful.

---

## Data Accuracy Notes

When counting projects, use **project completion dates** with at least one completed issue:

```sql
SELECT COUNT(*) FROM projects p
WHERE p.completed_at LIKE '2025%'
AND EXISTS (
  SELECT 1 FROM issues i
  WHERE i.project_id = p.project_id
  AND i.completed_at LIKE '2025%'
);
```

This avoids counting empty or placeholder projects in the totals.
