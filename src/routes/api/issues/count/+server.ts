import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTotalIssueCount } from '../../../../db/queries.js';

export const GET: RequestHandler = async () => {
	try {
		const count = getTotalIssueCount();
		return json({ count } satisfies { count: number });
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error('[API] Error fetching issue count:', errorMsg);
		return json({ error: 'Failed to fetch issue count' }, { status: 500 });
	}
};

