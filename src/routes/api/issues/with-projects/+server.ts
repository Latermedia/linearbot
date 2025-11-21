import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIssuesWithProjects } from '../../../../db/queries.js';
import type { Issue } from '../../../../db/schema.js';

export const GET: RequestHandler = async () => {
	try {
		const issues = getIssuesWithProjects();
		return json({ issues } satisfies { issues: Issue[] });
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error('[API] Error fetching issues with projects:', errorMsg);
		return json({ error: 'Failed to fetch issues with projects' }, { status: 500 });
	}
};

