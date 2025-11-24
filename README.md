# Linear Bot

SvelteKit dashboard for tracking WIP constraints and project health in Linear.

## Features

- **WIP Tracking** - Identifies engineers exceeding work limits (ideal: 3, max: 5)
- **Project Health** - Detects multi-engineer projects, status mismatches, stale updates
- **Unassigned Work** - Flags started issues without owners
- **Gantt View** - Visual timeline of project schedules

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
