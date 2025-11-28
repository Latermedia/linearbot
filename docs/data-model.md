# Data Model

## Overview

LinearBot syncs a subset of Linear data focused on project health and WIP tracking.

## Tables

### issues

Primary issue data with denormalized team and project info.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Linear issue ID |
| identifier | TEXT | Human-readable ID (e.g., `ENG-123`) |
| title | TEXT | Issue title |
| description | TEXT | Issue description |
| team_id, team_name, team_key | TEXT | Team info |
| state_id, state_name, state_type | TEXT | Workflow state |
| assignee_id, assignee_name | TEXT | Assignee |
| priority | INTEGER | 0-4 (0 = no priority) |
| estimate | REAL | Story points |
| last_comment_at | TEXT | ISO timestamp |
| started_at | TEXT | When moved to in-progress |
| completed_at | TEXT | When marked done |
| canceled_at | TEXT | When cancelled |
| project_id, project_name | TEXT | Parent project |
| project_health | TEXT | at risk, off track, on track |

### projects

Aggregated project metrics computed during sync.

| Column | Type | Description |
|--------|------|-------------|
| project_id | TEXT | Linear project ID |
| total_issues | INTEGER | Issue count |
| completed_issues | INTEGER | Done count |
| velocity | REAL | Issues/week |
| average_cycle_time | REAL | Days from start to done |
| has_status_mismatch | INTEGER | Boolean flag |
| is_stale_update | INTEGER | No update in 7+ days |
| missing_lead | INTEGER | No lead assigned |
| start_date | TEXT | Earliest issue created_at |
| estimated_end_date | TEXT | Velocity-based prediction |

## Sync Behavior

### What Gets Synced

- All issues in "started" states (in progress, review, etc.)
- Issues in projects with any started issues
- Project metadata and health updates

### Computed Fields

During sync, these are calculated:
- Velocity (issues completed / weeks since start)
- Cycle time (started_at → completed_at average)
- Lead time (created_at → completed_at average)
- Violation counts (missing estimates, priorities, etc.)

### Limitations

- Read-only — no writes to Linear (except optional comment warnings)
- Point-in-time snapshot — no historical tracking
- Started issues only — backlog not synced

