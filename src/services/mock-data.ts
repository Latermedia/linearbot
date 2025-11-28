import type { LinearIssueData, ProjectUpdate } from "../linear/client.js";

/**
 * Check if the app should run in mock data mode
 * Returns true if LINEAR_API_KEY is missing, empty, or set to "mock"
 */
export function isMockMode(): boolean {
  const apiKey = process.env.LINEAR_API_KEY;
  return !apiKey || apiKey.trim() === "" || apiKey.toLowerCase() === "mock";
}

// Mock data constants
const MOCK_ASSIGNEES = [
  {
    id: "user-1",
    name: "Alex Chen",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
  },
  {
    id: "user-2",
    name: "Jordan Rivera",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan",
  },
  {
    id: "user-3",
    name: "Sam Taylor",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sam",
  },
  {
    id: "user-4",
    name: "Morgan Lee",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Morgan",
  },
  {
    id: "user-5",
    name: "Casey Kim",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Casey",
  },
  {
    id: "user-6",
    name: "Riley Johnson",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Riley",
  },
  {
    id: "user-7",
    name: "Jamie Patel",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jamie",
  },
  {
    id: "user-8",
    name: "Quinn Martinez",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Quinn",
  },
];

const MOCK_TEAMS = [
  { id: "team-1", name: "Frontend", key: "FE" },
  { id: "team-2", name: "Backend", key: "BE" },
  { id: "team-3", name: "Platform", key: "PLAT" },
  { id: "team-4", name: "Mobile", key: "MOB" },
];

const MOCK_PROJECTS = [
  {
    id: "proj-1",
    name: "User Authentication Revamp",
    state: "started",
    health: "onTrack",
    leadId: "user-1",
    leadName: "Alex Chen",
    labels: ["security", "Q1"],
    description:
      "Modernize authentication system with OAuth 2.0, MFA support, and improved session management.",
  },
  {
    id: "proj-2",
    name: "Search Performance Optimization",
    state: "started",
    health: "atRisk",
    leadId: "user-3",
    leadName: "Sam Taylor",
    labels: ["performance", "infrastructure"],
    description:
      "Improve search response times by implementing Elasticsearch and query caching.",
  },
  {
    id: "proj-3",
    name: "Mobile App v2",
    state: "started",
    health: "onTrack",
    leadId: "user-5",
    leadName: "Casey Kim",
    labels: ["mobile", "Q1"],
    description:
      "Major mobile app redesign with new navigation, offline support, and push notifications.",
  },
  {
    id: "proj-4",
    name: "API Rate Limiting",
    state: "started",
    health: "onTrack",
    leadId: "user-2",
    leadName: "Jordan Rivera",
    labels: ["infrastructure", "security"],
    description:
      "Implement rate limiting and throttling across all public API endpoints.",
  },
  {
    id: "proj-5",
    name: "Dashboard Analytics",
    state: "started",
    health: "offTrack",
    leadId: "user-4",
    leadName: "Morgan Lee",
    labels: ["analytics", "Q2"],
    description:
      "Build comprehensive analytics dashboard with real-time metrics and custom reports.",
  },
  {
    id: "proj-6",
    name: "Payment System Migration",
    state: "planned",
    health: null,
    leadId: null,
    leadName: null,
    labels: ["payments", "migration"],
    description:
      "Migrate from legacy payment processor to Stripe with support for subscriptions.",
  },
  {
    id: "proj-7",
    name: "Notification Service Refactor",
    state: "started",
    health: "onTrack",
    leadId: "user-7",
    leadName: "Jamie Patel",
    labels: ["infrastructure"],
    description:
      "Refactor notification service to support email, SMS, push, and in-app notifications.",
  },
];

const MOCK_STATES = {
  backlog: { id: "state-1", name: "Backlog", type: "backlog" },
  todo: { id: "state-2", name: "Todo", type: "unstarted" },
  inProgress: { id: "state-3", name: "In Progress", type: "started" },
  inReview: { id: "state-4", name: "In Review", type: "started" },
  done: { id: "state-5", name: "Done", type: "completed" },
  canceled: { id: "state-6", name: "Canceled", type: "canceled" },
};

