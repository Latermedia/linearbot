import { Server } from './.svelte-kit/adapter-bun/index.js';
import { manifest } from './.svelte-kit/adapter-bun/manifest.js';

const server = new Server(manifest);

const port = process.env.PORT || 3000;

await server.init({
	env: process.env,
	read: (file) => Bun.file(file)
});

// Note: Startup initialization happens in src/hooks.server.ts
// which is automatically executed when SvelteKit handles requests

Bun.serve({
	port,
	fetch: (request) => server.respond(request)
});

console.log(`Server running on port ${port}`);

