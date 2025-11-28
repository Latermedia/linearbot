# Roadmap

Planned features and known issues for LinearBot.

## Planned

### Views & Organization

- **Rename Dashboard to Projects** — the main route is a projects view, rename accordingly
- **Initiative view (`/initiatives`)** — dedicated route for initiative-level grouping; view projects grouped by strategic initiative with rollup metrics
- **Planning view** — surface projects in planning states (`shaping`, `ready`) from Linear; separate view or filter for upcoming work not yet started
- **Full year timeline** — extend Gantt chart to show entire year with previously completed projects; enable historical context alongside active work
- **WIP/Now/Next** — categorize work by current state
- **Prioritization view** — impact/effort matrix with backlog organization
- **Metrics dashboard** — tie project metrics to primary initiatives

### Highlighting & Queue

- Surface what's pulled out vs. in (with reasoning)
- Request queue visibility ("asks" in Linear)

### Issue Management

- **Subissue handling** — exclude from points/priority; show visual indicator
- **Comment count** — show total comments per issue (currently only tracking last comment time)
- **Comment threshold** — configurable "no recent comment" threshold (currently hardcoded to business day logic)

### Project Tracking

- **Start date fix** — use WIP start (first issue `started_at`), not `created_at` for project start date
- **Linear target date** — sync project's target end date from Linear (due date field)
- **Completion date comparison** — compare Linear's explicit target/due date vs velocity-predicted completion; display warning in UI if they differ by more than 1 month (our "month-ish" accuracy threshold)
- **Status labels** — consolidate Linear status label usage

### Filtering & Configuration

- **Configurable customer labels** — define a list of high-profile customer labels (e.g., AcmeCorp) that can be used to filter projects in Projects and Executive views; stored as app configuration

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
| No subissue detection             | Can't exclude from calculations     |
| Linear target date not synced     | Only velocity prediction shown      |
