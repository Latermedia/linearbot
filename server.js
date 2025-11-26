import { Server } from "./.svelte-kit/adapter-bun/index.js";
import { manifest } from "./.svelte-kit/adapter-bun/manifest.js";

const server = new Server(manifest);

const port = process.env.PORT || 3000;

await server.init({
  env: process.env,
  read: (file) => Bun.file(file),
});

// Note: Startup initialization happens in src/hooks.server.ts
// which is automatically executed when SvelteKit handles requests

// MIME type mapping for common file types
const mimeTypes = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
};

function getMimeType(url) {
  const pathname = new URL(url).pathname;
  const ext = pathname.substring(pathname.lastIndexOf("."));
  return mimeTypes[ext] || null;
}

Bun.serve({
  port,
  fetch: async (request) => {
    const response = await server.respond(request);

    // Fix MIME type for JavaScript files
    const url = request.url;
    const mimeType = getMimeType(url);

    if (
      mimeType &&
      response.headers.get("Content-Type") === "application/octet-stream"
    ) {
      // Clone response and set correct Content-Type
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Content-Type", mimeType);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return response;
  },
});

console.log(`Server running on port ${port}`);
