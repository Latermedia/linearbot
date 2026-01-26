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
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

function getMimeType(url) {
  const pathname = new URL(url).pathname;
  const ext = pathname.substring(pathname.lastIndexOf("."));
  return mimeTypes[ext] || null;
}

// Known static files in the output client directory (from /static folder)
const staticFiles = new Set([
  "favicon.svg",
  "logo_icon_knockout_dark.svg",
  "logo_icon_knockout_light.svg",
]);

/**
 * Adds security headers to a response.
 * HSTS is only added in production to avoid issues in local development.
 */
function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);

  // Always add these headers
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");

  // Only add HSTS in production
  if (process.env.NODE_ENV === "production") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

        const staticResponse = new Response(file, {
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
        return addSecurityHeaders(staticResponse);
      }
    }

    // Handle root-level static files (favicon, etc.)
    const filename = pathname.slice(1); // Remove leading slash
    if (staticFiles.has(filename)) {
      const filePath = `.svelte-kit/output/client/${filename}`;
      const file = Bun.file(filePath);

      if (await file.exists()) {
        const mimeType = getMimeType(url) || "application/octet-stream";

        const staticResponse = new Response(file, {
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": "public, max-age=86400", // 1 day cache for root static files
          },
        });
        return addSecurityHeaders(staticResponse);
      }
    }

    // Let adapter-bun handle everything else
    let response = await server.respond(request);

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

        response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
    }

    // Add security headers to all responses
    return addSecurityHeaders(response);
  },
});

console.log(`Server running on port ${port}`);
