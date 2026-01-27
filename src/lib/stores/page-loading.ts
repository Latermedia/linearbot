import { writable, get } from "svelte/store";

/**
 * Store to track page loading state for sidebar icon animation.
 * Pages set their loading state, and the sidebar shows a loading animation
 * on the active route's icon.
 */

interface PageLoadingState {
  path: string | null;
  loading: boolean;
  // Track when loading started to ensure minimum display time
  startedAt: number | null;
}

const MIN_LOADING_DURATION = 600; // ms

function createPageLoadingStore() {
  const { subscribe, set } = writable<PageLoadingState>({
    path: null,
    loading: false,
    startedAt: null,
  });

  return {
    subscribe,

    /**
     * Start loading for a specific path
     */
    startLoading: (path: string) => {
      set({
        path,
        loading: true,
        startedAt: Date.now(),
      });
    },

    /**
     * Stop loading, respecting minimum duration
     */
    stopLoading: async (path: string) => {
      const state = get({ subscribe });

      // Only stop if this is the path that started loading
      if (state.path !== path) return;

      // Ensure minimum loading duration
      if (state.startedAt) {
        const elapsed = Date.now() - state.startedAt;
        if (elapsed < MIN_LOADING_DURATION) {
          await new Promise((resolve) =>
            setTimeout(resolve, MIN_LOADING_DURATION - elapsed)
          );
        }
      }

      set({
        path: null,
        loading: false,
        startedAt: null,
      });
    },

    /**
     * Check if a specific path is currently loading
     */
    isPathLoading: (path: string): boolean => {
      const state = get({ subscribe });
      return state.loading && state.path === path;
    },
  };
}

export const pageLoading = createPageLoadingStore();
