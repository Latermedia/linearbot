# LinearBot

Surface project health, WIP constraints, and best practice violations from Linear.

## Prerequisites

- [Bun](https://bun.sh) runtime (uses `bun:sqlite`)
- [Git](https://git-scm.com)
- [Linear API key](https://linear.app/settings/api) (optional — mock data mode available for development)

## Quick Start

```bash
bun run setup         # Check prerequisites, create .env, install deps
# Edit .env with your LINEAR_API_KEY and APP_PASSWORD
bun run sync          # Sync data from Linear
bun run dev           # Start dev server
```

Open http://localhost:5173

### Mock Data Mode (No Linear Account)

New contributors can run the app without a Linear API key:

```bash
bun run setup         # Creates .env (leave LINEAR_API_KEY empty)
bun run sync          # Generates realistic mock data
bun run dev           # Start dev server
```

Mock mode activates when `LINEAR_API_KEY` is missing, empty, or set to `mock`. It generates 7 projects with 50+ issues including realistic violations for testing.

### Manual Setup

```bash
bun install
cp .env.example .env
```

Edit `.env` with your Linear API key and desired configuration settings.

## What It Does

- **Violation tracking** — missing estimates, priorities, stale updates, status mismatches
- **WIP monitoring** — engineer workload limits (ideal: 3, max: 5 active issues)
- **Project health** — leads, health status, update freshness
- **Visual planning** — Gantt chart view of project timelines

## Configuration

### Team Domain Mappings

Map Linear team keys to logical domains. Find team keys in issue identifiers (e.g., `ENG-123` → `ENG`).

```bash
# By function
TEAM_DOMAIN_MAPPINGS='{"WEB":"Frontend","API":"Backend","INFRA":"Platform"}'

# By product
TEAM_DOMAIN_MAPPINGS='{"CART":"Shopping","SEARCH":"Discovery"}'
```

### Team Filtering

**Whitelist mode** (recommended) — only sync specific teams:

```bash
WHITELIST_TEAM_KEYS=ENG,PLAT,INFRA
```

**Blacklist mode** — exclude specific teams:

```bash
IGNORED_TEAM_KEYS=CS,SUPPORT,OPS
```

Find team keys in issue identifiers (e.g., `ENG-123` → `ENG`).

If `WHITELIST_TEAM_KEYS` is set, it takes precedence and existing data from non-whitelisted teams is cleaned up during sync.

### Ignored Assignees

Exclude specific assignees from metrics (e.g., contractors or external collaborators):

```bash
IGNORED_ASSIGNEE_NAMES=John Doe,External Contractor
```

This removes issues and engineer records for the specified assignees during sync.

### Engineer Team Mapping

Map engineers to their teams for accurate WIP metrics when filtering by team:

```bash
ENGINEER_TEAM_MAPPING=Alice:ENG,Bob:ENG,Carol:DESIGN,Dave:PLATFORM
```

When viewing a specific team's dashboard, only engineers mapped to that team will count towards the "unique ICs" and "avg projects per IC" metrics. This prevents engineers from other teams working on shared projects from inflating another team's WIP statistics.

When no team filter is applied (viewing all teams), all engineers are counted regardless of mapping.

## Documentation

| Doc                                  | Purpose                        |
| ------------------------------------ | ------------------------------ |
| [Roadmap](TODO.md)                   | Planned features, known issues |
| [Release Notes](NEWS.md)             | Version history                |
| [Features](docs/features.md)         | What the app does              |
| [Architecture](docs/architecture.md) | System design                  |
| [API Reference](docs/api.md)         | Endpoints                      |
| [All Docs](docs/README.md)           | Documentation hub              |

## Releasing

```bash
bun run release-prepare-patch   # Bump version, generate NEWS.md prompt
# ... update NEWS.md with AI-generated summary ...
bun run release-commit          # Commit, tag, output push instructions
```

## Deployment

For Fly.io:

```bash
cp fly.toml.example fly.toml
fly volumes create linear_bot_data --region iad --size 1
fly secrets set LINEAR_API_KEY=... APP_PASSWORD=...
fly deploy
```

This deployment uses a Fly.io volume mounted at `/data` to persist the SQLite database (default: `/data/linear-bot.db`) across deploys and restarts.

Recommended `fly.toml` settings:

- Mount the volume to `/data`
- Set `DB_PATH=/data/linear-bot.db` in `[env]` (explicitly pins the DB file onto the mounted volume)
- Keep `max_machines_running = 1` (SQLite file is not safe to share across multiple machines)

After you deploy, verify persistence:

- Check logs for `"[DB] Database file: /data/linear-bot.db"`
- Trigger a write (e.g. run a sync)
- Redeploy and confirm the data is still present

## License

[MIT](LICENSE) © 2025 Victory Square Media Inc. dba Later
