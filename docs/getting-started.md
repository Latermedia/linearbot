# Getting Started

## Prerequisites

- [Bun](https://bun.sh) runtime (uses `bun:sqlite`)
- [Linear API key](https://linear.app/settings/api)

## Setup

```bash
bun install
```

Create `.env`:

```bash
LINEAR_API_KEY=your_linear_api_key_here
APP_PASSWORD=your_secure_password_here

# Optional
IGNORED_TEAM_KEYS=CS,MUX
TEAM_DOMAIN_MAPPINGS='{"FE":"Frontend","BE":"Backend"}'
```

## Sync Data

```bash
bun run sync
```

## Run

```bash
bun run dev
```

Open http://localhost:5173

## Terminal App (Optional)

```bash
bun run start:cli
```

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

