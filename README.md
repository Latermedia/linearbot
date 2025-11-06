# Linear Bot

A beautiful terminal UI for Linear to help identify and resolve WIP constraints and gain useful insights into your team's work.

## Features

📊 **Real-Time Dashboard** - WIP violations summary on startup, see problems at a glance
✨ **Elegant Terminal UI** - Futuristic design with sophisticated box-drawing characters and refined aesthetics
🔄 **Two-Phase Sync** - Fetch started issues + complete project data for accurate metrics
📋 **WIP Constraint Analysis** - Identify team members exceeding work-in-progress limits (5 max)
📦 **Project Health Tracking** - Monitor active projects for multi-engineer issues, status mismatches, and stale updates
🎨 **Color-Coded Violations** - Critical (🔴) and warning (🟠) indicators
⚡ **Hotkey Navigation** - Single-key shortcuts for instant access
🎯 **Team Filtering** - Ignore specific teams (CS, Support, etc.) from analysis
⚠️ **Smart Alerts** - Automatic detection of problems requiring attention

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

### Dashboard & Navigation

The bot opens with a **WIP violations dashboard** showing real-time health metrics:

**Dashboard Sections:**

- **Summary Stats** - Total assignees, active projects, and unassigned issues
- **Unassigned Issues** (magenta) - Started issues that need assignment
  - These are NOT counted as WIP violations
  - Shown prominently for action
  - Press `u` to add warning comments to all unassigned issues in Linear
- **WIP Violations by Assignee** (⚠️ red/yellow) - People exceeding 5 started issues (max: 5)
  - 🔴 Critical (8+ issues) / 🟠 Warning (6-7 issues)
  - Top 5 violations shown, sorted by severity
  - Unassigned issues excluded from this view
- **Project Issues** (⚠️ yellow) - Active projects with problems
  - Multiple engineers working on same project (ideal: 1)
  - Status mismatches (backlog status with active work)
  - Stale updates (no update in 7+ days)
  - Top 5 issues shown

**Navigation Hotkeys** (always visible at top):

- `s` - Sync from Linear
- `b` - Browse Issues (full list)
- `p` - Browse Projects (full list)
- `e` - Browse Engineers on Multiple Projects
- `u` - Comment on all unassigned issues (adds warning in Linear)
- `c` - Clear comment notification (when visible)
- `q` - Quit

**Browse Issues:**

Shows **only issues with "started" status** for WIP constraint tracking.

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
  - **Note:** Only counts "started" issues (not todo, done, etc.)

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

**Browse Projects:**

Shows projects with active work, including **all issues** (todo, started, done, etc.) for accurate completion metrics.

- **Level 1: Team Summary**

  - Overview of active projects by team
  - Shows project counts: total, in progress, backlog
  - Warnings for status mismatches and stale updates
  - Only shows teams with active projects

- **Level 2: Project Details**

  - Projects for selected team
  - Sorting options (press `s` to toggle):
    - **Progress**: Sort by number of in-progress issues
    - **Activity**: Sort by last activity date
  - For each project:
    - Progress percentage (completed vs total issues)
    - Issue breakdown by status
    - Engineer count with WIP constraint tracking
    - Status mismatch warnings (e.g., "Backlog" with active work)
    - Stale update warnings (no update in 7+ days)
    - Multi-team project indicators

- **Level 3: Project Issues**
  - All issues in the selected project
  - Shows identifier, status, assignee, and title
  - Displays project health warnings
  - Lists all engineers working on project
  - Multi-team breakdown if applicable

**Keyboard Shortcuts:**

- `↑/↓` or `j/k` - Navigate
- `Enter` - Select / drill down
- `s` - Toggle sort (in lists)
- `b` or `q` - Back / Exit

### Sync Command

The sync process runs **inline in the main menu** with a **two-phase approach** for accurate metrics:

1. Press `s` or select "Sync from Linear" in the menu
2. Watch the sync progress appear in a status bar above the menu
3. See real-time updates: Connecting → Fetching Started Issues → Fetching Project Issues → Storing → Complete
4. After 3 seconds, the status bar disappears and you can continue navigating

**Behind the scenes (Two-Phase Sync):**

**Phase 1: Active Issues**

1. Connects to Linear API
2. Fetches all issues in "started" states (including project data)
3. Filters out ignored teams
4. Identifies active projects

**Phase 2: Complete Project Data** 5. For each active project, fetches ALL issues (todo, in-progress, done, canceled, etc.) 6. This ensures accurate completion percentages in the Projects view 7. Deduplicates issues between phases

**Phase 3: Storage** 8. Stores all issues in local SQLite database 9. Shows real-time progress throughout

**Why Two Phases?** To get accurate project progress metrics, we need all issues in a project, not just the started ones. This two-phase approach keeps the sync fast while providing complete data for active projects.

**Optimization:** Uses Linear's GraphQL API efficiently with filtered queries to avoid rate limits. Typical sync time: 2-5 seconds depending on project count.

**Note:** Data persists between sessions. The dashboard will show cached data on startup, or prompt you to sync if no data is available. Navigation is disabled while syncing to prevent issues.

### Comment on Unassigned Issues

Press `u` from the dashboard to automatically comment on all unassigned started issues in Linear. The bot will:

