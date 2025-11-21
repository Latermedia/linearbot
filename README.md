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

# Optional: Exclude specific teams from sync
IGNORED_TEAM_KEYS=CS,MUX

# Optional: Team-to-domain mappings (enables Domains and Teams views)
# Map your Linear team keys to logical domain groupings
# TEAM_DOMAIN_MAPPINGS='{"FE":"Frontend","BE":"Backend","INFRA":"Platform","DATA":"Data"}'
```

### Sync Data from Linear

First, sync your Linear data to the local database:

```bash
bun run sync
```

This will fetch all started issues and active projects from Linear.

### Run Terminal App (Original TUI)

```bash
bun run start:cli
```

### Run Web App (New Timeline View)

**Development:**
```bash
bun run dev
```

Then open http://localhost:5173 in your browser.

**Important:** 
- The web app requires Bun to run the API routes (uses `bun:sqlite`)
- If you see runtime errors, make sure you're using `bun run dev` (not `npm run dev` or `vite dev`)
- Make sure to run `bun run sync` first to populate the database

## Architecture

**Stack:**

- Bun (TypeScript runtime)
- **Terminal App:** Ink (React for terminal UIs)
- **Web App:** SvelteKit + shadcn/ui + Tailwind CSS
- SQLite (local caching)
- Linear GraphQL API

**Data Sync:**

- Two-phase sync: fetches started issues first, then complete project data
- Local SQLite cache for fast dashboard rendering
- Web app queries SQLite via API endpoints

**Structure:**

```
terminal/
  components/    # Ink UI components (TUI dashboard)
  hooks/         # Terminal-specific hooks
  ui/            # Display utilities
  index.tsx      # Terminal app entry point

src/
  routes/        # SvelteKit pages and API endpoints
  lib/           # Web app components, stores, utilities
  db/            # SQLite schema and connection (shared)
  services/      # Sync and dashboard services (shared)
  linear/        # Linear API wrapper (shared)
  utils/         # Helper functions (shared)
```

## Configuration

### Team Domain Mappings (Optional)

Map your Linear team keys to logical domains to enable team and domain grouping views. Without this configuration, the tool works but won't show Teams/Domains views.

**Example configurations:**

```bash
# Simple setup: Frontend, Backend, Platform
TEAM_DOMAIN_MAPPINGS='{"WEB":"Frontend","MOBILE":"Frontend","API":"Backend","INFRA":"Platform","DEVOPS":"Platform"}'

# Product-oriented: Map teams to product areas
TEAM_DOMAIN_MAPPINGS='{"CART":"Shopping","CHECKOUT":"Shopping","SEARCH":"Discovery","RECS":"Discovery","ANALYTICS":"Data"}'

# Org structure: Engineering divisions
TEAM_DOMAIN_MAPPINGS='{"GROWTH":"Consumer","CREATOR":"Consumer","ADS":"B2B","INSIGHTS":"B2B","DATA":"Platform","INFRA":"Platform"}'
```

**How to find your team keys:**
1. Open Linear → any issue
2. Look at issue identifier (e.g., `ENG-123`)
3. The prefix (`ENG`) is your team key

### Ignoring Teams

Exclude specific teams from syncing:

```bash
# Skip customer support and marketing teams
IGNORED_TEAM_KEYS=CS,MKT,SALES
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
