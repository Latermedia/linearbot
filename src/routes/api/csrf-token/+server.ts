import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getSessionCookieName,
  verifySession,
  getCsrfToken,
} from "$lib/auth.js";

/**
 * GET /api/csrf-token
 * Returns the CSRF token for the current session
 */
export const GET: RequestHandler = async ({ cookies }) => {
  const sessionToken = cookies.get(getSessionCookieName());

  if (!sessionToken || !verifySession(sessionToken)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const csrfToken = getCsrfToken(sessionToken);

  if (!csrfToken) {
    return json({ error: "Failed to get CSRF token" }, { status: 500 });
  }

  return json({ csrfToken });
};
