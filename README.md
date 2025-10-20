# Linear Bot

A bot for Linear to help identify and resolve WIP constraints and other useful insights.

## Phasing

1. ✅ **Phase 1**: aggregate WIP across all teams, organize by assignee and highlight WIP constraint violations
2. inventory of team and report on work completed in the past 7 days and 30 days
3. backlog grooming and analysis
4. ?

## Installation

```bash
bun install
```

## Configuration

1. Get your Linear API key from [Linear Settings](https://linear.app/settings/api)
2. Create a `.env` file in the root directory:

```bash
LINEAR_API_KEY=your_linear_api_key_here

# Optional: Ignore specific teams by their team key (comma-separated)
IGNORED_TEAM_KEYS=CS,SUPPORT
```

### Team Filtering

You can exclude specific teams from sync and reporting by setting `IGNORED_TEAM_KEYS` in your `.env` file. This is useful for:

- Customer support teams that don't follow the same WIP constraints
- Administrative teams
- Teams with different workflows

Example: `IGNORED_TEAM_KEYS=CS,SUPPORT,ADMIN`

## Usage

The bot provides a simple CLI with two main commands:

### 1. Sync from Linear

Sync all teams, workflow states, and active issues in one command:

```bash
bun start sync
```

This will:

- Fetch all issues in "started" states in **one efficient API query**
- Store everything in the SQLite database
- Display a summary of new and updated issues

The sync command includes real-time progress indicators showing:

- Issues fetched (with pagination support)
- Elapsed time

**Optimization:** Uses Linear's GraphQL API filtering (`state.type: "started"`) to fetch everything in one request, avoiding dozens of API calls and rate limiting issues.

### 2. List Active Issues (Interactive)

Launch an interactive menu to browse issues:

```bash
bun start list
```

This provides a multi-level interactive interface:

**Level 1: Assignee Summary**

- All assignees sorted by issue count
- **WIP Constraint Tracking** (3 ideal, 5 max)
  - Normal (0-5 issues): ✓ GOOD or ⚪ OK
  - Warning (6-7 issues): 🟠 WARNING (yellow text)
  - Critical (8+ issues): 🔴 CRITICAL (red text)
- Visual bars showing workload distribution
- Violation summary at the top
- Navigate with ↑/↓ arrow keys

**Level 2: Issue Browser**

- Compact one-line-per-issue list
- Team tags and truncated titles
- Navigate with ↑/↓ arrow keys
- Hover shows full details in description area

**Level 3: Issue Details**

- Full issue title and description
- All metadata (team, status, assignee)
- Direct link to Linear
- Option to open in browser

**Navigation:**

- Use ↑/↓ arrow keys to navigate
- Enter to select/drill down
- Ctrl+C or select Back/Exit to return

#### Non-Interactive Mode (Optional)

You can also view a specific assignee directly:

```bash
bun start list "Assignee Name"
bun start list Unassigned
```

### Help

View available commands:

```bash
bun start help
```

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Set up your API key
echo "LINEAR_API_KEY=your_key_here" > .env

# 3. Sync everything
bun start sync

# 4. View issues summary
bun start list

# 5. Drill down into specific assignee
bun start list "John Doe"
```

## Architecture

- **TypeScript + Bun**: Fast runtime and package manager
- **Bun SQLite**: Built-in SQLite support (no native dependencies!)
- **@linear/sdk**: Official Linear API client
- **@inquirer/prompts**: Interactive CLI menus
- **Denormalized storage**: Simple, fast schema optimized for reporting

### Database Schema

The bot uses a single, denormalized `issues` table for maximum simplicity and speed:

- **issues**: id, title, description, team_id, team_name, team_key, state_id, state_name, state_type, assignee_id, assignee_name, priority, created_at, updated_at, url

This denormalized approach:

- ✅ Minimizes API requests (one query instead of dozens)
- ✅ Simplifies queries (no joins needed)
- ✅ Optimizes for read-heavy reporting workload
- ✅ Tracks all "started" issues using Linear's native workflow type system

## Development

Run in watch mode:

```bash
bun run dev
```

## Performance

The bot is highly optimized for minimal API usage:

- **Single API query** fetches all "started" issues using GraphQL filtering
- **Pagination support** handles workspaces with 100+ issues
- **No rate limiting** - only makes one paginated request per sync

## Next Steps

- Process issues to identify WIP constraint violations
- Generate snapshots and reports
- Add time-series analysis for completed work
- Track issue state transitions over time
