import type { Plugin } from 'vite';

/**
 * Vite plugin to replace bun:sqlite imports during build
 * This is only needed for local builds (Node.js) - Vercel runtime uses Bun
 */
export function bunSqliteShim(): Plugin {
	return {
		name: 'bun-sqlite-shim',
		enforce: 'pre',
		resolveId(id) {
			if (id === 'bun:sqlite') {
				return '\0virtual:bun-sqlite';
			}
			return null;
		},
		load(id) {
			if (id === '\0virtual:bun-sqlite') {
				// Minimal shim for build-time only
				// Vercel runtime will use actual Bun SQLite
				return `
					export class Database {
						constructor(path) {
							// Build-time shim - not used at runtime
							throw new Error('Database should not be instantiated during build');
						}
						prepare(sql) {
							return {
								all: () => [],
								get: () => null,
								run: () => ({ changes: 0, lastInsertRowid: 0 })
							};
						}
						run(sql) {
							return { changes: 0, lastInsertRowid: 0 };
						}
						close() {}
					}
				`;
			}
			return null;
		}
	};
}

