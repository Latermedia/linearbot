import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  verifyPassword,
  createSession,
  getSessionCookieName,
  getSessionDuration,
} from "$lib/auth.js";

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const { password } = await request.json();

    if (!password || typeof password !== "string") {
      return json({ error: "Password is required" }, { status: 400 });
    }

    // Verify password
    if (!verifyPassword(password)) {
      return json({ error: "Invalid password" }, { status: 401 });
    }

    // Create session
    const sessionToken = createSession();

    // Set secure HTTP-only cookie
    // On Vercel, use secure cookies for HTTPS (production/preview)
    // Use sameSite: "strict" for better CSRF protection
    const isSecure =
      process.env.VERCEL_ENV === "production" ||
      process.env.VERCEL_ENV === "preview";
    cookies.set(getSessionCookieName(), sessionToken, {
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "strict",
      maxAge: Math.floor(getSessionDuration() / 1000), // Convert to seconds
    });

    return json({ success: true });
  } catch (error) {
    // Check if it's the APP_PASSWORD not set error
    if (error instanceof Error && error.message.includes("APP_PASSWORD")) {
      return json(
        { error: "Server configuration error. Please contact administrator." },
        { status: 500 }
      );
    }
    return json({ error: "An error occurred during login" }, { status: 500 });
  }
};
