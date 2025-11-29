import { describe, it, expect } from "vitest";
import {
  hasMissingEstimate,
  hasMissingPriority,
  hasWIPAgeViolation,
  hasMissingDescription,
  hasNoRecentComment,
} from "./issue-validators";
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
  assignee_avatar_url: null,
  creator_id: null,
  creator_name: null,
  priority: 2,
  estimate: 3,
  last_comment_at: null,
  comment_count: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  started_at: null,
  completed_at: null,
  canceled_at: null,
  url: "https://linear.app/test/issue/TEST-1",
  project_id: null,
  project_name: null,
  project_state_category: null,
  project_status: null,
  project_health: null,
  project_updated_at: null,
  project_lead_id: null,
  project_lead_name: null,
  project_target_date: null,
  project_start_date: null,
  parent_id: null,
  ...overrides,
});

// Helper to create a date N days ago
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

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

describe("hasWIPAgeViolation", () => {
  it("returns false when started_at is null", () => {
    const issue = createMockIssue({ started_at: null });
    expect(hasWIPAgeViolation(issue)).toBe(false);
  });

  it("returns false when started less than 14 days ago", () => {
    const issue = createMockIssue({ started_at: daysAgo(10) });
    expect(hasWIPAgeViolation(issue)).toBe(false);
  });

  it("returns false when started 13.9 days ago", () => {
    // Use 13.9 days to avoid timing edge cases at exactly 14 days
    const date = new Date();
    date.setTime(date.getTime() - 13.9 * 24 * 60 * 60 * 1000);
    const issue = createMockIssue({ started_at: date.toISOString() });
    expect(hasWIPAgeViolation(issue)).toBe(false);
  });

  it("returns true when started more than 14 days ago", () => {
    const issue = createMockIssue({ started_at: daysAgo(15) });
    expect(hasWIPAgeViolation(issue)).toBe(true);
  });

  it("returns true when started 30 days ago", () => {
    const issue = createMockIssue({ started_at: daysAgo(30) });
    expect(hasWIPAgeViolation(issue)).toBe(true);
  });
});

describe("hasNoRecentComment", () => {
  it("returns false for non-WIP issues (completed)", () => {
    const issue = createMockIssue({
      state_type: "completed",
      last_comment_at: null,
    });
    expect(hasNoRecentComment(issue)).toBe(false);
  });

  it("returns false for non-WIP issues (unstarted)", () => {
    const issue = createMockIssue({
      state_type: "unstarted",
      last_comment_at: null,
    });
    expect(hasNoRecentComment(issue)).toBe(false);
  });

  it("returns false for cancelled issues", () => {
    const issue = createMockIssue({
      state_type: "canceled",
      state_name: "Cancelled",
      last_comment_at: null,
    });
    expect(hasNoRecentComment(issue)).toBe(false);
  });

  it("returns true for WIP issue with no comments", () => {
    const issue = createMockIssue({
      state_type: "started",
      last_comment_at: null,
    });
    expect(hasNoRecentComment(issue)).toBe(true);
  });

  it("returns false for WIP issue with recent comment", () => {
    const issue = createMockIssue({
      state_type: "started",
      last_comment_at: new Date().toISOString(),
    });
    expect(hasNoRecentComment(issue)).toBe(false);
  });

  it("returns true for WIP issue with old comment", () => {
    const issue = createMockIssue({
      state_type: "started",
      last_comment_at: daysAgo(5),
    });
    expect(hasNoRecentComment(issue)).toBe(true);
  });
});

describe("hasMissingDescription", () => {
  it("returns true when description is null", () => {
    const issue = createMockIssue({ description: null });
    expect(hasMissingDescription(issue)).toBe(true);
  });

  it("returns true when description is empty string", () => {
    const issue = createMockIssue({ description: "" });
    expect(hasMissingDescription(issue)).toBe(true);
  });

  it("returns true when description is whitespace only", () => {
    const issue = createMockIssue({ description: "   " });
    expect(hasMissingDescription(issue)).toBe(true);
  });

  it("returns false when description has content", () => {
    const issue = createMockIssue({ description: "This is a description" });
    expect(hasMissingDescription(issue)).toBe(false);
  });
});
