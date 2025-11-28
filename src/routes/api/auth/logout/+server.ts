import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getSessionCookieName, deleteSession } from "$lib/auth.js";

export const POST: RequestHandler = async ({ cookies }) => {
  const sessionToken = cookies.get(getSessionCookieName());

  if (sessionToken) {
    deleteSession(sessionToken);
  }

  // Clear the cookie
  cookies.delete(getSessionCookieName(), { path: "/" });

  return json({ success: true });
};
