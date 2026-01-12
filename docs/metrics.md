# Four Pillars Metrics System

Engineering health metrics dashboard for bi-weekly leadership reviews.

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

**Status**: Pending (awaiting GetDX integration)

**Planned Metric**: PR True Throughput from GetDX

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

### 1. GetDX TrueThroughput Integration

**Priority**: High

Integrate with GetDX to pull PR velocity metrics for the Team Productivity pillar:

- True Throughput (merged PRs weighted by complexity)
- PR cycle time
- Review throughput

**Approach**:

1. Add GetDX API client
2. Fetch team-level productivity metrics
3. Map to our schema
4. Update `teamProductivity` from "pending" to active

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

- `TEAM_DOMAIN_MAPPINGS`: JSON mapping team keys to domains
  ```json
  { "TEAM1": "Platform", "TEAM2": "Platform", "TEAM3": "Product" }
  ```

### Thresholds

Thresholds are defined in `src/constants/thresholds.ts`:

- `WIP_THRESHOLDS.WARNING`: 6 (issues per IC to trigger violation)

Velocity thresholds in `src/services/metrics/velocity-health.ts`:

- `AT_RISK_DAYS_THRESHOLD`: 14 days
- `OFF_TRACK_DAYS_THRESHOLD`: 28 days

Quality thresholds in `src/services/metrics/quality-health.ts`:

- `HEALTHY_SCORE_THRESHOLD`: 70
- `WARNING_SCORE_THRESHOLD`: 40
