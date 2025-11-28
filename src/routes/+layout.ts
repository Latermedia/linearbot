// Disable SSR since we need Bun-specific APIs (bun:sqlite) in our API routes
// This makes the app a SPA (Single Page Application)
export const ssr = false;
export const prerender = false;
