# Linear Bot

A beautiful terminal UI for Linear to help identify and resolve WIP constraints and gain useful insights into your team's work.

## Features

✨ **World-Class Terminal UI** - Built with Ink for a modern, interactive experience
🔄 **Real-time Sync** - Fetch all active issues from Linear with live progress
📊 **WIP Constraint Analysis** - Identify team members exceeding work-in-progress limits
🎨 **Color-Coded Status** - Visual indicators for critical, warning, and healthy workloads
⚡ **Fast Navigation** - Vim-style keybindings (j/k) and arrow keys
🎯 **Team Filtering** - Ignore specific teams (CS, Support, etc.) from analysis

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

Simply run the bot to launch the interactive terminal UI:

```bash
bun start
```

### Navigation

The bot provides an intuitive menu-driven interface:

**Main Menu:**

- `s` - Sync from Linear
- `b` - Browse Issues
- `q` - Exit

**Browse Issues:**

- **Level 1: Assignee Summary**

  - All assignees with flexible sorting
    - Press `s` to toggle between "Issue Count" and "Name (A-Z)"
    - Default: sorted by issue count (descending)
  - WIP Constraint Tracking (3 ideal, 5 max)
    - ✓ GOOD (1-3 issues) - Normal text
    - ⚪ OK (4-5 issues) - Normal text
    - 🟠 WARNING (6-7 issues) - Yellow text
    - 🔴 CRITICAL (8+ issues) - Red text
  - Violation summary at the top

- **Level 2: Issue Browser**

  - Compact one-line-per-issue list
  - Team tags and status inline: `[APP-34] (In Progress) Title`
  - Navigate with ↑/↓ or j/k
  - Enter to view full details

- **Level 3: Issue Details**
  - Full issue title and description
  - All metadata (team, status, assignee)
  - Direct link to Linear
  - Press 'b' or 'q' to go back

**Keyboard Shortcuts:**

- `↑/↓` or `j/k` - Navigate up/down
- `Enter` - Select item / drill down
- `s` - Toggle sort mode (in assignee list: Issue Count ↔ Name A-Z)
- `b` or `q` - Go back / Exit
- Menu shortcuts: s (sync), b (browse), q (quit)

### Sync Command

The sync process:

1. Connects to Linear API
2. Fetches all issues in "started" states
3. Filters out ignored teams
4. Stores in local SQLite database
5. Shows real-time progress

**Optimization:** Uses Linear's GraphQL API with `state.type: "started"` filtering to fetch everything efficiently in a single paginated query, avoiding rate limits.

## WIP Constraints

The bot tracks Work In Progress constraints:

- **Ideal**: 3 issues per person
- **Maximum**: 5 issues per person
- **Warning**: 6-7 issues (🟠 yellow)
- **Critical**: 8+ issues (🔴 red)

These thresholds help identify team members who may be overloaded or blocked.

## Architecture

Built with modern technologies:

- **Runtime**: Bun for fast TypeScript execution
- **UI**: Ink (React for CLIs) for beautiful terminal interfaces
- **Database**: SQLite for local storage
- **API**: Linear GraphQL API via `@linear/sdk`

## Project Structure

```
src/
  index.tsx               # Ink app entry point
  components/
    App.tsx               # Main app component
    MainMenu.tsx          # Menu navigation
    SyncView.tsx          # Sync progress display
    BrowseView.tsx        # Issue browser
  db/
    schema.ts             # Database schema
    connection.ts         # SQLite connection
  linear/
    client.ts             # Linear API wrapper
  commands/               # Legacy CLI commands (deprecated)
  ui/
    display.ts            # Formatting utilities
```

## Environment Variables

- `LINEAR_API_KEY` (required) - Your Linear API key
- `IGNORED_TEAM_KEYS` (optional) - Comma-separated team keys to ignore

## Development

Watch mode for development:

```bash
bun run dev
```

## License

MIT
