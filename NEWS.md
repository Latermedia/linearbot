# Release Notes

## v0.1.0

_Initial release_

### Added

- **Dashboard** — stats cards for teams, projects, violations, health metrics
- **Table view** — sortable project table grouped by team or domain
- **Gantt view** — 90-day quarter timeline with progress, month markers, today indicator
- **Executive view** — filtered by "Executive Visibility" label
- **Project detail modal** — metrics, health updates, issues table
- **Terminal app** — Ink-based TUI for CLI access

### Violation Tracking

- Missing estimates, priorities, descriptions
- Stale updates (7+ days)
- Status mismatches
- WIP age violations (>14 days)
- Missing project leads and health status
- No recent comment (business-day aware)

### Infrastructure

- SQLite database with computed metrics
- Linear API sync with progress indicator
- Password authentication (24h sessions)
- Fly.io deployment configuration
- Theme toggle (dark/light)
