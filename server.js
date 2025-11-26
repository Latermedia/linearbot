import { Server } from './.svelte-kit/adapter-bun/index.js';
import { manifest } from './.svelte-kit/adapter-bun/manifest.js';

const server = new Server(manifest);

const port = process.env.PORT || 3000;

await server.init({
	env: process.env,
	read: (file) => Bun.file(file)
});

Bun.serve({
	port,
	fetch: server.respond
});

console.log(`Server running on port ${port}`);

