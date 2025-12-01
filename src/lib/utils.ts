import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SvelteComponent } from "svelte";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type WithElementRef<T> = T & {
  ref?: SvelteComponent | HTMLElement | null;
};

/**
 * UUID v4 validation regex pattern
 * Matches: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where x is any hexadecimal digit and y is one of 8, 9, A, or B
 */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Team key validation regex pattern
 * Matches: uppercase alphanumeric characters and dashes, 2-20 characters
 */
const TEAM_KEY_REGEX = /^[A-Z0-9-]{2,20}$/;

/**
 * Maximum number of team keys allowed in a single request
 */
const MAX_TEAM_KEYS = 50;

/**
 * Validates a project ID parameter
 * Linear uses UUID v4 format for project IDs
 *
 * @param projectId - The project ID to validate
 * @returns Object with `valid` boolean and optional `error` message
 */
export function validateProjectId(projectId: string | undefined | null): {
  valid: boolean;
  error?: string;
} {
  if (!projectId) {
    return { valid: false, error: "Project ID is required" };
  }

  // Length validation: UUIDs are exactly 36 characters (32 hex + 4 hyphens)
  if (projectId.length > 36) {
    return { valid: false, error: "Project ID is too long" };
  }

  if (projectId.length < 36) {
    return { valid: false, error: "Project ID is too short" };
  }

  // Format validation: Must match UUID v4 pattern
  if (!UUID_V4_REGEX.test(projectId)) {
    return { valid: false, error: "Invalid project ID format" };
  }

  return { valid: true };
}

/**
 * Validates team keys from a comma-separated string parameter
 * Linear team keys are uppercase alphanumeric strings (optionally with dashes)
 *
 * @param teamsParam - Comma-separated string of team keys
 * @returns Object with `valid` boolean, optional `teamKeys` array, and optional `error` message
 */
export function validateTeamKeys(teamsParam: string | null | undefined): {
  valid: boolean;
  teamKeys?: string[];
  error?: string;
} {
  if (!teamsParam) {
    return { valid: false, error: "teams parameter is required" };
  }

  // Split, trim, filter empty values, and normalize to uppercase
  const teamKeys = teamsParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (teamKeys.length === 0) {
    return { valid: false, error: "At least one team key is required" };
  }

  // Limit total number of team keys to prevent DoS
  if (teamKeys.length > MAX_TEAM_KEYS) {
    return {
      valid: false,
      error: `Too many team keys. Maximum ${MAX_TEAM_KEYS} team keys allowed`,
    };
  }

  // Validate each team key format
  for (const teamKey of teamKeys) {
    if (!TEAM_KEY_REGEX.test(teamKey)) {
      return {
        valid: false,
        error: `Invalid team key format: "${teamKey}". Team keys must be 2-20 characters and contain only uppercase letters, numbers, and dashes`,
      };
    }
  }

  return { valid: true, teamKeys };
}
