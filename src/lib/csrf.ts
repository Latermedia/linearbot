import { getSessionCookieName, verifyCsrfToken } from "./auth.js";
import type { RequestEvent } from "@sveltejs/kit";

/**
 * Validate CSRF token from request header
 * Returns true if valid, false otherwise
 */
export function validateCsrfTokenFromHeader(event: RequestEvent): boolean {
  // Check if CSRF protection is disabled
  const csrfEnabled = process.env.DISABLE_CSRF !== "true";
  if (!csrfEnabled) {
    return true;
  }

  const { request, cookies } = event;
  const sessionToken = cookies.get(getSessionCookieName());
  const csrfToken = request.headers.get("X-CSRF-Token") || undefined;

  return verifyCsrfToken(sessionToken, csrfToken);
}

/**
 * Validate CSRF token from request body (for JSON requests)
 * Use this after parsing the request body
 */
export function validateCsrfTokenFromBody(
  event: RequestEvent,
  body: { csrfToken?: string }
): boolean {
  // Check if CSRF protection is disabled
  const csrfEnabled = process.env.DISABLE_CSRF !== "true";
  if (!csrfEnabled) {
    return true;
  }

  const { cookies } = event;
  const sessionToken = cookies.get(getSessionCookieName());
  const csrfToken = body.csrfToken;

  return verifyCsrfToken(sessionToken, csrfToken);
}

/**
 * Validate CSRF token from header or body
 * Checks header first, then body if header is not present
 * Note: This function does NOT consume the request body
 */
export function validateCsrfToken(
  event: RequestEvent,
  body?: { csrfToken?: string }
): boolean {
  // Check if CSRF protection is disabled
  const csrfEnabled = process.env.DISABLE_CSRF !== "true";
  if (!csrfEnabled) {
    return true;
  }

  // Check header first (preferred method)
  const headerValid = validateCsrfTokenFromHeader(event);
  if (headerValid) {
    return true;
  }

  // If header not present and body provided, check body
  if (body?.csrfToken) {
    return validateCsrfTokenFromBody(event, body);
  }

  return false;
}
