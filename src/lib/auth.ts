import { randomBytes } from "node:crypto";

const SESSION_COOKIE_NAME = "linear-bot-session";
const SESSION_TOKEN_LENGTH = 32;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory session store (simple implementation for testing phase)
// In production, consider using Redis or database
const activeSessions = new Map<string, number>(); // token -> expiration timestamp

/**
 * Get the expected password from environment variable
 */
export function getExpectedPassword(): string {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    throw new Error("APP_PASSWORD environment variable is not set");
  }
  return password;
}

/**
 * Verify password using constant-time comparison to prevent timing attacks
 */
export function verifyPassword(inputPassword: string): boolean {
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
}

/**
 * Generate a secure random session token
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_LENGTH).toString("hex");
}

/**
 * Create a new session and return the token
 */
export function createSession(): string {
  const token = generateSessionToken();
  const expiration = Date.now() + SESSION_DURATION_MS;
  activeSessions.set(token, expiration);

  // Clean up expired sessions periodically
  cleanupExpiredSessions();

  return token;
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
    return false;
  }

  return true;
}

/**
 * Delete a session token
 */
export function deleteSession(token: string): void {
  activeSessions.delete(token);
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, expiration] of activeSessions.entries()) {
    if (now > expiration) {
      activeSessions.delete(token);
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
