import { redirect, type Handle } from '@sveltejs/kit';
import { verifySession, getSessionCookieName } from '$lib/auth.js';
import { initializeStartup } from './services/startup.js';

// Initialize startup tasks (database, sync scheduler, initial sync)
// This runs once when the module is first imported
initializeStartup();

export const handle: Handle = async ({ event, resolve }) => {
	const { url, cookies } = event;
	const sessionToken = cookies.get(getSessionCookieName());
	const isAuthenticated = verifySession(sessionToken);
	
	// Allow access to login page and login API without authentication
	if (url.pathname === '/login' || url.pathname === '/api/auth/login') {
		// If already authenticated and accessing login page, redirect to home
		if (isAuthenticated && url.pathname === '/login') {
			throw redirect(303, '/');
		}
		return resolve(event);
	}
	
	// Protect all other routes
	if (!isAuthenticated) {
		// For API routes, return 401 instead of redirect
		if (url.pathname.startsWith('/api/')) {
			return new Response(
				JSON.stringify({ error: 'Unauthorized' }),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
		
		// For page routes, redirect to login
		const redirectTo = url.pathname + url.search;
		throw redirect(303, `/login?redirect=${encodeURIComponent(redirectTo)}`);
	}
	
	return resolve(event);
};

