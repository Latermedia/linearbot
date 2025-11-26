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

# Required: Password for application access
APP_PASSWORD=your_secure_password_here

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

## Deployment

### Deploy to Fly.io

This application is configured for deployment to Fly.io using Bun runtime with a single-node, stateless setup and in-memory database.

#### Prerequisites

- [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
- Fly.io account created
- Bun installed locally (for building)

#### Steps

1. **Install Fly.io CLI** (if not already installed):

   ```bash
   # macOS
   brew install flyctl

   # Other platforms: see https://fly.io/docs/hands-on/install-flyctl/
   ```

2. **Login to Fly.io**:

   ```bash
   fly auth login
   ```

3. **Create Fly.io app** (or use existing):

   ```bash
   fly apps create your-app-name
   ```

4. **Configure deployment**:

   ```bash
   # Copy the example configuration
   cp fly.toml.example fly.toml

   # Edit fly.toml and update:
   # - app = "your-app-name"
   # - primary_region = "iad" (or your preferred region)
   ```

5. **Set environment secrets**:

   ```bash
   fly secrets set LINEAR_API_KEY=your_linear_api_key
   fly secrets set APP_PASSWORD=your_secure_password

   # Optional secrets
   fly secrets set IGNORED_TEAM_KEYS=CS,MUX
   fly secrets set TEAM_DOMAIN_MAPPINGS='{"FE":"Frontend","BE":"Backend"}'
   ```

6. **Deploy**:

   ```bash
   fly deploy
   ```

7. **Verify deployment**:
   ```bash
   fly status
   fly logs
   ```

#### Configuration Files

- **Dockerfile** - Multi-stage Docker build using Bun runtime
- **server.js** - Server entry point that initializes the Bun server
- **fly.toml.example** - Template configuration file (copy to `fly.toml` and customize)

#### Notes

- The application uses an in-memory database, so data is lost on restart/redeploy
- Configured for single-node deployment (`min_machines_running = 1`)
- Uses immediate deployment strategy to prevent duplicate instances during deploys
- Port 3000 is used internally (Fly.io handles HTTPS termination)

## License

[MIT](LICENSE) © 2025 Victory Square Media Inc. dba Later
