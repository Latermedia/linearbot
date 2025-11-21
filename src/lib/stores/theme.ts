import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'linear-bot-theme';

function createThemeStore() {
	// Initialize with stored value or default to dark
	const initialTheme: Theme = browser 
		? (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark'
		: 'dark';

	const { subscribe, set, update } = writable<Theme>(initialTheme);

	return {
		subscribe,
		toggle: () => {
			update((current) => {
				const newTheme = current === 'dark' ? 'light' : 'dark';
				if (browser) {
					localStorage.setItem(STORAGE_KEY, newTheme);
					// Update the HTML class
					document.documentElement.classList.remove('light', 'dark');
					document.documentElement.classList.add(newTheme);
				}
				return newTheme;
			});
		},
		set: (theme: Theme) => {
			if (browser) {
				localStorage.setItem(STORAGE_KEY, theme);
				document.documentElement.classList.remove('light', 'dark');
				document.documentElement.classList.add(theme);
			}
			set(theme);
		},
		initialize: () => {
			if (browser) {
				const stored = localStorage.getItem(STORAGE_KEY) as Theme;
				const theme = stored || 'dark';
				document.documentElement.classList.remove('light', 'dark');
				document.documentElement.classList.add(theme);
				set(theme);
			}
		}
	};
}

export const theme = createThemeStore();

