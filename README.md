# LinearBot

Surface project health, WIP constraints, and best practice violations from Linear.

## Prerequisites

- [Bun](https://bun.sh) runtime (uses `bun:sqlite`)
- [Git](https://git-scm.com)
- [Linear API key](https://linear.app/settings/api)

## Quick Start

```bash
bun run setup         # Check prerequisites, create .env, install deps
# Edit .env with your LINEAR_API_KEY and APP_PASSWORD
bun run sync          # Sync data from Linear
bun run dev           # Start dev server
```

Open http://localhost:5173

### Manual Setup

```bash
bun install
cp .env.example .env
```

Edit `.env` with your Linear API key and desired configuration settings.

### Terminal App (Optional)

```bash
bun run start:cli
```

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

### Ignored Teams

Exclude teams from sync:

```bash
IGNORED_TEAM_KEYS=CS,SUPPORT,OPS
```

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
fly secrets set LINEAR_API_KEY=... APP_PASSWORD=...
fly deploy
```

## License

[MIT](LICENSE) © 2025 Victory Square Media Inc. dba Later
