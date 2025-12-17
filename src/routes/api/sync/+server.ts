import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { performSync, type SyncOptions } from "../../../services/sync/index.js";
import { getSyncState, setSyncState, updateSyncStats } from "./state.js";
import { updateSyncMetadata, setSyncStatus } from "../../../db/queries.js";
import { validateCsrfTokenFromHeader } from "$lib/csrf.js";
import { verifyAdminPassword } from "$lib/auth.js";

const MIN_SYNC_INTERVAL_MS = 60 * 1000; // 1 minute

export const POST: RequestHandler = async (event) => {
  // Validate CSRF token
  if (!validateCsrfTokenFromHeader(event)) {
    return json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  // Parse request body, handling empty or invalid JSON
  let body: { adminPassword?: string; syncOptions?: SyncOptions } = {};
  try {
    const text = await event.request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch (_error) {
    // If JSON parsing fails, return error
    return json(
      { success: false, error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const { adminPassword, syncOptions } = body;

  // Require admin password
  if (!adminPassword || typeof adminPassword !== "string") {
    return json(
      { success: false, error: "Admin password is required" },
      { status: 400 }
    );
  }

  // Verify admin password
  try {
    if (!verifyAdminPassword(adminPassword)) {
      return json(
        { success: false, error: "Invalid admin password" },
        { status: 401 }
      );
    }
  } catch (error) {
    // Check if it's the ADMIN_PASSWORD not set error
    if (error instanceof Error && error.message.includes("ADMIN_PASSWORD")) {
      return json(
        {
          success: false,
          error: "Server configuration error. Please contact administrator.",
        },
        { status: 500 }
      );
    }
    return json(
      { success: false, error: "Invalid admin password" },
      { status: 401 }
    );
  }
  const syncState = getSyncState();

  // Check if sync is already running
  if (syncState.isRunning) {
    console.log("[SYNC] Request rejected: sync already in progress");
    return json(
      {
        success: false,
        message: "Sync already in progress",
        status: syncState.status,
      },
      { status: 409 }
    );
  }

  // Check rate limiting: only sync if last sync was OVER 1 minute ago
  const now = Date.now();
  if (syncState.lastSyncTime !== null) {
    const timeSinceLastSync = now - syncState.lastSyncTime;
    if (timeSinceLastSync < MIN_SYNC_INTERVAL_MS) {
      const waitTime = Math.ceil(
        (MIN_SYNC_INTERVAL_MS - timeSinceLastSync) / 1000
      );
      const errorMsg = `Rate limit: Please wait ${waitTime} seconds before syncing again`;
      console.log(
        `[SYNC] Request rate limited: last sync ${Math.floor(timeSinceLastSync / 1000)}s ago, wait ${waitTime}s`
      );
      // Store error in sync status
      setSyncStatus("error");
      updateSyncMetadata({
        sync_error: errorMsg,
        sync_progress_percent: null,
      });
      setSyncState({
        status: "error",
        error: errorMsg,
      });
      return json(
        {
          success: false,
          message: errorMsg,
          status: "error",
          lastSyncTime: syncState.lastSyncTime,
        },
        { status: 429 }
      );
    }
  }

  // Start sync (non-blocking)
  const syncStartTime = Date.now();
  console.log("[SYNC] Starting sync...");
  setSyncState({
    isRunning: true,
    status: "syncing",
    error: undefined,
    progressPercent: 0,
    stats: {
      startedIssuesCount: 0,
      totalProjectsCount: 0,
      currentProjectIndex: 0,
      currentProjectName: null,
      projectIssuesCount: 0,
      newCount: 0,
      updatedCount: 0,
    },
  });

  // Parse sync options if provided
  const parsedSyncOptions: SyncOptions | undefined = syncOptions
    ? {
        phases: syncOptions.phases || [],
        isFullSync: syncOptions.isFullSync ?? true,
        deepHistorySync: syncOptions.deepHistorySync ?? false,
        incrementalSync: syncOptions.incrementalSync ?? false,
      }
    : undefined;

  // Log sync options for debugging
  if (parsedSyncOptions) {
    const syncType = parsedSyncOptions.isFullSync
      ? "Full Sync"
      : `Partial Sync (${parsedSyncOptions.phases.length} phases)`;
    const modeLabels: string[] = [];
    if (parsedSyncOptions.incrementalSync) modeLabels.push("Incremental");
    if (parsedSyncOptions.deepHistorySync)
      modeLabels.push("Deep History (1 year)");
    const modeLabel =
      modeLabels.length > 0 ? ` + ${modeLabels.join(" + ")}` : "";
    console.log(
      `[SYNC API] Sync options received: ${syncType}${modeLabel}`,
      parsedSyncOptions.phases
    );
  } else {
    console.log(
      "[SYNC API] No sync options provided, using default (full sync)"
    );
  }

  // Determine includeProjectSync from syncOptions if provided
  // If syncOptions is provided, use it to determine project sync
  // Otherwise default to true for backward compatibility
  const includeProjectSync = parsedSyncOptions
    ? parsedSyncOptions.phases.includes("active_projects")
    : true;

  // Run sync asynchronously
  performSync(
    includeProjectSync,
    {
      onProgressPercent: (percent) => {
        setSyncState({ progressPercent: percent });
      },
      onIssueCountUpdate: (count) => {
        updateSyncStats({ startedIssuesCount: count });
      },
      onProjectCountUpdate: (count) => {
        updateSyncStats({ totalProjectsCount: count });
      },
      onProjectIssueCountUpdate: (count) => {
        updateSyncStats({ projectIssuesCount: count });
      },
      onProjectProgress: (index, total, projectName) => {
        updateSyncStats({
          currentProjectIndex: index,
          totalProjectsCount: total,
          currentProjectName: projectName,
        });
      },
      onIssueCountsUpdate: (newCount, updatedCount) => {
        updateSyncStats({
          newCount,
          updatedCount,
        });
      },
    },
    parsedSyncOptions
  )
    .then((result) => {
      const duration = Date.now() - syncStartTime;
      if (result.success) {
        console.log(
          `[SYNC] Completed successfully in ${duration}ms - New: ${result.newCount}, Updated: ${result.updatedCount}, Total: ${result.totalCount}, Issues: ${result.issueCount}, Projects: ${result.projectCount}`
        );
        setSyncState({
          isRunning: false,
          status: "idle",
          lastSyncTime: Date.now(),
          progressPercent: undefined,
          stats: undefined,
        });
      } else {
        console.error(
          `[SYNC] Failed after ${duration}ms: ${result.error || "Sync failed"}`
        );
        setSyncState({
          isRunning: false,
          status: "error",
          error: result.error || "Sync failed",
          progressPercent: undefined,
          stats: undefined,
        });
      }
    })
    .catch((error) => {
      const duration = Date.now() - syncStartTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[SYNC] Error after ${duration}ms:`, errorMessage);
      setSyncState({
        isRunning: false,
        status: "error",
        error: errorMessage,
        progressPercent: undefined,
        stats: undefined,
      });
    });

  return json({
    success: true,
    message: "Sync started",
    status: "syncing",
  });
};
