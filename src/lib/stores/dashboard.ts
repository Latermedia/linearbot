import { writable, get } from "svelte/store";
import { browser } from "$app/environment";

const EXECUTIVE_STORAGE_KEY = "linear-bot-executive-focus";

/**
 * Store for executive focus filter.
 * When enabled, filters to show only items with "Executive Visibility" label.
 * Persists to localStorage for session continuity.
 */
function createExecutiveFocusStore() {
  // Initialize with stored value or default to false
  let initialEnabled = false;
  if (browser) {
    const stored = localStorage.getItem(EXECUTIVE_STORAGE_KEY);
    if (stored === "true") {
      initialEnabled = true;
    }
  }

  const { subscribe, set, update } = writable<boolean>(initialEnabled);

  return {
    subscribe,
    set: (enabled: boolean) => {
      if (browser) {
        localStorage.setItem(EXECUTIVE_STORAGE_KEY, String(enabled));
      }
      set(enabled);
    },
    toggle: () => {
      update((current) => {
        const newValue = !current;
        if (browser) {
          localStorage.setItem(EXECUTIVE_STORAGE_KEY, String(newValue));
        }
        return newValue;
      });
    },
    enable: () => {
      if (browser) {
        localStorage.setItem(EXECUTIVE_STORAGE_KEY, "true");
      }
      set(true);
    },
    disable: () => {
      if (browser) {
        localStorage.setItem(EXECUTIVE_STORAGE_KEY, "false");
      }
      set(false);
    },
    get: () => get({ subscribe }),
  };
}

export const executiveFocus = createExecutiveFocusStore();
