# Roadmap

Planned features and known issues for LinearBot.

## Planned

### Views & Organization

- **Initiative view (`/initiatives`)** — dedicated route for initiative-level grouping; view projects grouped by strategic initiative with rollup metrics
- **Planning view** — surface projects in planning states (`shaping`, `ready`) from Linear; separate view or filter for upcoming work not yet started
- **Full year timeline** — extend Gantt chart to show entire year with previously completed projects; enable historical context alongside active work
- **Prioritization view** — impact/effort matrix with backlog organization
- **Metrics dashboard** — tie project metrics to primary initiatives

### Highlighting & Queue

- Surface what's pulled out vs. in (with reasoning)
- Request queue visibility ("asks" in Linear)

### Issue Management

- **Comment threshold** — configurable "no recent comment" threshold (currently hardcoded to business day logic)

### Project Tracking

- **Status labels** — consolidate Linear status label usage

### Filtering & Configuration

- **Configurable customer labels** — define a list of high-profile customer labels (e.g., AcmeCorp) that can be used to filter projects in Projects and Executive views; stored as app configuration

### Violation Alerts

- **Missing points label** — clearer messaging, exclude cancelled

### Real-time Updates

- **Linear webhooks** — implement webhook listeners for real-time sync, replacing periodic polling

  **Endpoint & Security**
  - [ ] Create `/api/webhooks/linear` endpoint to receive POST requests
  - [ ] Implement HMAC-SHA256 signature verification using webhook secret
  - [ ] Add idempotency handling to prevent duplicate event processing
  - [ ] Return 200 quickly, process events asynchronously

  **Event Handlers**
  - [ ] `Issue` events — handle create/update/remove for issue sync
  - [ ] `Project` events — handle project state changes, progress updates
  - [ ] `ProjectUpdate` events — capture status updates and health changes
  - [ ] `Comment` events — update "last commented" timestamps
  - [ ] `Label` events — sync label changes for filtering

  **Database Updates**
  - [ ] Upsert individual records on webhook events (vs. full table sync)
  - [ ] Track webhook processing timestamps for debugging
  - [ ] Handle cascading updates (e.g., project progress on issue completion)

  **Configuration**
  - [ ] Add `LINEAR_WEBHOOK_SECRET` env variable
  - [ ] Document webhook setup in Linear admin (URL, events to subscribe)
  - [ ] Add health check endpoint for webhook status

  **Hybrid Sync Strategy**
  - [ ] Keep periodic sync as fallback for missed webhooks
  - [ ] Reduce sync frequency once webhooks are reliable (e.g., hourly → daily)
  - [ ] Add manual "force sync" option in UI for immediate full refresh

### filter engineers by manager

---

## Known Issues

Current bugs and gaps to fix:

| Issue | Impact |
| ----- | ------ |
| None  | 🎉     |
