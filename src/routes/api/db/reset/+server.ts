import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resetDatabaseConnection, getDatabase } from '../../../../db/connection.js';

export const POST: RequestHandler = async () => {
	try {
		console.log('[API] Resetting database...');
		resetDatabaseConnection();
		// Reinitialize to ensure it's ready
		getDatabase();
		
		return json({
			success: true,
			message: 'Database reset successfully'
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('[API] Failed to reset database:', errorMessage);
		return json(
			{
				success: false,
				error: errorMessage
			},
			{ status: 500 }
		);
	}
};

