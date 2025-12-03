#!/usr/bin/env bun

/**
 * Build script that fails if vite-plugin-svelte warnings are detected.
 */

import { spawn } from "bun";

const buildProcess = spawn(["bun", "--bun", "vite", "build"], {
  stdout: "pipe",
  stderr: "pipe",
});

let stdout = "";
let stderr = "";

for await (const chunk of buildProcess.stdout) {
  stdout += new TextDecoder().decode(chunk);
  process.stdout.write(chunk);
}

for await (const chunk of buildProcess.stderr) {
  stderr += new TextDecoder().decode(chunk);
  process.stderr.write(chunk);
}

const exitCode = await buildProcess.exited;
const output = stdout + stderr;

// Check for vite-plugin-svelte warnings (accessibility warnings)
const warningPatterns = [
  /\[vite-plugin-svelte\][^\n]*(?:warning|a11y_)/i,
  /\[vite-plugin-svelte\][^\n]*A form label must be associated/i,
  /\[vite-plugin-svelte\][^\n]*noninteractive element cannot have nonnegative tabIndex/i,
];

const hasWarnings = warningPatterns.some((pattern) => pattern.test(output));

if (hasWarnings) {
  console.error(
    "\n❌ Build warnings detected. Please fix them before pushing."
  );
  process.exit(1);
}

if (exitCode !== 0) {
  process.exit(exitCode);
}

process.exit(0);
