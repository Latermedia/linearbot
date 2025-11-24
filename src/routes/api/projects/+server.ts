import { json } from '@sveltejs/kit';
import { getAllProjects } from '../../../db/queries.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const projects = getAllProjects();
		return json({ projects });
	} catch (error) {
		console.error('[GET /api/projects] Error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to fetch projects' },
			{ status: 500 }
		);
	}
};