1. Find all started issues without an assignee
2. Add a comment to each issue: _"⚠️ This issue requires an assignee - This started issue is currently unassigned. Please assign an owner to ensure it gets proper attention and tracking."_
3. Show real-time progress as it comments
4. Display completion summary

This is useful for:

- Alerting teams to assign ownership
- Leaving a paper trail of when issues were flagged
- Encouraging accountability without manual intervention

**Permissions:** Requires Linear API key with comment permissions.

## WIP Constraints

The bot tracks Work In Progress constraints at multiple levels:

**Issue-Level Constraints (Browse Issues):**

- **Ideal**: 3 issues per person
- **Maximum**: 5 issues per person
- **Warning**: 6-7 issues (🟠 yellow)
- **Critical**: 8+ issues (🔴 red)

These thresholds help identify team members who may be overloaded or blocked.

**Project-Level Constraints (Browse Projects):**

- **Ideal**: 1 project per engineer (exceptions for architects and team leads)
- **Active Projects**: Must have started issues OR recent activity (within 14 days)
- **Status Mismatch**: ⚠️ Warning when project status doesn't match actual work state
- **Stale Updates**: 🕐 Warning when project hasn't been updated in 7+ days
- **Multi-team Projects**: 🔗 Indicated when issues span multiple teams

These constraints help ensure focus and prevent context switching across too many initiatives.

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

### UI Components

The app uses a reusable `BoxPanel` component for creating elegant bordered sections:

```tsx
import { BoxPanel, BoxPanelLine } from "./components/BoxPanel.js";

// Simple panel
<BoxPanel title="STATUS" width={40}>
  <BoxPanelLine>
    <Text color="green">✓ System operational</Text>
  </BoxPanelLine>
</BoxPanel>

// Multi-line panel
<BoxPanel title="METRICS" width={50} marginBottom={2}>
  <BoxPanelLine>
    <Text bold>5</Text>
    <Text dimColor> assignees • </Text>
    <Text bold>12</Text>
    <Text dimColor> projects</Text>
  </BoxPanelLine>
  <BoxPanelLine>
    <Text dimColor>Last sync: </Text>
    <Text>2 minutes ago</Text>
  </BoxPanelLine>
</BoxPanel>
```

**BoxPanel Props:**

- `title` - The title displayed in the top border
- `width` - Panel width in characters (default: 50)
- `marginBottom` - Bottom margin (default: 0)
- `children` - Content to display inside the panel

**BoxPanelLine:**

- Automatically adds the left and right border characters (`│`) with spacing
- Use for standard rows within a BoxPanel
- For complex layouts, you can use raw `Box`/`Text` components inside BoxPanel

See `src/components/BoxPanel.example.tsx` for more examples and tips.

## Write Operation Logging

The bot automatically logs all write operations (comments, updates, etc.) to a log file for audit and debugging purposes.

### Log Location

All write operations are logged to: `logs/write-operations.log`

Each entry is stored as a JSON line with:

- Timestamp
- Operation type (e.g., `comment_created`, `comment_failed`)
- Issue details (ID, identifier, title, URL)
- Success/failure status
- Error messages (if applicable)
- Additional context

### Viewing Logs

Use the `view-logs` command to analyze write operations:

```bash
# Show statistics (default)
bun run view-logs

# Show recent operations (last 10 by default)
bun run view-logs recent

# Show recent 20 operations
bun run view-logs recent 20

# Show help
bun run view-logs help
```

**Example output:**

```
📊 Write Operations Statistics

Total operations: 42
Success rate: 95.2%
Last 24 hours: 8

By operation type:
  comment_created: 38
  comment_failed: 4
```

### Features

- ✅ **Automatic tracking** - All write operations are logged without manual intervention
- ✅ **Duplicate prevention** - Checks both local database and Linear API before commenting
- ✅ **Audit trail** - Complete history of what the bot has done
- ✅ **Error tracking** - Failed operations are logged with error details
- ✅ **24-hour checks** - Won't re-comment on issues within 24 hours
- ✅ **JSON format** - Easy to parse and analyze programmatically

### Comment Deduplication

When you press `u` to comment on unassigned issues, the bot:

1. **Syncs first** - Fetches latest issue states from Linear (skips project sync for speed)
2. **Filters intelligently** - Only considers actively worked issues:
   - Includes: "In Progress", "In Review", "In QA", etc.
   - Excludes: "Paused" and "Blocked" (being unassigned is often intentional)
3. **Checks local DB** - Skips issues commented on in the past 24 hours (from bot's database)
4. **Checks Linear API** - Double-checks Linear for existing warning comments
5. **Comments on all issues** - Adds warnings to ALL issues that need them (with 500ms delay between comments)
6. **Shows results** - Displays a list of all commented issues (up to 10 shown, plus count of remaining)
7. **Logs operation** - Records each comment in the write log and database

This prevents spam and ensures issues aren't repeatedly warned about if they remain unassigned.

**Note**:

- The unassigned count on the dashboard also excludes "Paused" and "Blocked" issues for consistency
- After comments are added, press `c` to manually clear the notification
- If nothing needs comments or there's an error, the notification auto-clears after a few seconds

## License

MIT
