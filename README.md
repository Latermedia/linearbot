# LinearBot

Surface project health, WIP constraints, and best practice violations from Linear.

## Quick Start

```bash
bun install
cp .env.example .env  # Add your LINEAR_API_KEY and APP_PASSWORD
bun run sync
bun run dev
```

Open http://localhost:5173

See [Getting Started](docs/getting-started.md) for detailed setup.

## What It Does

- **Violation tracking** — missing estimates, priorities, stale updates, status mismatches
- **WIP monitoring** — engineer workload limits (ideal: 3, max: 5 active issues)
- **Project health** — leads, health status, update freshness
- **Visual planning** — Gantt chart view of project timelines

## Documentation

| Doc | Purpose |
|-----|---------|
| [Roadmap](TODO.md) | Planned features, known issues |
| [Release Notes](NEWS.md) | Version history |
| [Features](docs/features.md) | What the app does |
| [Architecture](docs/architecture.md) | System design |
| [API Reference](docs/api.md) | Endpoints |
| [All Docs](docs/README.md) | Documentation hub |

## Releasing

```bash
bun run release-prepare-patch   # Bump version, generate NEWS.md prompt
# ... update NEWS.md with AI-generated summary ...
bun run release-commit          # Commit, tag, output push instructions
```

## Deployment

See [Getting Started](docs/getting-started.md) for local setup.

For Fly.io deployment:

```bash
cp fly.toml.example fly.toml
fly secrets set LINEAR_API_KEY=... APP_PASSWORD=...
fly deploy
```

## License

[MIT](LICENSE) © 2025 Victory Square Media Inc. dba Later
