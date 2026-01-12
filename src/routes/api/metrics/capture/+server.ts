import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  captureMetricsSnapshots,
  captureOrgSnapshot,
  getMetricsSummary,
} from "../../../../services/metrics/index.js";
import { validateCsrfToken } from "../../../../lib/csrf.js";

export interface CaptureResponse {
  success: boolean;
  snapshotsCreated?: number;
  summary?: string;
  details?: {
    org: boolean;
    domains: string[];
    teams: string[];
  };
  error?: string;
}

/**
 * POST /api/metrics/capture
 *
 * Manually trigger a metrics snapshot capture.
 * Requires CSRF token for security.
 */
export const POST: RequestHandler = async (event) => {
  try {
    // Validate CSRF token
    if (!validateCsrfToken(event)) {
      return json(
        {
          success: false,
          error: "Invalid or missing CSRF token",
        } satisfies CaptureResponse,
        { status: 403 }
      );
    }

    console.log("[API] Manual metrics capture requested");

    // Capture all metrics snapshots
    const result = await captureMetricsSnapshots();

    if (!result.success) {
      return json(
        {
          success: false,
          error: result.error || "Failed to capture metrics",
        } satisfies CaptureResponse,
        { status: 500 }
      );
    }

    // Get org-level summary for response
    let summary: string | undefined;
    const orgSnapshot = await captureOrgSnapshot();
    if (orgSnapshot) {
      summary = getMetricsSummary(orgSnapshot);
    }

    return json({
      success: true,
      snapshotsCreated: result.snapshotsCreated,
      summary,
      details: result.details,
    } satisfies CaptureResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Error capturing metrics:", message);

    return json(
      {
        success: false,
        error: message,
      } satisfies CaptureResponse,
      { status: 500 }
    );
  }
};
