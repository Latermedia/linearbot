import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getSessionCookieName, deleteSession } from "$lib/auth.js";
import { validateCsrfTokenFromHeader } from "$lib/csrf.js";

export const POST: RequestHandler = async (event) => {
  // Validate CSRF token
  if (!validateCsrfTokenFromHeader(event)) {
    return json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const { cookies } = event;
  const sessionToken = cookies.get(getSessionCookieName());

  if (sessionToken) {
    deleteSession(sessionToken);
  }

  // Clear the cookie
  cookies.delete(getSessionCookieName(), { path: "/" });

  return json({ success: true });
};
