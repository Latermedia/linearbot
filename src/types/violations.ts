export interface AssigneeViolation {
  name: string;
  count: number;
  status: "critical" | "warning" | "ok";
}

export interface ProjectViolation {
  name: string;
  engineerCount: number;
  hasStatusMismatch: boolean;
  isStale: boolean;
}

export interface EngineerMultiProjectViolation {
  engineerName: string;
  projectCount: number;
  projects: string[];
}

export interface DashboardData {
  assigneeViolations: AssigneeViolation[];
  projectViolations: ProjectViolation[];
  engineerMultiProjectViolations: EngineerMultiProjectViolation[];
  totalAssignees: number;
  totalProjects: number;
  unassignedCount: number;
  missingEstimateCount: number;
  noRecentCommentCount: number;
  missingPriorityCount: number;
  totalTeams: number;
  teamsWithViolations: number;
  totalDomains: number;
  domainsWithViolations: number;
}

