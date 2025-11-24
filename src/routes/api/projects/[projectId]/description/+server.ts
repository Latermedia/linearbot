import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLinearClient } from '../../../../../linear/client.js';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { projectId } = params;
		if (!projectId) {
			return json({ error: 'Project ID is required' }, { status: 400 });
		}

		const linearClient = createLinearClient();
		const description = await linearClient.fetchProjectDescription(projectId);
		return json({ description });
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error('[API] Error fetching project description:', errorMsg);
		// Return null instead of error to gracefully handle missing descriptions
		return json({ description: null });
	}
};

