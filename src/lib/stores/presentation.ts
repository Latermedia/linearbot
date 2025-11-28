import { writable } from "svelte/store";

/**
 * Store to track presentation mode (hides navigation when navigating via keyboard shortcut)
 */
export const presentationMode = writable<boolean>(false);
