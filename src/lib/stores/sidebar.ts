import { writable, get } from "svelte/store";
import { browser } from "$app/environment";

const STORAGE_KEY = "linear-bot-sidebar-collapsed";

/**
 * Store for sidebar collapsed state.
 * Persists to localStorage for session continuity.
 */
function createSidebarStore() {
  // Initialize with stored value or default to expanded (false)
  let initialCollapsed = false;
  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      initialCollapsed = true;
    }
  }

  const { subscribe, set, update } = writable<boolean>(initialCollapsed);

  return {
    subscribe,
    set: (collapsed: boolean) => {
      if (browser) {
        localStorage.setItem(STORAGE_KEY, String(collapsed));
      }
      set(collapsed);
    },
    toggle: () => {
      update((current) => {
        const newValue = !current;
        if (browser) {
          localStorage.setItem(STORAGE_KEY, String(newValue));
        }
        return newValue;
      });
    },
    expand: () => {
      if (browser) {
        localStorage.setItem(STORAGE_KEY, "false");
      }
      set(false);
    },
    collapse: () => {
      if (browser) {
        localStorage.setItem(STORAGE_KEY, "true");
      }
      set(true);
    },
    get: () => get({ subscribe }),
  };
}

export const sidebarCollapsed = createSidebarStore();
