import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import { isAuthenticated } from "./auth";
import { ExponentialBackoff } from "../utils/backoff";

export interface SyncStatusData {
  status: "idle" | "syncing" | "error";
  isRunning: boolean;
  lastSyncTime: number | null;
  error: string | null;
  progressPercent: number | null;
  hasPartialSync: boolean;
  partialSyncProgress: { completed: number; total: number } | null;
  currentPhase: string | null;
  phases: Array<{
    phase: string;
    label: string;
    status: "pending" | "in_progress" | "complete";
  }>;
  stats: {
    startedIssuesCount: number;
    totalProjectsCount: number;
    currentProjectIndex: number;
    currentProjectName: string | null;
    projectIssuesCount: number;
    newCount: number;
    updatedCount: number;
  } | null;
  syncingProjectId: string | null;
  apiQueryCount: number | null;
  statusMessage: string | null;
}

const POLL_INTERVAL_SYNCING = 1000; // Poll every 1 second when syncing
const POLL_INTERVAL_IDLE = 2000; // Poll every 2 seconds when idle

function createSyncStatusStore() {
  const { subscribe, update } = writable<SyncStatusData>({
    status: "idle",
    isRunning: false,
    lastSyncTime: null,
    error: null,
    progressPercent: null,
    hasPartialSync: false,
    partialSyncProgress: null,
    currentPhase: null,
    phases: [],
    stats: null,
    syncingProjectId: null,
    apiQueryCount: null,
    statusMessage: null,
  });

  let pollIntervalId: number | undefined;
  let nextPollTimeoutId: number | undefined;
  const backoff = new ExponentialBackoff();
  let subscriberCount = 0;
  let currentState: SyncStatusData = {
    status: "idle",
    isRunning: false,
    lastSyncTime: null,
    error: null,
    progressPercent: null,
    hasPartialSync: false,
    partialSyncProgress: null,
    currentPhase: null,
    phases: [],
    stats: null,
    syncingProjectId: null,
    apiQueryCount: null,
    statusMessage: null,
  };

  function stopPolling() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = undefined;
    }
    if (nextPollTimeoutId) {
      clearTimeout(nextPollTimeoutId);
      nextPollTimeoutId = undefined;
    }
  }

  function scheduleNextPoll(delay: number) {
    if (nextPollTimeoutId) {
      clearTimeout(nextPollTimeoutId);
    }
    nextPollTimeoutId = setTimeout(() => {
      checkSyncStatus();
    }, delay) as unknown as number;
  }

  async function checkSyncStatus() {
    if (!browser) return;

    // Check authentication before making request
    if (!get(isAuthenticated)) {
      stopPolling();
      return;
    }

    try {
      const response = await fetch("/api/sync/status");

      // Handle 401 Unauthorized - stop polling if not authenticated
      if (response.status === 401) {
        stopPolling();
        isAuthenticated.set(false);
        return;
      }

      if (response.ok) {
        // Success - reset backoff
        const wasInBackoff = backoff.getFailureCount() > 0;
        backoff.recordSuccess();
        const data = await response.json();

        const newStatus = data.status || "idle";
        const newIsRunning = data.isRunning || false;
        const wasSyncing =
          currentState.status === "syncing" || currentState.isRunning;
        const isNowSyncing = newStatus === "syncing" || newIsRunning;

        update((state) => {
          currentState = {
            ...state,
            status: newStatus,
            isRunning: newIsRunning,
            lastSyncTime: data.lastSyncTime || null,
            error: data.error || null,
            progressPercent: data.progressPercent ?? null,
            hasPartialSync: data.hasPartialSync || false,
            partialSyncProgress: data.partialSyncProgress || null,
            currentPhase: data.currentPhase || null,
            phases: data.phases || [],
            stats: data.stats || null,
            syncingProjectId: data.syncingProjectId || null,
            apiQueryCount: data.apiQueryCount || null,
            statusMessage: data.statusMessage || null,
          };
          return currentState;
        });

        // If we were in backoff mode, restart normal polling intervals
        if (wasInBackoff && subscriberCount > 0) {
          startPolling();
        } else if (
          wasSyncing !== isNowSyncing &&
          subscriberCount > 0 &&
          backoff.getFailureCount() === 0
        ) {
          // Adjust polling interval if sync status changed
          adjustPollingInterval();
        }
      } else {
        // Request failed - record failure and use backoff
        const delay = backoff.recordFailure();
        console.debug(
          `[syncStatusStore] Poll failed (${response.status}), retrying in ${delay}ms`
        );
        stopPolling();
        if (subscriberCount > 0) {
          scheduleNextPoll(delay);
        }
      }
    } catch (error) {
      // Network error - record failure and use backoff
      const delay = backoff.recordFailure();
      console.debug(
        "[syncStatusStore] Poll error:",
        error,
        `retrying in ${delay}ms`
      );
      stopPolling();
      if (subscriberCount > 0) {
        scheduleNextPoll(delay);
      }
    }
  }

  function startPolling() {
    if (!browser || subscriberCount === 0) return;

    // Check authentication
    if (!get(isAuthenticated)) return;

    // Stop any existing polling
    stopPolling();

    // Only use intervals if not in backoff mode
    if (backoff.getFailureCount() === 0) {
      // We'll adjust interval dynamically based on state
      // Start with idle interval, will adjust on next check
      pollIntervalId = setInterval(
        checkSyncStatus,
        POLL_INTERVAL_IDLE
      ) as unknown as number;
    } else {
      // Use backoff delay
      scheduleNextPoll(backoff.getDelay());
    }
  }

  function adjustPollingInterval() {
    if (!browser || subscriberCount === 0 || backoff.getFailureCount() > 0)
      return;

    const isSyncing =
      currentState.status === "syncing" || currentState.isRunning;
    const interval = isSyncing ? POLL_INTERVAL_SYNCING : POLL_INTERVAL_IDLE;

    // Only adjust if using intervals (not backoff)
    if (pollIntervalId) {
      stopPolling();
      pollIntervalId = setInterval(
        checkSyncStatus,
        interval
      ) as unknown as number;
    }
  }

  function stopPollingIfNoSubscribers() {
    if (subscriberCount === 0) {
      stopPolling();
    }
  }

  // React to auth state changes
  if (browser) {
    isAuthenticated.subscribe((authenticated) => {
      if (authenticated && subscriberCount > 0) {
        // Auth restored - start polling if we have subscribers
        startPolling();
      } else if (!authenticated) {
        // Auth lost - stop polling
        stopPolling();
      }
    });
  }

  /**
   * Optimistically update the store to show syncing state immediately.
   * Call this when initiating a sync to provide instant UI feedback.
   */
  function setOptimisticSyncing(projectId?: string) {
    update((state) => {
      currentState = {
        ...state,
        status: "syncing",
        isRunning: true,
        error: null,
        progressPercent: 0,
        syncingProjectId: projectId ?? null,
        currentPhase: null,
        hasPartialSync: false,
        partialSyncProgress: null,
        stats: {
          startedIssuesCount: 0,
          totalProjectsCount: 0,
          currentProjectIndex: 0,
          currentProjectName: null,
          projectIssuesCount: 0,
          newCount: 0,
          updatedCount: 0,
        },
        statusMessage: "Starting sync...",
        apiQueryCount: 0,
      };
      return currentState;
    });

    // Switch to faster polling interval immediately
    adjustPollingInterval();
  }

  return {
    subscribe: (run: (value: SyncStatusData) => void) => {
      subscriberCount++;
      const unsubscribe = subscribe(run);

      // Start polling when first subscriber subscribes
      if (subscriberCount === 1) {
        startPolling();
      }

      return () => {
        subscriberCount--;
        unsubscribe();
        // Stop polling when last subscriber unsubscribes
        stopPollingIfNoSubscribers();
      };
    },
    checkSyncStatus, // Expose for manual checks
    startPolling, // Expose for manual start
    stopPolling, // Expose for manual stop
    setOptimisticSyncing, // Expose for optimistic UI updates
  };
}

export const syncStatusStore = createSyncStatusStore();
