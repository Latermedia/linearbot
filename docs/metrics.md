# Four Pillars Metrics System

Engineering health metrics dashboard.

## Overview

The Four Pillars framework provides a structured way to assess engineering organization health:

1. **Team Health** - Is work flowing or stuck?
2. **Velocity Health** - Are projects tracking to goal?
3. **Team Productivity** - Is output healthy and consistent?
4. **Quality** - Are we building stable or creating debt?

## Access

Navigate to `/metrics` to view the dashboard.

## How It Works

### Data Capture

Metrics snapshots are captured automatically after each successful sync (hourly in production). Snapshots are stored at three levels:

- **Org level** - Overall organization health
- **Domain level** - Health by domain (requires `TEAM_DOMAIN_MAPPINGS` env var)
- **Team level** - Health by individual team

### Pillar 1: Team Health

**Core Metric**: % of ICs and % of Projects in/out of WIP constraints

**Calculation**:

- IC WIP Violation: Engineer has 6+ issues in "started" state
- Project WIP Violation: Any engineer on the project is in WIP violation

**Status Thresholds**:

- Healthy: < 10% violations
- Warning: 10-25% violations
- Critical: > 25% violations

### Pillar 2: Velocity Health

**Core Metric**: % of Projects On Track (hybrid of human judgment + velocity)

**Calculation**:

1. If Linear shows project as "At Risk" or "Off Track" → trust human judgment
2. If Linear shows "On Track" but velocity predicts late → override with velocity
3. Velocity thresholds: 2-4 weeks off = At Risk, 4+ weeks off = Off Track

**Status Thresholds**:

- Healthy: > 90% projects on track
- Warning: 75-90% on track
- Critical: < 75% on track

**Dashboard Display**:

The velocity card shows absolute counts split by source for transparency:

- Projects flagged "at risk" or "off track" by human judgment (Linear health status)
- Projects flagged by velocity prediction (when human status is optimistic but math says otherwise)

This split helps identify whether issues are being surfaced proactively by teams or detected automatically.

### Pillar 3: Team Productivity

**Core Metric**: TrueThroughput from GetDX (weighted PR velocity)

**Data Source**: GetDX Data Cloud API via `queries.datafeed` endpoint

**Availability**:

- **Org level**: Aggregates all GetDX teams
- **Domain level**: Uses GetDX team names which map directly to domains

**Status Thresholds** (unified with all pillars):

Per-IC throughput is normalized to a percentage of the target (default: 6 per 2-week period = 3/week):

- Healthy: >= 90% of target
- Warning: 75-90% of target
- Critical: < 75% of target

The target is configurable via `GETDX_THROUGHPUT_PER_IC_TARGET` (default: 6).

**Dashboard Display**:

The productivity card shows per-IC throughput as the headline metric (target: 3/wk per IC), with total throughput and IC count as supporting details. This makes it immediately clear whether the team is hitting velocity targets.

**Engineer Count**:

The per-IC calculation uses engineer count from one of two sources:

1. **ENGINEER_TEAM_MAPPING** (preferred): If configured, only engineers explicitly listed in the mapping are counted. This excludes non-engineering roles (designers, PMs, etc.) from the productivity calculation.
2. **All ICs**: If ENGINEER_TEAM_MAPPING is not set, falls back to counting all ICs with active work.

### Pillar 4: Quality

**Core Metric**: Composite score (0-100) based on bug metrics (per-engineer scaling)

**Components** (all scaled by engineer count):

- Bugs per engineer (30% weight) - Penalty: 12 points per bug/engineer
- Net bug change per engineer over 14 days (40% weight) - Penalty: 200 points per net bug/engineer
- Average age of open bugs (30% weight) - Penalty: 0.5 points per day

**Thresholds** (score hits 0 at):

- Bugs: ~8.3 bugs per engineer
- Net change: 0.5 net new bugs per engineer per 14 days
- Average age: 200 days

**Status Thresholds** (unified with all pillars):

- Healthy: Score >= 90
- Warning: Score 75-90
- Critical: Score < 75

