import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  resetDatabaseConnection,
  getDatabase,
} from "../../../../db/connection.js";
import { verifyAdminPassword } from "$lib/auth.js";
import { validateCsrfToken } from "$lib/csrf.js";

export const POST: RequestHandler = async (event) => {
  const { request } = event;
  const body = await request.json();
  const { adminPassword } = body;

  // Validate CSRF token
  if (!validateCsrfToken(event, body)) {
    return json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  // Require admin password
  if (!adminPassword || typeof adminPassword !== "string") {
    return json(
      { success: false, error: "Admin password is required" },
      { status: 400 }
    );
  }

  // Verify admin password
  try {
    if (!verifyAdminPassword(adminPassword)) {
      return json(
        { success: false, error: "Invalid admin password" },
        { status: 401 }
      );
    }
  } catch (error) {
    // Check if it's the ADMIN_PASSWORD not set error
    if (error instanceof Error && error.message.includes("ADMIN_PASSWORD")) {
      return json(
        {
          success: false,
          error: "Server configuration error. Please contact administrator.",
        },
        { status: 500 }
      );
    }
    return json(
      { success: false, error: "Invalid admin password" },
      { status: 401 }
    );
  }

  console.log("[API] Resetting database...");
  resetDatabaseConnection();
  // Reinitialize to ensure it's ready
  getDatabase();

  return json({
    success: true,
    message: "Database reset successfully",
  });
};
