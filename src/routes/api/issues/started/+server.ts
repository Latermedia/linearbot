import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStartedIssues } from '../../../../db/queries.js';
import type { Issue } from '../../../../db/schema.js';

export const GET: RequestHandler = async () => {
	try {
		const issues = getStartedIssues();
		return json({ issues } satisfies { issues: Issue[] });
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error('[API] Error fetching started issues:', errorMsg);
		return json({ error: 'Failed to fetch started issues' }, { status: 500 });
	}
};

