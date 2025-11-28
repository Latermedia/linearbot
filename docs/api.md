# API Reference

All endpoints require authentication via session cookie.

## Sync

### POST /api/sync

Trigger a manual sync from Linear.

**Response**: `200` if started, `429` if already running.

### GET /api/sync/status

Poll sync status.

```json
{
  "status": "syncing" | "idle" | "error",
  "isRunning": true,
  "progressPercent": 45,
  "lastSyncTime": 1234567890000,
  "error": null
}
```

---

## Projects

### GET /api/projects

List all projects with computed metrics.

### GET /api/projects/[projectId]/description

Get project description.

---

## Issues

### GET /api/issues

All synced issues.

### GET /api/issues/started

Issues in started states only.

### GET /api/issues/by-project/[projectId]

Issues for a specific project.

### GET /api/issues/with-projects

Issues with project data joined.

### GET /api/issues/count

```json
{ "count": 142 }
```

### GET /api/issues/latest-update

```json
{ "latestUpdate": "2024-01-15T10:30:00Z" }
```

---

## Auth

### POST /api/auth/login

```json
{ "password": "..." }
```

**Response**: Sets session cookie.

### POST /api/auth/logout

Clears session.

---

## Config

### GET /api/config

Domain mappings for frontend.

```json
{
  "domainMappings": { "FE": "Frontend", "BE": "Backend" }
}
```

---

## Database

### POST /api/db/reset

Reset database. Requires confirmation.

