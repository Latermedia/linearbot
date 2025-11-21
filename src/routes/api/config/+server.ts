import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Dynamic import to avoid issues with process.env during build
	const { getDomainMappings } = await import('../../../utils/domain-mapping.js');
	
	return json({
		teamDomainMappings: getDomainMappings()
	});
};

