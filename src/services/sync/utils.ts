import type { Issue } from "../../db/schema.js";
import type { LinearIssueData } from "../../linear/client.js";
import {
  getExistingIssueIds,
  upsertIssue,
  getAllProjects,
} from "../../db/queries.js";

/**
 * Convert database Issue format to LinearIssueData format
 */
export function convertDbIssueToLinearFormat(dbIssue: Issue): LinearIssueData {
  return {
    id: dbIssue.id,
    identifier: dbIssue.identifier,
    title: dbIssue.title,
    description: dbIssue.description,
    teamId: dbIssue.team_id,
    teamName: dbIssue.team_name,
    teamKey: dbIssue.team_key,
    stateId: dbIssue.state_id,
    stateName: dbIssue.state_name,
    stateType: dbIssue.state_type,
    assigneeId: dbIssue.assignee_id,
    assigneeName: dbIssue.assignee_name,
    assigneeAvatarUrl: dbIssue.assignee_avatar_url,
    creatorId: dbIssue.creator_id,
    creatorName: dbIssue.creator_name,
    priority: dbIssue.priority,
    estimate: dbIssue.estimate,
    lastCommentAt: dbIssue.last_comment_at
      ? new Date(dbIssue.last_comment_at)
      : null,
    commentCount: dbIssue.comment_count ?? null,
    createdAt: new Date(dbIssue.created_at),
    updatedAt: new Date(dbIssue.updated_at),
    startedAt: dbIssue.started_at ? new Date(dbIssue.started_at) : null,
    completedAt: dbIssue.completed_at ? new Date(dbIssue.completed_at) : null,
    canceledAt: dbIssue.canceled_at ? new Date(dbIssue.canceled_at) : null,
    url: dbIssue.url,
    projectId: dbIssue.project_id,
    projectName: dbIssue.project_name,
    projectStateCategory: dbIssue.project_state_category,
    projectStatus: dbIssue.project_status,
    projectHealth: dbIssue.project_health,
    projectUpdatedAt: dbIssue.project_updated_at
      ? new Date(dbIssue.project_updated_at)
      : null,
    projectLeadId: dbIssue.project_lead_id,
    projectLeadName: dbIssue.project_lead_name,
    projectLabels: [], // Database doesn't store project labels, but that's okay for determining project IDs
    projectTargetDate: dbIssue.project_target_date,
    projectStartDate: dbIssue.project_start_date,
    projectCompletedAt: dbIssue.project_completed_at,
    parentId: dbIssue.parent_id,
    labels: dbIssue.labels ? JSON.parse(dbIssue.labels) : null,
  };
}

/**
 * Write issues to database and return counts
 */
export function writeIssuesToDatabase(
  issues: Array<{
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    teamId: string;
    teamName: string;
    teamKey: string;
    stateId: string;
    stateName: string;
    stateType: string;
    assigneeId: string | null;
    assigneeName: string | null;
    assigneeAvatarUrl: string | null;
    creatorId: string | null;
    creatorName: string | null;
    priority: number | null;
    estimate: number | null;
    lastCommentAt: Date | null;
    commentCount: number | null;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    canceledAt: Date | null;
    url: string;
    projectId: string | null;
    projectName: string | null;
    projectStateCategory: string | null;
    projectStatus: string | null;
    projectHealth: string | null;
    projectUpdatedAt: Date | null;
    projectLeadId: string | null;
    projectLeadName: string | null;
    projectTargetDate: string | null;
    projectStartDate: string | null;
    projectCompletedAt: string | null;
    parentId: string | null;
    labels: Array<{
      id: string;
      name: string;
      color: string;
      description: string | null;
      team: { id: string; name: string } | null;
      parent: { id: string; name: string } | null;
    }> | null;
  }>
): { newCount: number; updatedCount: number } {
  const existingIds = getExistingIssueIds();
  let newCount = 0;
  let updatedCount = 0;

  for (const issue of issues) {
    if (existingIds.has(issue.id)) {
      updatedCount++;
    } else {
      newCount++;
    }

    upsertIssue({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      team_id: issue.teamId,
      team_name: issue.teamName,
      team_key: issue.teamKey,
      state_id: issue.stateId,
      state_name: issue.stateName,
      state_type: issue.stateType,
      assignee_id: issue.assigneeId,
      assignee_name: issue.assigneeName,
      assignee_avatar_url: issue.assigneeAvatarUrl,
      creator_id: issue.creatorId,
      creator_name: issue.creatorName,
      priority: issue.priority,
      estimate: issue.estimate,
      last_comment_at: issue.lastCommentAt
        ? issue.lastCommentAt.toISOString()
        : null,
      comment_count: issue.commentCount ?? null,
      created_at: issue.createdAt.toISOString(),
      updated_at: issue.updatedAt.toISOString(),
      started_at: issue.startedAt ? issue.startedAt.toISOString() : null,
      completed_at: issue.completedAt ? issue.completedAt.toISOString() : null,
      canceled_at: issue.canceledAt ? issue.canceledAt.toISOString() : null,
      url: issue.url,
      project_id: issue.projectId,
      project_name: issue.projectName,
      project_state_category: issue.projectStateCategory,
      project_status: issue.projectStatus,
      project_health: issue.projectHealth,
      project_updated_at: issue.projectUpdatedAt
        ? issue.projectUpdatedAt.toISOString()
        : null,
      project_lead_id: issue.projectLeadId,
      project_lead_name: issue.projectLeadName,
      project_target_date: issue.projectTargetDate,
      project_start_date: issue.projectStartDate,
      project_completed_at: issue.projectCompletedAt,
      parent_id: issue.parentId,
      labels: issue.labels ? JSON.stringify(issue.labels) : null,
    });
  }

  return { newCount, updatedCount };
}

