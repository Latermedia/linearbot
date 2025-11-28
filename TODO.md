# Roadmap

Planned features and known issues for LinearBot.

## Planned

### Views & Organization

- **WIP/Now/Next** — categorize work by current state
- **Prioritization view** — impact/effort matrix with backlog organization
- **Initiative grouping** — group projects by strategic initiative
- **Metrics dashboard** — tie project metrics to primary initiatives

### Highlighting & Queue

- Surface what's pulled out vs. in (with reasoning)
- Request queue visibility ("asks" in Linear)

### Issue Management

- **Subissue handling** — exclude from points/priority; show visual indicator
- **Issue identifier** — display ID (e.g., `ENG-123`) in all views
- **Comment count** — show total comments per issue
- **Comment threshold** — configurable "no recent comment" threshold

### Project Tracking

- **Author on updates** — show author name for project updates
- **Start date fix** — use WIP start (first issue in-progress), not created date
- **Linear target date** — sync and show project's target end date from Linear
- **Status labels** — consolidate Linear status label usage

### Violation Alerts

- **0 points is valid** — don't warn on `estimate: 0`
- **Suppress cancelled/duplicate** — no alerts for these states
- **Missing points label** — clearer messaging, exclude cancelled

---

## Known Issues

Current bugs and gaps to fix:

| Issue                             | Impact                              |
| --------------------------------- | ----------------------------------- |
| 0-point estimates trigger warning | `!issue.estimate` is falsy for 0    |
| Alerts on cancelled/duplicate     | Should be suppressed                |
| Start date uses `created_at`      | Should use `started_at` (WIP start) |
| Issue identifier not in UI        | Synced but not displayed            |
| No subissue detection             | Can't exclude from calculations     |
| Author missing on updates         | Updates shown, author not           |
| Linear target date not synced     | Only velocity prediction shown      |
