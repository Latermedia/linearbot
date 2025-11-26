import { Server } from "./.svelte-kit/adapter-bun/index.js";
import { manifest } from "./.svelte-kit/adapter-bun/manifest.js";

const server = new Server(manifest);

const port = process.env.PORT || 3000;

await server.init({
  env: process.env,
  read: (file) => {
    // The adapter-bun read function receives paths that need to be resolved
    // Client assets are in .svelte-kit/output/client/
    // Server files are in .svelte-kit/adapter-bun/
    let resolvedPath = file;

    // If it's a client asset (_app/), it should be in output/client/
    if (file.startsWith("_app/") || file.startsWith("/_app/")) {
      const cleanPath = file.startsWith("/") ? file.slice(1) : file;
      resolvedPath = `.svelte-kit/output/client/${cleanPath}`;
    }

    return Bun.file(resolvedPath);
  },
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
    const url = request.url;
    const pathname = new URL(url).pathname;

    // Handle static assets directly before adapter-bun
    if (pathname.startsWith("/_app/")) {
      // Resolve the file path
      const cleanPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
      const filePath = `.svelte-kit/output/client/${cleanPath}`;
      const file = Bun.file(filePath);

      // Check if file exists
      if (await file.exists()) {
        const mimeType = getMimeType(url) || "application/octet-stream";

        return new Response(file, {
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    // Let adapter-bun handle everything else
    const response = await server.respond(request);

    // Fix MIME type for any remaining static assets that adapter-bun serves
    const mimeType = getMimeType(url);
    if (mimeType && pathname.startsWith("/_app/")) {
      const currentContentType = response.headers.get("Content-Type");
      const needsFix =
        !currentContentType ||
        currentContentType === "application/octet-stream" ||
        (pathname.endsWith(".js") &&
          currentContentType !== "application/javascript") ||
        (pathname.endsWith(".mjs") &&
          currentContentType !== "application/javascript");

      if (needsFix) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Content-Type", mimeType);

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
    }

    return response;
  },
});

console.log(`Server running on port ${port}`);