const ISSUE_TITLES = [
  "Implement login form validation",
  "Add password reset flow",
  "Create user settings page",
  "Fix session timeout handling",
  "Add OAuth Google integration",
  "Implement MFA setup wizard",
  "Update password hashing algorithm",
  "Add rate limiting to auth endpoints",
  "Create search results component",
  "Optimize search index queries",
  "Add search suggestions dropdown",
  "Implement faceted search filters",
  "Cache frequent search queries",
  "Add search analytics tracking",
  "Design mobile navigation drawer",
  "Implement pull-to-refresh",
  "Add offline data sync",
  "Create push notification handler",
  "Build onboarding tutorial",
  "Fix iOS keyboard issues",
  "Implement API throttling middleware",
  "Add request logging",
  "Create rate limit dashboard",
  "Document API limits",
  "Add burst allowance config",
  "Build analytics data pipeline",
  "Create metric visualization widgets",
  "Implement real-time updates",
  "Add export to CSV feature",
  "Create custom report builder",
  "Design dashboard layout",
  "Migrate customer data to Stripe",
  "Implement subscription management",
  "Add payment method UI",
  "Create billing history page",
  "Handle failed payment retries",
  "Refactor email sender module",
  "Add SMS notification support",
  "Create notification preferences UI",
  "Implement notification batching",
  "Add unsubscribe handling",
  "Write API documentation",
  "Add integration tests",
  "Create deployment runbook",
  "Update security headers",
  "Fix memory leak in worker",
  "Optimize database queries",
  "Add monitoring alerts",
  "Review third-party dependencies",
  "Update error handling",
];

/**
 * Generate a random date within the past N days
 */
