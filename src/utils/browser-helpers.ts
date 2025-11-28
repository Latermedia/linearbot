import { exec } from "child_process";
import type { Issue } from "../db/schema.js";

/**
 * Open a URL in the default browser based on platform
 */
export function openUrl(url: string): void {
  const command =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;

  exec(command);
}

/**
 * Open a Linear issue in the browser
 */
export function openIssue(issue: Issue): void {
  openUrl(issue.url);
}

/**
 * Open a Linear project in the browser
 * Constructs project URL from workspace and project ID
 */
export function openProject(projectId: string, issueUrl: string): void {
  // Extract workspace from issue URL
  const workspaceMatch = issueUrl.match(/https:\/\/linear\.app\/([^/]+)/);
  if (workspaceMatch) {
    const workspace = workspaceMatch[1];
    const projectUrl = `https://linear.app/${workspace}/project/${projectId}`;
    openUrl(projectUrl);
  }
}
