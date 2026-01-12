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

### Pillar 3: Team Productivity

**Core Metric**: TrueThroughput from GetDX (weighted PR velocity)

**Data Source**: GetDX Data Cloud API via `queries.datafeed` endpoint

**Availability**:

- **Org level**: Aggregates all GetDX teams
- **Domain level**: Uses GetDX team names which map directly to domains

**Status Thresholds**:

Thresholds are configurable via environment variables. If not configured, status shows as "unknown" to allow baseline data collection.

- `GETDX_THROUGHPUT_HEALTHY`: TrueThroughput value for healthy status
- `GETDX_THROUGHPUT_WARNING`: TrueThroughput value for warning status (below this = critical)

### Pillar 4: Quality

**Core Metric**: Composite score (0-100) based on bug metrics

**Components**:

- Open bug count (30% weight)
- Net bug change over 14 days (40% weight)
- Average age of open bugs (30% weight)

**Status Thresholds**:

- Healthy: Score >= 70
- Warning: Score 40-69
- Critical: Score < 40

**Bug Detection**: Issues with "type: bug" label (case-insensitive)

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

- `GETDX_THROUGHPUT_PER_IC_HEALTHY`: Per-IC weekly throughput for healthy status (default: 6 = 3/week over 2 weeks)

- `GETDX_THROUGHPUT_PER_IC_WARNING`: Per-IC weekly throughput for warning status (default: 3 = 1.5/week over 2 weeks)

### Thresholds

Thresholds are defined in `src/constants/thresholds.ts`:

- `WIP_THRESHOLDS.WARNING`: 6 (issues per IC to trigger violation)

Velocity thresholds in `src/services/metrics/velocity-health.ts`:

- `AT_RISK_DAYS_THRESHOLD`: 14 days
- `OFF_TRACK_DAYS_THRESHOLD`: 28 days

Quality thresholds in `src/services/metrics/quality-health.ts`:

- `HEALTHY_SCORE_THRESHOLD`: 70
- `WARNING_SCORE_THRESHOLD`: 40

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

### Phase 4: Set Per-IC Throughput Targets

1. Determine your target TrueThroughput per IC per week (e.g., 3 PRs/week)
2. Set `GETDX_THROUGHPUT_PER_IC_HEALTHY` to 2x your target (for 2-week window)
3. Set `GETDX_THROUGHPUT_PER_IC_WARNING` to 1x your target

**Example:** For a target of 3 PRs/week per IC:

- `GETDX_THROUGHPUT_PER_IC_HEALTHY=6` (3/week × 2 weeks)
- `GETDX_THROUGHPUT_PER_IC_WARNING=3` (1.5/week × 2 weeks)

### Discovering GetDX Teams

To find available teams in your GetDX instance:

1. Query the GetDX Data Cloud for distinct team names
2. Or use the GetDX API `/teams.list` endpoint
3. Map each team to your corresponding domain name
