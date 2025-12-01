import { browser } from "$app/environment";

let csrfTokenCache: string | null = null;

/**
 * Get CSRF token from server
 * Caches the token to avoid repeated requests
 */
export async function getCsrfToken(): Promise<string | null> {
  if (!browser) {
    return null;
  }

  // Return cached token if available
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  try {
    const response = await fetch("/api/csrf-token", {
      credentials: "include",
    });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    csrfTokenCache = data.csrfToken || null;
    return csrfTokenCache;
  } catch (error) {
    console.error("Failed to get CSRF token:", error);
    return null;
  }
}

/**
 * Clear CSRF token cache (e.g., after logout)
 */
export function clearCsrfToken(): void {
  csrfTokenCache = null;
}

/**
 * Make a CSRF-protected POST request
 */
export async function csrfPost(
  url: string,
  body?: any,
  options?: RequestInit
): Promise<Response> {
  const csrfToken = await getCsrfToken();

  if (!csrfToken) {
    throw new Error("Failed to get CSRF token");
  }

  const headers = new Headers(options?.headers);
  headers.set("X-CSRF-Token", csrfToken);

  if (body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...options,
    method: "POST",
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
}
