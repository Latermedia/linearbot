import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Client-side auth state
// This is checked on the client to prevent unauthorized access during SPA navigation
export const isAuthenticated = writable<boolean>(false);

/**
 * Check authentication status on the client
 */
export async function checkAuth(): Promise<boolean> {
	if (!browser) return false;
	
	try {
		// Try to access a protected API endpoint to verify auth
		const response = await fetch('/api/config', {
			method: 'GET',
			credentials: 'include',
		});
		
		const authenticated = response.ok;
		isAuthenticated.set(authenticated);
		return authenticated;
	} catch (error) {
		console.error('Auth check failed:', error);
		isAuthenticated.set(false);
		return false;
	}
}

/**
 * Initialize auth check on mount
 */
export function initAuth() {
	if (browser) {
		checkAuth();
	}
}

