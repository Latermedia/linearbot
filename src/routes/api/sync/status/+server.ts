import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSyncState } from '../state.js';

export const GET: RequestHandler = async () => {
	const syncState = getSyncState();
	return json({
		status: syncState.status,
		isRunning: syncState.isRunning,
		lastSyncTime: syncState.lastSyncTime,
		error: syncState.error,
	});
};