**Bug Detection**: Issues with "type: bug" label (case-insensitive)

**Engineer Count**: Uses `ENGINEER_TEAM_MAPPING` if configured, otherwise falls back to total IC count.

**Dashboard Display**:

The quality card uses natural language to illuminate the drivers:

- Open bug count (absolute number)
- Backlog trend: "Backlog growing (+5 in 14d)" or "Backlog shrinking (-3 in 14d)"
- Average bug age in days

This makes it immediately clear whether bugs are accumulating or being resolved, and whether old bugs are piling up.

## API Endpoints

### GET /api/metrics/latest

Get the latest metrics snapshot.

Query params:

- `level`: 'org' | 'domain' | 'team' (default: 'org')
- `levelId`: domain name or team key (required for domain/team)
- `all`: 'true' to get all latest snapshots

### GET /api/metrics/trends

Get metrics trend data for charting.

Query params:

- `level`: 'org' | 'domain' | 'team' (default: 'org')
- `levelId`: domain name or team key
- `limit`: number of snapshots (default: 168 = 7 days hourly)
- `startDate`/`endDate`: ISO date range query

### POST /api/metrics/capture

Manually trigger a metrics snapshot capture. Requires CSRF token.

## Database Schema

```sql
CREATE TABLE metrics_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  level TEXT NOT NULL,        -- 'org' | 'domain' | 'team'
  level_id TEXT,              -- null for org
  metrics_json TEXT NOT NULL, -- JSON blob
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## Future Work

### 1. Team-Level GetDX Mapping

**Priority**: High

Extend GetDX integration to support team-level productivity:

- Map GetDX teams to Linear teams (not just domains)
- Display TrueThroughput in the team breakdown table
- Currently teams show "pending" for productivity

### 2. Write Custom Metrics to GetDX

**Priority**: Medium

Use GetDX as single source of truth by pushing our calculated metrics:

- Team Health scores
- Velocity Health scores
- Quality scores

This enables unified dashboards and alerting through GetDX.

### 3. Schema Migration Utilities

**Priority**: Medium

Build tooling to:

- Query historical data across schema versions
- Migrate old snapshots when schema changes
- Validate schema version compatibility

### 4. Alerting

**Priority**: Low (after metrics are proven useful)

Notify leadership when pillars go critical:

- Slack integration for critical alerts
- Weekly summary email
- Configurable thresholds per team/domain

### 5. Quality Enhancements

**Priority**: Low (after GetDX integration)

Add PR-based quality metrics:

- Time spent on bug fixes vs features
- Fix PR ratio
- Regression rate

## Configuration

### Environment Variables

#### Domain Mappings

- `TEAM_DOMAIN_MAPPINGS`: JSON mapping Linear team keys to domains

  ```json
  { "TEAM1": "Platform", "TEAM2": "Platform", "TEAM3": "Product" }
  ```

#### GetDX Integration

- `GETDX_API_KEY`: API token with `snapshots:read` scope (required for productivity pillar)

- `GETDX_PR_THROUGHPUT_FEED_TOKEN`: Datafeed token for PR Throughput query from GetDX Data Cloud

  To get this token:
  1. Go to GetDX Data Cloud
  2. Create a saved query for PR Throughput metrics by team and day:
     ```sql
     SELECT
       DATE_TRUNC('day', pr.merged) AS day,
       dt.name AS team_name,
       COALESCE(SUM(pr.weight), 0) AS throughput,
       COUNT(*) AS pr_count
     FROM pull_requests pr
     JOIN dx_users du ON pr.dx_user_id = du.id
     JOIN dx_teams dt ON du.team_id = dt.id
     WHERE pr.merged IS NOT NULL
       AND pr.merged >= CURRENT_DATE - INTERVAL '1 month'
       AND dt.name IS NOT NULL
     GROUP BY DATE_TRUNC('day', pr.merged), dt.name
     ORDER BY day, team_name;
     ```
  3. Save the query and copy the feed token

- `GETDX_DOMAIN_MAPPINGS`: JSON mapping GetDX team names to your domain names

  GetDX team names often differ from your domain names. This mapping connects them:

  ```json
  {
    "GetDX Team Alpha": "Product",
    "GetDX Team Beta": "Product",
    "Platform Team": "Platform",
    "Infrastructure": "Platform",
    "Data Science": "Data"
  }
  ```

  **Note:** Multiple GetDX teams can map to the same domain (e.g., "GetDX Team Alpha" and "GetDX Team Beta" both map to "Product").

- `GETDX_THROUGHPUT_PER_IC_TARGET`: Target per-IC throughput over 2-week period (default: 6 = 3/week)

  Status uses unified percentage-based thresholds (>= 90% healthy, 75-90% warning, < 75% critical).

### Thresholds

Thresholds are defined in `src/constants/thresholds.ts`:

- `WIP_THRESHOLDS.WARNING`: 6 (issues per IC to trigger violation)

Velocity thresholds in `src/services/metrics/velocity-health.ts`:

- `AT_RISK_DAYS_THRESHOLD`: 14 days
- `OFF_TRACK_DAYS_THRESHOLD`: 28 days

Quality thresholds in `src/services/metrics/quality-health.ts`:

- `BUG_PENALTY_PER_ENG`: 12 (score = 0 at ~8.3 bugs/engineer)
- `NET_PENALTY_PER_ENG`: 200 (score = 0 at 0.5 net bugs/engineer)
- `AGE_PENALTY_PER_DAY`: 0.5 (score = 0 at 200 days avg age)

### Unified Status Thresholds

All four pillars use the same status thresholds (defined in `src/types/metrics-snapshot.ts`):

- **Healthy**: >= 90% (< 10% violation/deficit)
- **Warning**: 75-90% (10-25% violation/deficit)
- **Critical**: < 75% (> 25% violation/deficit)

This provides a consistent UX where users know any metric below 75% is critical without needing to remember pillar-specific thresholds.

## GetDX Setup Guide

### Phase 1: Initial Setup

1. Create a GetDX API key with `snapshots:read` scope
2. Set `GETDX_API_KEY` environment variable

### Phase 2: Configure PR Throughput Datafeed

1. Go to GetDX Data Cloud query builder
2. Create a query for PR Throughput grouped by team and day (see SQL example above)
3. Save the query to generate a feed token
4. Set `GETDX_PR_THROUGHPUT_FEED_TOKEN` environment variable

The datafeed returns data with columns: `day`, `team_name`, `throughput`, `pr_count`

### Phase 3: Configure Domain Mappings

GetDX team names typically differ from your domain names. Map them:

1. Fetch available GetDX teams from the API or Data Cloud UI
2. Create a JSON mapping from GetDX team names to your domain names
3. Set `GETDX_DOMAIN_MAPPINGS` environment variable

**Example mapping:**

| GetDX Team       | Domain   |
| ---------------- | -------- |
| GetDX Team Alpha | Product  |
| GetDX Team Beta  | Product  |
| Platform Team    | Platform |
| Infrastructure   | Platform |
| Data Science     | Data     |

### Phase 4: Set Per-IC Throughput Target

1. Determine your target TrueThroughput per IC per week (e.g., 3 PRs/week)
2. Set `GETDX_THROUGHPUT_PER_IC_TARGET` to 2x your weekly target (for 2-week window)

**Example:** For a target of 3 PRs/week per IC:

- `GETDX_THROUGHPUT_PER_IC_TARGET=6` (3/week × 2 weeks)

Status is then determined using unified thresholds:

- Healthy: >= 5.4 per IC (90% of target)
- Warning: 4.5-5.4 per IC (75-90% of target)
- Critical: < 4.5 per IC (< 75% of target)

### Discovering GetDX Teams

To find available teams in your GetDX instance:

1. Query the GetDX Data Cloud for distinct team names
2. Or use the GetDX API `/teams.list` endpoint
3. Map each team to your corresponding domain name
