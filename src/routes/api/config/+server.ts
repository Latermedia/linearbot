import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync } from 'fs';
import { join } from 'path';

export const GET: RequestHandler = async () => {
	try {
		// Try to read from config file first
		const configPath = join(process.cwd(), 'team-domain-mappings.json');
		const configFile = readFileSync(configPath, 'utf-8');
		const config = JSON.parse(configFile);
		
		if (config.teamDomainMappings) {
			console.log('[config API] Loaded from file:', Object.keys(config.teamDomainMappings).length, 'teams');
			return json({
				teamDomainMappings: config.teamDomainMappings
			});
		}
	} catch (error) {
		// Fall back to environment variable or empty config
		console.warn('[config API] Could not read config file, trying env var:', error);
	}
	
	// Fallback to environment variable
	const { getDomainMappings } = await import('../../../utils/domain-mapping.js');
	const mappings = getDomainMappings();
	
	return json({
		teamDomainMappings: mappings
	});
};

