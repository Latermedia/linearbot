import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIssuesByProject } from '../../../../../db/queries.js';
import type { Issue } from '../../../../../db/schema.js';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { projectId } = params;
		if (!projectId) {
			return json({ error: 'Project ID is required' }, { status: 400 });
		}

		const issues = getIssuesByProject(projectId);
		return json({ issues } satisfies { issues: Issue[] });
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error('[API] Error fetching issues for project:', errorMsg);
		return json({ error: 'Failed to fetch project issues' }, { status: 500 });
	}
};

