# Contributing

## Setup

```bash
bun run setup
```

See [README.md](README.md) for prerequisites and configuration.

## Commit Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix      | Use case                    |
| ----------- | --------------------------- |
| `feat:`     | New feature                 |
| `fix:`      | Bug fix                     |
| `docs:`     | Documentation only          |
| `refactor:` | Code change, no new feature |
| `chore:`    | Build, deps, config         |
| `test:`     | Adding/updating tests       |

## Pull Requests

1. Branch from `main`
2. Keep changes focused and minimal
3. Update docs if behavior changes
4. Test locally: `bun run dev`
5. Ensure no lint errors: `bun run check`

## Architecture

See [docs/architecture.md](docs/architecture.md) for system design and directory structure.

## Additional Resources

- [TODO.md](TODO.md) — Roadmap and known issues
- [docs/](docs/README.md) — Full documentation
