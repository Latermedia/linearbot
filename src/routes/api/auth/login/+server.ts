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
  // Don't destructure getClientAddress - Bun adapter throws if accessed
}) => {
  try {
    // Get client IP for rate limiting
    // Bun adapter doesn't provide getClientAddress, so we rely on headers
    const clientIP = getClientIP(request);

    // Check if rate limiting is disabled
    const rateLimitEnabled = process.env.DISABLE_RATE_LIMIT !== "true";

    // Check rate limit before processing (check with isFailedAttempt=false to see current status)
    if (rateLimitEnabled) {
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
    }

    let requestBody;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      console.error("[AUTH] Failed to parse request body", {
        error:
          parseError instanceof Error ? parseError.message : String(parseError),
      });
      return json({ error: "Invalid request body" }, { status: 400 });
    }

    const { password } = requestBody;

    if (!password || typeof password !== "string") {
      return json({ error: "Password is required" }, { status: 400 });
    }

    // Verify password
    let isValidPassword: boolean;
    try {
      isValidPassword = verifyPassword(password);
    } catch (verifyError) {
      console.error("[AUTH] Error during password verification", {
        error:
          verifyError instanceof Error
            ? verifyError.message
            : String(verifyError),
        stack: verifyError instanceof Error ? verifyError.stack : undefined,
      });
      throw verifyError;
    }

    if (!isValidPassword) {
      // Record failed attempt and check if this causes a block
      if (rateLimitEnabled) {
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
      }

      return json({ error: "Invalid password" }, { status: 401 });
    }

    // Successful login - reset rate limit counter (pass false to reset without incrementing)
    if (rateLimitEnabled) {
      checkRateLimit(clientIP, false);
    }

    // Create session
    let sessionToken: string;
    try {
      sessionToken = createSession();
    } catch (sessionError) {
      console.error("[AUTH] Error creating session", {
        error:
          sessionError instanceof Error
            ? sessionError.message
            : String(sessionError),
        stack: sessionError instanceof Error ? sessionError.stack : undefined,
      });
      throw sessionError;
    }

    // Set secure HTTP-only cookie
    // Detect HTTPS reliably across different deployment platforms (Fly.io, Vercel, etc.)
    // Check request URL and X-Forwarded-Proto header for HTTPS detection
    const url = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isSecure =
      url.protocol === "https:" ||
      forwardedProto === "https" ||
      process.env.NODE_ENV === "production";

    try {
      cookies.set(getSessionCookieName(), sessionToken, {
        path: "/",
        httpOnly: true,
        secure: isSecure,
        sameSite: "strict",
        maxAge: Math.floor(getSessionDuration() / 1000), // Convert to seconds
      });
    } catch (cookieError) {
      console.error("[AUTH] Error setting session cookie", {
        error:
          cookieError instanceof Error
            ? cookieError.message
            : String(cookieError),
        stack: cookieError instanceof Error ? cookieError.stack : undefined,
      });
      throw cookieError;
    }

    return json({ success: true });
  } catch (error) {
    console.error("[AUTH] Login error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : typeof error,
      timestamp: new Date().toISOString(),
    });

    // Check if it's the APP_PASSWORD not set error
    if (error instanceof Error && error.message.includes("APP_PASSWORD")) {
      console.error("[AUTH] APP_PASSWORD environment variable not set");
      return json(
        { error: "Server configuration error. Please contact administrator." },
        { status: 500 }
      );
    }
    return json({ error: "An error occurred during login" }, { status: 500 });
  }
};