function randomDate(daysAgo: number, offsetDays: number = 0): Date {
  const now = new Date();
  const minTime = now.getTime() - (daysAgo + offsetDays) * 24 * 60 * 60 * 1000;
  const maxTime = now.getTime() - offsetDays * 24 * 60 * 60 * 1000;
  return new Date(minTime + Math.random() * (maxTime - minTime));
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Pick a random item from an array
 */
function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate mock Linear issue data
 */
export function generateMockData(): {
  issues: LinearIssueData[];
  projectDescriptions: Map<string, string | null>;
  projectUpdates: Map<string, ProjectUpdate[]>;
} {
  const issues: LinearIssueData[] = [];
  const projectDescriptions = new Map<string, string | null>();
  const projectUpdates = new Map<string, ProjectUpdate[]>();
  let issueCounter = 1;
  const usedTitles = new Set<string>();

  // Generate issues for each project
  for (const project of MOCK_PROJECTS) {
    // Store project description
    projectDescriptions.set(project.id, project.description);

    // Generate 1-3 project updates for active projects
    if (project.state === "started") {
      const updates: ProjectUpdate[] = [];
      const updateCount = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < updateCount; i++) {
        const updateDate = randomDate(30, i * 10);
        // Use project lead as author if available, otherwise pick random assignee
        const author = project.leadId
          ? MOCK_ASSIGNEES.find((a) => a.id === project.leadId) ||
            randomPick(MOCK_ASSIGNEES)
          : randomPick(MOCK_ASSIGNEES);
        updates.push({
          id: generateId(),
          createdAt: updateDate.toISOString(),
          updatedAt: updateDate.toISOString(),
          body: getProjectUpdateBody(project.name, i),
          health: i === 0 ? project.health : randomPick(["onTrack", "atRisk"]),
          userId: author.id,
          userName: author.name,
          userAvatarUrl: author.avatarUrl,
        });
      }
      projectUpdates.set(project.id, updates);
    }

    // Skip planned projects for issue generation (they have no started issues)
    if (project.state === "planned") continue;

    const team = randomPick(MOCK_TEAMS);
    const issuesPerProject = 5 + Math.floor(Math.random() * 6); // 5-10 issues per project

    for (let i = 0; i < issuesPerProject; i++) {
      // Pick a unique title
      let title: string;
      do {
        title = randomPick(ISSUE_TITLES);
      } while (usedTitles.has(title) && usedTitles.size < ISSUE_TITLES.length);
      usedTitles.add(title);

      // Determine state distribution: ~30% backlog, ~40% in-progress, ~30% done
      const stateRoll = Math.random();
      let state;
      if (stateRoll < 0.3) {
        state = randomPick([MOCK_STATES.backlog, MOCK_STATES.todo]);
      } else if (stateRoll < 0.7) {
        state = randomPick([MOCK_STATES.inProgress, MOCK_STATES.inReview]);
      } else {
        state = MOCK_STATES.done;
      }

      const assignee = randomPick(MOCK_ASSIGNEES);
      const creator = randomPick(MOCK_ASSIGNEES);
      const createdAt = randomDate(90, 0);
      const updatedAt = randomDate(
        Math.min(
          30,
          Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
        ),
        0
      );

      // Started/completed dates based on state
      let startedAt: Date | null = null;
      let completedAt: Date | null = null;
      if (state.type === "started" || state.type === "completed") {
        startedAt = new Date(
          createdAt.getTime() +
            Math.random() * (updatedAt.getTime() - createdAt.getTime()) * 0.3
        );
      }
      if (state.type === "completed") {
        completedAt = new Date(
          startedAt!.getTime() +
            Math.random() * (updatedAt.getTime() - startedAt!.getTime())
        );
      }

      // ~20% missing estimates for violation testing
      const estimate = Math.random() > 0.2 ? randomPick([1, 2, 3, 5, 8]) : null;

      // ~10% missing priority (0 = no priority in Linear)
      const priority = Math.random() > 0.1 ? randomPick([1, 2, 3, 4]) : 0;

      // ~15% stale (no comment in 7+ days) for violation testing
      let lastCommentAt: Date | null = null;
      if (state.type === "started") {
        if (Math.random() > 0.15) {
          // Recent comment
          lastCommentAt = randomDate(5, 0);
        } else {
          // Stale - comment from 8-14 days ago
          lastCommentAt = randomDate(14, 8);
        }
      }

      const identifier = `${team.key}-${issueCounter++}`;

      issues.push({
        id: generateId(),
        identifier,
        title,
        description: Math.random() > 0.1 ? `Description for ${title}` : null, // ~10% missing description
        teamId: team.id,
        teamName: team.name,
        teamKey: team.key,
        stateId: state.id,
        stateName: state.name,
        stateType: state.type,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        assigneeAvatarUrl: assignee.avatarUrl,
        creatorId: creator.id,
        creatorName: creator.name,
        priority,
        estimate,
        lastCommentAt,
        createdAt,
        updatedAt,
        startedAt,
        completedAt,
        canceledAt: null,
        url: `https://linear.app/mock/issue/${identifier}`,
        projectId: project.id,
        projectName: project.name,
        projectState: project.state,
        projectHealth: project.health,
        projectUpdatedAt: randomDate(14, 0),
        projectLeadId: project.leadId,
        projectLeadName: project.leadName,
        projectLabels: project.labels,
      });
    }
  }

  // Add some unassigned issues (no project) for variety
  const team = randomPick(MOCK_TEAMS);
  for (let i = 0; i < 5; i++) {
    let title: string;
    do {
      title = randomPick(ISSUE_TITLES);
    } while (usedTitles.has(title) && usedTitles.size < ISSUE_TITLES.length);
    usedTitles.add(title);

    const assignee = randomPick(MOCK_ASSIGNEES);
    const state = MOCK_STATES.inProgress;
    const createdAt = randomDate(60, 0);
    const updatedAt = randomDate(14, 0);
    const startedAt = randomDate(30, 0);
    const identifier = `${team.key}-${issueCounter++}`;

    issues.push({
      id: generateId(),
      identifier,
      title,
      description: `Standalone task: ${title}`,
      teamId: team.id,
      teamName: team.name,
      teamKey: team.key,
      stateId: state.id,
      stateName: state.name,
      stateType: state.type,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      assigneeAvatarUrl: assignee.avatarUrl,
      creatorId: assignee.id,
      creatorName: assignee.name,
      priority: randomPick([1, 2, 3]),
      estimate: randomPick([1, 2, 3]),
      lastCommentAt: randomDate(3, 0),
      createdAt,
      updatedAt,
      startedAt,
      completedAt: null,
      canceledAt: null,
      url: `https://linear.app/mock/issue/${identifier}`,
      projectId: null,
      projectName: null,
      projectState: null,
      projectHealth: null,
      projectUpdatedAt: null,
      projectLeadId: null,
      projectLeadName: null,
      projectLabels: [],
    });
  }

  console.log(
    `[MOCK] Generated ${issues.length} mock issues across ${MOCK_PROJECTS.length} projects`
  );

  return { issues, projectDescriptions, projectUpdates };
}

/**
 * Generate realistic project update body text
 */
function getProjectUpdateBody(projectName: string, index: number): string {
  const updates = [
    `## Weekly Update\n\nGood progress this week on ${projectName}. The team completed the core implementation and started integration testing.\n\n**Completed:**\n- Core feature implementation\n- Unit test coverage\n\n**Next week:**\n- Integration testing\n- Documentation`,
    `## Status Update\n\nWe've hit a few blockers with third-party dependencies but found workarounds. Slight delay expected but still on track for the milestone.\n\n**Risks:**\n- Dependency version conflicts\n- Need additional QA resources`,
    `## Progress Report\n\nMid-sprint check-in. Team velocity is good, we're ahead of schedule on most items. Will use extra time for tech debt reduction.\n\n**Highlights:**\n- Ahead of schedule\n- Good team collaboration`,
  ];
  return updates[index % updates.length];
}
