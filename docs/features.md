# Features

## Views

### Projects

Stats cards showing:

- Total teams and projects
- Missing updates count
- Status mismatches
- Missing leads

### Table View

Sortable project table grouped by team or domain. Click rows for detail modal.

### Gantt View

90-day quarter timeline with:

- Project bars with progress fill
- Month markers
- Today indicator line
- Fade effects for projects extending beyond visible range

### Executive View

Projects filtered by `Executive Visibility` label. Card, table, and Gantt options.

## Project Detail Modal

- Progress bar (completed/in-progress/remaining)
- Velocity, cycle time, lead time, estimate accuracy
- Velocity breakdown by team
- Project health updates with history toggle
- Issues table with links to Linear

## Violation Tracking

| Violation            | Description                    |
| -------------------- | ------------------------------ |
| Missing estimates    | Issues without story points    |
| Missing priorities   | Priority = 0                   |
| Missing descriptions | Empty description field        |
| Stale updates        | Project not updated in 7+ days |
| Status mismatches    | Project state vs active work   |
| WIP age              | Started >14 days ago           |
| Missing lead         | No project lead assigned       |
| Missing health       | No health status set           |
| No recent comment    | Business-day aware check       |

## Grouping

- **Team-based** — by Linear teams
- **Domain-based** — custom team→domain mappings via env
- **Multi-team** — projects spanning multiple teams

## Export

Gantt PNG export to clipboard with configurable overlays (today indicator, warnings).

## UI

- Theme toggle (dark/light)
- Sync indicator with progress
- Dev menu (`Cmd/Ctrl+Shift+D`)
- Presentation mode (`Cmd/Ctrl+Shift+E`)
- Hover tooltips
