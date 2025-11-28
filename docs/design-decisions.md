# Design Decisions

Architectural tradeoffs and rationale.

---

## SQLite over Postgres/Turso

**Decision**: Use bun:sqlite with in-memory or file-based storage.

**Rationale**:

- Zero infrastructure for local dev
- Fast sync (no network latency to DB)
- Simple deployment (single binary)
- Good enough for single-user/small-team use case

**Tradeoff**: Data lost on restart in production (in-memory mode). Acceptable because Linear is source of truth.

---

## Denormalized Issues Table

**Decision**: Store team_name, project_name, etc. directly on issues instead of normalizing.

**Rationale**:

- Simpler queries (no joins)
- Faster reads
- Sync is infrequent, so storage overhead is minimal

**Tradeoff**: Data duplication, potential inconsistency. Mitigated by full re-sync on each run.

---

## Computed Metrics at Sync Time

**Decision**: Calculate velocity, cycle time, etc. during sync and store in projects table.

**Rationale**:

- Fast page loads (no aggregation at request time)
- Consistent values across views
- Sync is the expensive operation anyway

**Tradeoff**: Metrics can be stale between syncs.

---

## Business-Day Comment Check

**Decision**: "No recent comment" uses business-day logic, not 24-hour threshold.

**Rationale**:

- Monday shouldn't flag issues that had Friday comments
- Accounts for weekends and natural work rhythms

**Tradeoff**: More complex date logic, timezone assumptions.

---

## No Real-Time Updates

**Decision**: Poll-based sync, no webhooks.

**Rationale**:

- Simpler infrastructure
- No webhook endpoint to secure
- Acceptable latency for dashboard use case

**Tradeoff**: Data can be up to N hours stale.

---

## Session-Based Auth

**Decision**: Simple password + session token, not OAuth/SSO.

**Rationale**:

- Single-user or trusted-team use case
- No external identity provider needed
- Quick to implement

**Tradeoff**: Not suitable for multi-tenant or public deployment.
