import {
  redirect,
  type Handle,
  type HandleServerError,
  isHttpError,
} from "@sveltejs/kit";
import { verifySession, getSessionCookieName } from "$lib/auth.js";
import { initializeStartup } from "./services/startup.js";

// Initialize startup tasks (database, sync scheduler, initial sync)
// This runs once when the module is first imported
initializeStartup();

/**
 * Checks if an error should be re-thrown (not caught by our error handler).
 * SvelteKit redirects and HTTP errors should be allowed to propagate.
 */
function shouldRethrowError(error: unknown): boolean {
  // SvelteKit redirects are special errors that should propagate
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as any).status;
    // Redirects have status codes 300-399
    if (status >= 300 && status < 400) {
      return true;
    }
  }
  // HttpError instances should propagate (they're intentional)
  if (isHttpError(error as any)) {
    return true;
  }
  return false;
}

/**
 * Logs detailed error information server-side for debugging.
 * This is called for all errors, including those caught by handleError.
 */
function logError(error: unknown, context: string, event?: any) {
  const errorDetails = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    name: error instanceof Error ? error.name : typeof error,
    context,
    timestamp: new Date().toISOString(),
    url: event?.url?.pathname,
    method: event?.request?.method,
  };

  console.error(`[Server Error] ${context}:`, {
    ...errorDetails,
    error: error,
  });
}

export const handle: Handle = async ({ event, resolve }) => {
  const { url, cookies } = event;
  const sessionToken = cookies.get(getSessionCookieName());
  const isAuthenticated = verifySession(sessionToken);

  // Allow access to login page and login API without authentication
  if (url.pathname === "/login" || url.pathname === "/api/auth/login") {
    // If already authenticated and accessing login page, redirect to home
    if (isAuthenticated && url.pathname === "/login") {
      throw redirect(303, "/");
    }
    try {
      return await resolve(event);
    } catch (error) {
      // Don't catch redirects or HTTP errors - let them propagate
      if (shouldRethrowError(error)) {
        throw error;
      }
      // For API routes, catch errors and return generic responses
      if (url.pathname.startsWith("/api/")) {
        logError(error, `[API] ${url.pathname}`, event);
        return new Response(JSON.stringify({ error: "An error occurred" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Re-throw for page routes to let SvelteKit handle them
      throw error;
    }
  }

  // Protect all other routes
  if (!isAuthenticated) {
    // For API routes, return 401 instead of redirect
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // For page routes, redirect to login
    throw redirect(303, "/login");
  }

  try {
    return await resolve(event);
  } catch (error) {
    // Don't catch redirects or HTTP errors - let them propagate
    if (shouldRethrowError(error)) {
      throw error;
    }
    // For API routes, catch errors and return generic responses
    if (url.pathname.startsWith("/api/")) {
      logError(error, `[API] ${url.pathname}`, event);
      return new Response(JSON.stringify({ error: "An error occurred" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Re-throw for page routes to let SvelteKit handle them
    throw error;
  }
};

/**
 * Global error handler for SvelteKit.
 * This catches errors that escape the handle function.
 * For API routes, we return generic JSON responses.
 */
export const handleError: HandleServerError = ({
  error,
  event,
  status,
  message,
}) => {
  const isApiRoute = event.url.pathname.startsWith("/api/");

  // Log detailed error server-side
  logError(error, `[HandleError] ${event.url.pathname}`, event);

  // For API routes, return generic JSON error response
  if (isApiRoute) {
    return {
      message: "An error occurred",
      status: status || 500,
    };
  }

  // For page routes, return the original message (SvelteKit will handle rendering)
  return {
    message: message || "An error occurred",
    status: status || 500,
  };
};
