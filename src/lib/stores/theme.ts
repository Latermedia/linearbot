import { writable, get } from "svelte/store";
import { browser } from "$app/environment";

type Theme = "light" | "dark";

const STORAGE_KEY = "linear-bot-theme";

function createThemeStore() {
  // Initialize with stored value or default to dark
  // Don't manipulate DOM here - app.html script handles initial state
  // and reactive statement in layout handles updates
  let initialTheme: Theme = "dark";
  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme;
    const hasDarkClass = document.documentElement.classList.contains("dark");
    // Prefer stored value, otherwise sync with DOM (set by app.html)
    if (stored) {
      initialTheme = stored;
    } else {
      // No stored value, use what app.html set
      initialTheme = hasDarkClass ? "dark" : "light";
    }
  }

  const { subscribe, set, update } = writable<Theme>(initialTheme);

  return {
    subscribe,
    toggle: () => {
      const current = get({ subscribe });
      const newTheme = current === "dark" ? "light" : "dark";
      if (browser) {
        localStorage.setItem(STORAGE_KEY, newTheme);
        // DOM manipulation handled by reactive statement in +layout.svelte
      }
      set(newTheme);
    },
    set: (theme: Theme) => {
      if (browser) {
        localStorage.setItem(STORAGE_KEY, theme);
        // DOM manipulation handled by reactive statement in +layout.svelte
      }
      set(theme);
    },
    initialize: () => {
      // Sync store with current DOM state (set by app.html script)
      // Reactive statement in +layout.svelte will handle DOM updates
      if (browser) {
        const stored = localStorage.getItem(STORAGE_KEY) as Theme;
        const hasDarkClass =
          document.documentElement.classList.contains("dark");

        // If we have a stored value, use it
        if (stored) {
          set(stored);
        } else {
          // No stored value, sync store with DOM state from app.html
          const currentTheme = hasDarkClass ? "dark" : "light";
          set(currentTheme);
        }
      }
    },
  };
}

export const theme = createThemeStore();
