/**
 * Utility functions for working with promises
 * (Currently just re-exports from error-handling, but kept separate for future expansion)
 */

export {
  checkForRateLimitError,
  processSettledResults,
  handleRateLimitError,
  type CancellationFlag,
} from "./error-handling.js";
