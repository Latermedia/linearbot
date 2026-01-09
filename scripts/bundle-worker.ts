#!/usr/bin/env bun

export {};

/**
 * Bundle the sync worker separately for production builds.
 *
 * SvelteKit/Vite doesn't recognize the dynamic Worker import pattern:
 *   new Worker(new URL("./worker.js", import.meta.url))
 *
 * This script uses Bun's bundler to compile worker.ts with all its
 * dependencies and outputs it to build/server/chunks/worker.js where
 * the manager expects to find it.
 */

const result = await Bun.build({
  entrypoints: ["src/services/sync/worker/worker.ts"],
  outdir: "build/server/chunks",
  target: "bun",
  format: "esm",
  naming: "worker.js",
  external: ["bun:sqlite"], // Keep native modules external
});

if (!result.success) {
  console.error("Failed to bundle worker:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(
  "[BUNDLE-WORKER] Successfully bundled worker.js to build/server/chunks/"
);
