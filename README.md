# Linear Bot

A read-only view layer on top of Linear data that makes it easy to create sophisticated, opinionated views of your work. Surface violations of best practices, track project health, and visualize team capacity—all in one place.

## The Problem

Linear is powerful, but it's not easy to see everything that needs attention in a single view. You can create custom views and filters for specific issues, but there's no simple way to see all violations of best practices across your entire workspace at once. This tool aggregates those insights into actionable dashboards.

## What It Does

**Read-only analysis** of your Linear data, surfacing:

- **Best Practice Violations** - Missing estimates, priorities, descriptions, stale updates, status mismatches, and more—all visible in one place
- **WIP Tracking** - Identify engineers exceeding work limits (ideal: 3, max: 5 active issues)
- **Project Health** - Detect multi-engineer projects, status mismatches, stale updates, missing leads
- **Unassigned Work** - Flag started issues without owners
- **Visual Planning** - Gantt chart view of project timelines

## Features

- **Unified Violation View** - See all best practice violations across projects and issues in a single table
- **Project Health Dashboard** - Track missing leads, stale updates, status mismatches, and health metrics
- **WIP Constraints** - Monitor engineer workload to prevent context switching
- **Gantt View** - Visual timeline of project schedules
- **Team & Domain Grouping** - Organize views by Linear teams or custom domain mappings
- **Executive View** - Focus on high-priority projects with the "Executive Visibility" label

## Quick Start

```bash
bun install
```

Create `.env`:

```bash
LINEAR_API_KEY=your_linear_api_key_here

# Optional: Exclude teams from sync
IGNORED_TEAM_KEYS=CS,MUX

# Optional: Team-to-domain mappings (enables grouping views)
TEAM_DOMAIN_MAPPINGS='{"FE":"Frontend","BE":"Backend","INFRA":"Platform"}'
```

Sync data from Linear:

```bash
bun run sync
```

Run the web app:

```bash
bun run dev
```

Open http://localhost:5173

**Note:** Requires Bun (uses `bun:sqlite` for API routes). Run `bun run sync` first to populate the database.

## Terminal App (Optional)

```bash
bun run start:cli
```

## Architecture

**Stack:** SvelteKit + Tailwind CSS + SQLite + Linear GraphQL API

**Structure:**

```
src/
  routes/        # SvelteKit pages and API endpoints
  lib/           # Components, stores, utilities
  db/            # SQLite schema and queries
  services/      # Sync and dashboard logic
  linear/        # Linear API client

terminal/        # Optional Ink-based TUI
```

**Data Flow:** Linear API → SQLite cache → SvelteKit API routes → Frontend

## Configuration

**Team Domain Mappings:** Map Linear team keys (e.g., `ENG`, `FE`) to logical domains. Find team keys in issue identifiers like `ENG-123`.

**Examples:**

```bash
# By function
TEAM_DOMAIN_MAPPINGS='{"WEB":"Frontend","API":"Backend","INFRA":"Platform"}'

# By product area
TEAM_DOMAIN_MAPPINGS='{"CART":"Shopping","SEARCH":"Discovery"}'
```

## How It Works

Surfaces workflow issues by analyzing Linear data:

- **WIP Violations** - Highlights engineers with too many active issues, helping prevent context switching and delivery delays
- **Project Health** - Identifies projects with multiple engineers, mismatched statuses, or stale updates to catch coordination problems early
- **Ownership Gaps** - Finds started work without clear owners to prevent work from falling through cracks
- **Visual Planning** - Gantt chart view shows project timelines and dependencies for better capacity planning

## License

[MIT](LICENSE) © 2025 Victory Square Media Inc. dba Later
