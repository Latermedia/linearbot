import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  verifyPassword,
  createSession,
  getSessionCookieName,
  getSessionDuration,
} from "$lib/auth.js";
import {
  getClientIP,
  checkRateLimit,
  logFailedLoginAttempt,
} from "$lib/rate-limit.js";

export const POST: RequestHandler = async ({
  request,
  cookies,
  getClientAddress,
}) => {
  try {
    // Get client IP for rate limiting
    const clientIP = getClientIP(request, { getClientAddress });

    // Check rate limit before processing (check with isFailedAttempt=false to see current status)
    const rateLimitCheck = checkRateLimit(clientIP, false);
    if (rateLimitCheck.blocked) {
      logFailedLoginAttempt(clientIP, rateLimitCheck.attempts);
      return json(
        {
          error: "Too many login attempts. Please try again later.",
          retryAfter: rateLimitCheck.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitCheck.retryAfter.toString(),
          },
        }
      );
    }

    const { password } = await request.json();

    if (!password || typeof password !== "string") {
      return json({ error: "Password is required" }, { status: 400 });
    }

    // Verify password
    const isValidPassword = verifyPassword(password);
    if (!isValidPassword) {
      // Record failed attempt and check if this causes a block
      const failedCheck = checkRateLimit(clientIP, true);
      logFailedLoginAttempt(clientIP, failedCheck.attempts);

      // Check if this failure caused a block
      if (failedCheck.blocked) {
        return json(
          {
            error:
              "Invalid password. Too many failed attempts. Please try again later.",
            retryAfter: failedCheck.retryAfter,
          },
          {
            status: 429,
            headers: {
              "Retry-After": failedCheck.retryAfter.toString(),
            },
          }
        );
      }

      return json({ error: "Invalid password" }, { status: 401 });
    }

    // Successful login - reset rate limit counter (pass false to reset without incrementing)
    checkRateLimit(clientIP, false);

    // Create session
    const sessionToken = createSession();

    // Set secure HTTP-only cookie
    // Detect HTTPS reliably across different deployment platforms (Fly.io, Vercel, etc.)
    // Check request URL and X-Forwarded-Proto header for HTTPS detection
    const url = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isSecure =
      url.protocol === "https:" ||
      forwardedProto === "https" ||
      process.env.NODE_ENV === "production";

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
