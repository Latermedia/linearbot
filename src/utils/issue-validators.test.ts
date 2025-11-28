import { describe, it, expect } from "vitest";
import { hasMissingEstimate, hasMissingPriority } from "./issue-validators";
import type { Issue } from "../db/schema";

// Minimal mock issue for testing
const createMockIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: "test-1",
  identifier: "TEST-1",
  title: "Test Issue",
  description: null,
  team_id: "team-1",
  team_name: "Team",
  team_key: "TST",
  state_id: "state-1",
  state_name: "In Progress",
  state_type: "started",
  assignee_id: null,
  assignee_name: null,
  creator_id: null,
  creator_name: null,
  priority: 2,
  estimate: 3,
  last_comment_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  started_at: null,
  completed_at: null,
  canceled_at: null,
  url: "https://linear.app/test/issue/TEST-1",
  project_id: null,
  project_name: null,
  project_state: null,
  project_health: null,
  project_updated_at: null,
  project_lead_id: null,
  project_lead_name: null,
  ...overrides,
});

describe("hasMissingEstimate", () => {
  it("returns true when estimate is null", () => {
    const issue = createMockIssue({ estimate: null });
    expect(hasMissingEstimate(issue)).toBe(true);
  });

  it("returns false when estimate exists", () => {
    const issue = createMockIssue({ estimate: 5 });
    expect(hasMissingEstimate(issue)).toBe(false);
  });
});

describe("hasMissingPriority", () => {
  it("returns true when priority is 0", () => {
    const issue = createMockIssue({ priority: 0 });
    expect(hasMissingPriority(issue)).toBe(true);
  });

  it("returns false when priority is set", () => {
    const issue = createMockIssue({ priority: 2 });
    expect(hasMissingPriority(issue)).toBe(false);
  });
});
