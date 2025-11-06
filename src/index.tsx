#!/usr/bin/env bun

import React from "react";
import { render } from "ink";
import { App } from "./components/App.js";

// Enable fullscreen mode (alternate screen buffer)
process.stdout.write('\x1b[?1049h'); // Switch to alternate screen
process.stdout.write('\x1b[2J');     // Clear screen
process.stdout.write('\x1b[H');      // Move cursor to home

// Render the Ink app
const { unmount, waitUntilExit } = render(<App />);

// Restore normal screen on exit
const cleanup = () => {
  unmount();
  process.stdout.write('\x1b[?1049l'); // Restore normal screen
  process.exit(0);
};

// Handle various exit signals
process.on('SIGINT', cleanup);  // Ctrl+C
process.on('SIGTERM', cleanup); // Kill command
process.on('exit', () => {
  process.stdout.write('\x1b[?1049l'); // Ensure screen is restored
});

// Wait for the app to exit naturally
waitUntilExit().then(() => {
  process.stdout.write('\x1b[?1049l');
}).catch((error) => {
  process.stdout.write('\x1b[?1049l');
  console.error(error);
  process.exit(1);
});
