import { randomBytes } from "node:crypto";

const SESSION_COOKIE_NAME = "linear-bot-session";
const SESSION_TOKEN_LENGTH = 32;
const CSRF_TOKEN_LENGTH = 32;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory session store (simple implementation for testing phase)
// In production, consider using Redis or database
const activeSessions = new Map<string, number>(); // token -> expiration timestamp
const sessionCsrfTokens = new Map<string, string>(); // sessionToken -> csrfToken

/**
 * Get the expected password from environment variable
 */
export function getExpectedPassword(): string {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    console.error("[AUTH] APP_PASSWORD environment variable is not set");
    throw new Error("APP_PASSWORD environment variable is not set");
  }
  return password;
}

/**
 * Verify password using constant-time comparison to prevent timing attacks
 */
export function verifyPassword(inputPassword: string): boolean {
  try {
    const expectedPassword = getExpectedPassword();

    // Constant-time comparison
    if (inputPassword.length !== expectedPassword.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < inputPassword.length; i++) {
      result |= inputPassword.charCodeAt(i) ^ expectedPassword.charCodeAt(i);
    }

    return result === 0;
  } catch (error) {
    console.error("[AUTH] Error in verifyPassword", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Generate a secure random session token
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_LENGTH).toString("hex");
}

/**
 * Generate a secure random CSRF token
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Create a new session and return the token
 */
export function createSession(): string {
  try {
    const token = generateSessionToken();
    const csrfToken = generateCsrfToken();
    const expiration = Date.now() + SESSION_DURATION_MS;

    activeSessions.set(token, expiration);
    sessionCsrfTokens.set(token, csrfToken);

    // Clean up expired sessions periodically
    cleanupExpiredSessions();

    return token;
  } catch (error) {
    console.error("[AUTH] Error creating session", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Verify if a session token is valid
 */
export function verifySession(token: string | undefined): boolean {
  if (!token) {
    return false;
  }

  const expiration = activeSessions.get(token);
  if (!expiration) {
    return false;
  }

  // Check if session has expired
  if (Date.now() > expiration) {
    activeSessions.delete(token);
    sessionCsrfTokens.delete(token);
    return false;
  }

  return true;
}

/**
 * Get CSRF token for a session
 */
export function getCsrfToken(sessionToken: string | undefined): string | null {
  if (!sessionToken) {
    return null;
  }

  // Verify session is still valid
  if (!verifySession(sessionToken)) {
    return null;
  }

  return sessionCsrfTokens.get(sessionToken) || null;
}

/**
 * Verify CSRF token for a session
 */
export function verifyCsrfToken(
  sessionToken: string | undefined,
  csrfToken: string | undefined
): boolean {
  if (!sessionToken || !csrfToken) {
    return false;
  }

  // Verify session is still valid
  if (!verifySession(sessionToken)) {
    return false;
  }

  const expectedCsrfToken = sessionCsrfTokens.get(sessionToken);
  if (!expectedCsrfToken) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (csrfToken.length !== expectedCsrfToken.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < csrfToken.length; i++) {
    result |= csrfToken.charCodeAt(i) ^ expectedCsrfToken.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Delete a session token
 */
export function deleteSession(token: string): void {
  activeSessions.delete(token);
  sessionCsrfTokens.delete(token);
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, expiration] of activeSessions.entries()) {
    if (now > expiration) {
      activeSessions.delete(token);
      sessionCsrfTokens.delete(token);
    }
  }
}

/**
 * Get session cookie name
 */
export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

/**
 * Get session duration in milliseconds
 */
export function getSessionDuration(): number {
  return SESSION_DURATION_MS;
}

/**
 * Get the expected admin password from environment variable
 */
export function getExpectedAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD environment variable is not set");
  }
  return password;
}

/**
 * Verify admin password using constant-time comparison to prevent timing attacks
 */
export function verifyAdminPassword(inputPassword: string): boolean {
  const expectedPassword = getExpectedAdminPassword();

  // Constant-time comparison
  if (inputPassword.length !== expectedPassword.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < inputPassword.length; i++) {
    result |= inputPassword.charCodeAt(i) ^ expectedPassword.charCodeAt(i);
  }

  return result === 0;
}
