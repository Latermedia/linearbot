# Linear Bot

A terminal UI for Linear that identifies WIP constraint violations and surfaces issues/projects not following best practices.

## Purpose

Helps engineering teams maintain healthy workflows by:

- **WIP Constraint Tracking** - Identifies team members exceeding work-in-progress limits (ideal: 3, max: 5)
- **Project Health** - Detects multi-engineer projects, status mismatches, and stale updates
- **Unassigned Work** - Flags started issues without owners
- **Dashboard** - Summary of violations and problem areas at a glance

## Quick Start

```bash
bun install
```

Create `.env`:

```bash
LINEAR_API_KEY=your_linear_api_key_here
IGNORED_TEAM_KEYS=CS,MUX  # Optional: exclude teams
```

Run:

```bash
bun start
```

## Architecture

**Stack:**

- Bun (TypeScript runtime)
- Ink (React for terminal UIs)
- SQLite (local caching)
- Linear GraphQL API

**Data Sync:**

- Two-phase sync: fetches started issues first, then complete project data
- Local SQLite cache for fast dashboard rendering

**Structure:**

```
src/
  components/     # Ink UI components (dashboard, browsers, panels)
  db/            # SQLite schema and connection
  linear/        # Linear API wrapper
  ui/            # Display utilities
```

## WIP Constraints

**Per-Person (Issue-Level):**

- ✓ Good: 1-3 issues
- ⚪ OK: 4-5 issues
- 🟠 Warning: 6-7 issues
- 🔴 Critical: 8+ issues

**Per-Project:**

- Ideal: 1 engineer per project
- Flags: status mismatches, stale updates (7+ days), multi-team sprawl

## License

[MIT](LICENSE) © 2025 Victory Square Media Inc. dba Later
