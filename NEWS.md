# Release Notes

## v0.6.0

### Added

- Teams page with engineer mapping management
- Engineer modal and non-project WIP display on main page
- Four Pillars Metrics snapshot system with GetDX TrueThroughput integration
- Composite healthy workload metric
- Team whitelist and assignee filtering for sync
- Project detail modal on metrics page
- Project lead avatar URL sync
- Active project count tracking per engineer

### Changed

- Renamed "violations" to "gaps" with unified terminology and styling
- Redesigned projects table with gaps column
- Redesigned WIP Health card with rotating principles
- Refined progress bar with lighter purple tones
- Updated project/IC target from 0.5 to 1.5

### Fixed

- Delete projects and engineers from non-whitelisted teams during sync
- Threshold-based coloring for gaps display
- Serve root-level static files like favicon
- Shell compatibility for engineer team mapping quotes
- Sync modal constrained to 90vh with scrollable content
- WIP age validation now only checks in-progress issues
- Stale sync state detection and reset
- Sync status race conditions with optimistic UI updates
- Bundle sync worker for production builds

## v0.5.0

### Added

- Year-in-review script for analyzing annual project data
- Deep history sync with optimized Linear API usage
- Time range toggle in Gantt export modal
- Project filter and reset controls in Gantt export modal
- Global team filter across all pages
- Plan & WIP filter option for issue views

### Changed

- Consolidated sync service with auto-deletion of ignored team issues

### Fixed

- Ignored teams now filtered from project sync phases
- Toggle indicator positioning using offset properties
- Projects with zero issues now sync correctly
- Login credentials properly persist authentication session

## v0.4.0

### Added

- Initiatives view with content field and markdown rendering
- Sync modal with phase selection for granular control
- Incremental project sync with improved progress tracking
- Project content syncing from Linear API
- Database persistence to Fly.io volume
- Exponential backoff for sync status polling
- Gantt chart visual styling improvements and current date indicator
- Authentication system with session management

### Changed

- Refactored sync service into phase-based architecture
- Consolidated Linear API calls to reduce request count
- Improved sync progress tracking and state management
- Enhanced error handling and input validation

### Fixed

- Race conditions in sync progress tracking
- Sync status display for planned and completed projects
- Client redirect issues on initial load
- Empty request body handling in sync API
- Various sync and UI stability improvements

## v0.3.0

### Added

- Sync phase tracking for better visibility into sync progress
- API query count display in dev menu
- Gantt timeline extended to 5 quarters with view mode toggle
- Project filtering functionality
- Planned and completed project syncing with API query tracking
- Sync projects with recently completed WIP issues
- Subissue handling with status column and priority display
- Modal animations for smoother transitions
- Comment count display on issues

### Changed

- Improved project modal sync and status display
- Enhanced issue display and WIP filtering
- Dev tools modal refactored with shared components and system stats
- Consolidated all modals to use shared Modal component
- Navigation items reordered and hidden on login page

### Fixed

- Filter reactivity issues
- Project modal resync and project updates sync issues

## v0.2.0

### Project Target Dates

- **Dual date display** — show Linear's project target date alongside velocity-predicted end date in Projects table, detail modal, and hover tooltip
- **Date discrepancy warnings** — highlight projects where target and predicted dates differ by 30+ days with amber indicators
- **Gantt date mode toggle** — switch between Target and Predicted end dates for bar positioning in both the live view and export modal
- **Target date marker** — gold diamond marker shows target date position on Gantt bars when viewing in Predicted mode

### UI Improvements

- Renamed "Dashboard" to "Projects" for clearer navigation

## v0.1.1

### Fixed

- Comment violations now only shown for WIP issues
- Resolved issues with estimates, alerts, dates, and subissues

## v0.1.0

_Initial release_

### Views

- **Projects** — stats cards for teams, projects, and health metrics with table/Gantt toggle
- **Executive View** — projects filtered by `Executive Visibility` label with card, table, and Gantt options
- **Engineers View** — WIP tracking and constraint violations per engineer with detail modal

### Projects

- Stats cards: Total Teams, Active Projects, Average Projects/Team, Missing Updates, Status Mismatches, Missing Leads
- Sortable project table grouped by team or domain
- Click rows for project detail modal

### Gantt Chart

- 90-day quarter timeline with progress fill
- Month markers and today indicator line
- Fade effects for projects extending beyond visible range
- Export to PNG with configurable overlays (today indicator, warnings)

### Executive View

- Card view with project progress, velocity, health, teams, engineers, estimated completion
- Stats: Active Projects, Total Issues, Overall Progress, Issues Completed (Last 2 Weeks), Recent Velocity, Active Engineers
- Table and Gantt views available

### Engineers View

- WIP issue count and total points per engineer
- Stats: Engineers with active WIP, Total WIP Issues, Avg WIP/Engineer, Over WIP Limit, Total Violations
- Sortable by WIP limit violations
- Engineer detail modal with active issues

### Project Detail Modal

- Progress bar (completed/in-progress/remaining)
- Velocity, cycle time, lead time, estimate accuracy
- Velocity breakdown by team
- Project health updates with history toggle
- Issues table with direct links to Linear

### Violation Tracking

- Missing estimates (issues without story points)
- Missing priorities (Priority = 0)
- Missing descriptions (empty description field)
- Stale updates (project not updated in 7+ days)
- Status mismatches (project state vs active work)
- WIP age violations (started >14 days ago)
- Missing project leads
- Missing health status
- No recent comment (business-day aware)

### WIP Constraints

- Ideal threshold: 5 issues per engineer
- Warning threshold: 6 issues
- Critical threshold: 8 issues

### Grouping

- **Team-based** — by Linear teams
- **Domain-based** — custom team→domain mappings via `TEAM_DOMAIN_MAPPINGS` env
- **Multi-team** — projects spanning multiple teams

### Infrastructure

- SQLite database with computed metrics
- Linear API sync with progress indicator
- Auto-sync scheduler
- Password authentication (24h sessions)
- Fly.io deployment configuration

### Mock Data Mode

- Automatically activates when `LINEAR_API_KEY` is missing, empty, or set to `mock`
- Generates 7 projects with 50+ issues including realistic violations for testing
- Enables development and demos without Linear account

### UI & UX

- Theme toggle (dark/light)
- Sync indicator with real-time progress
- Presentation mode (`Cmd/Ctrl+Shift+E`) for executive demos
- Dev menu (`Cmd/Ctrl+Shift+D`) with manual sync and database reset
- Hover tooltips for project details
- Sticky controls during scroll
