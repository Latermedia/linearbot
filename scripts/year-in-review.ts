#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUTPUT_DIR = "year-in-review";
const YEAR = "2025";

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

// Open database
const db = new Database("linear-bot.db", { readonly: true });

console.log("🎉 Generating 2025 Year in Review Report...\n");

// ============================================================================
// DATA EXTRACTION QUERIES
// ============================================================================

interface QuarterlyStats {
  quarter: string;
  issue_count: number;
  total_points: number;
}

interface TeamStats {
  team_name: string;
  issue_count: number;
  total_points: number;
  unique_engineers: number;
}

interface EngineerStats {
  assignee_name: string;
  issue_count: number;
  total_points: number;
  project_count: number;
  teams: string;
}

interface ProjectStats {
  project_name: string;
  project_lead_name: string | null;
  completed_at: string;
  total_issues: number;
  completed_issues: number;
  total_points: number;
  engineer_count: number;
  teams: string;
  average_cycle_time: number | null;
}

interface InitiativeStats {
  name: string;
  status: string | null;
  completed_at: string | null;
  owner_name: string | null;
  project_count: number;
}

// Overall stats
const totalIssues2025 = db
  .prepare(
    `
  SELECT COUNT(*) as count FROM issues WHERE completed_at LIKE '${YEAR}%'
`
  )
  .get() as { count: number };

const totalPoints2025 = db
  .prepare(
    `
  SELECT SUM(estimate) as total FROM issues WHERE completed_at LIKE '${YEAR}%'
`
  )
  .get() as { total: number };

const completedProjects2025 = db
  .prepare(
    `
  SELECT COUNT(*) as count FROM projects WHERE completed_at LIKE '${YEAR}%'
`
  )
  .get() as { count: number };

const uniqueTeams = db
  .prepare(
    `
  SELECT COUNT(DISTINCT team_name) as count FROM issues WHERE completed_at LIKE '${YEAR}%'
`
  )
  .get() as { count: number };

const uniqueEngineers = db
  .prepare(
    `
  SELECT COUNT(DISTINCT assignee_name) as count FROM issues 
  WHERE completed_at LIKE '${YEAR}%' AND assignee_name IS NOT NULL
`
  )
  .get() as { count: number };

const dateRange = db
  .prepare(
    `
  SELECT MIN(completed_at) as earliest, MAX(completed_at) as latest 
  FROM issues WHERE completed_at LIKE '${YEAR}%'
`
  )
  .get() as { earliest: string; latest: string };

// Quarterly breakdown
const quarterlyStats = db
  .prepare(
    `
  SELECT 
    CASE 
      WHEN completed_at LIKE '${YEAR}-01%' OR completed_at LIKE '${YEAR}-02%' OR completed_at LIKE '${YEAR}-03%' THEN 'Q1'
      WHEN completed_at LIKE '${YEAR}-04%' OR completed_at LIKE '${YEAR}-05%' OR completed_at LIKE '${YEAR}-06%' THEN 'Q2'
      WHEN completed_at LIKE '${YEAR}-07%' OR completed_at LIKE '${YEAR}-08%' OR completed_at LIKE '${YEAR}-09%' THEN 'Q3'
      WHEN completed_at LIKE '${YEAR}-10%' OR completed_at LIKE '${YEAR}-11%' OR completed_at LIKE '${YEAR}-12%' THEN 'Q4'
    END as quarter,
    COUNT(*) as issue_count,
    COALESCE(SUM(estimate), 0) as total_points
  FROM issues 
  WHERE completed_at LIKE '${YEAR}%'
  GROUP BY quarter
  ORDER BY quarter
`
  )
  .all() as QuarterlyStats[];

// Team stats
const teamStats = db
  .prepare(
    `
  SELECT 
    team_name,
    COUNT(*) as issue_count,
    COALESCE(SUM(estimate), 0) as total_points,
    COUNT(DISTINCT assignee_name) as unique_engineers
  FROM issues 
  WHERE completed_at LIKE '${YEAR}%'
  GROUP BY team_name
  ORDER BY total_points DESC
`
  )
  .all() as TeamStats[];

// Engineer stats
const engineerStats = db
  .prepare(
    `
  SELECT 
    assignee_name,
    COUNT(*) as issue_count,
    COALESCE(SUM(estimate), 0) as total_points,
    COUNT(DISTINCT project_id) as project_count,
    GROUP_CONCAT(DISTINCT team_name) as teams
  FROM issues 
  WHERE completed_at LIKE '${YEAR}%' AND assignee_name IS NOT NULL
  GROUP BY assignee_name
  ORDER BY total_points DESC
`
  )
  .all() as EngineerStats[];

// Top projects
const topProjects = db
  .prepare(
    `
  SELECT 
    project_name,
    project_lead_name,
    completed_at,
    total_issues,
    completed_issues,
    total_points,
    engineer_count,
    teams,
    average_cycle_time
  FROM projects 
  WHERE completed_at LIKE '${YEAR}%'
  ORDER BY total_points DESC
  LIMIT 25
`
  )
  .all() as ProjectStats[];

// All completed projects (for team breakdown)
const allCompletedProjects = db
  .prepare(
    `
  SELECT 
    project_name,
    project_lead_name,
    completed_at,
    total_issues,
    completed_issues,
    total_points,
    engineer_count,
    teams,
    average_cycle_time
  FROM projects 
  WHERE completed_at LIKE '${YEAR}%'
  ORDER BY total_points DESC
`
  )
  .all() as ProjectStats[];

// Initiatives
const initiatives = db
  .prepare(
    `
  SELECT 
    name,
    status,
    completed_at,
    owner_name,
    (SELECT COUNT(*) FROM json_each(project_ids) WHERE project_ids IS NOT NULL) as project_count
  FROM initiatives
  WHERE completed_at LIKE '${YEAR}%' OR status = 'Completed'
  ORDER BY completed_at DESC
`
  )
  .all() as InitiativeStats[];

// Monthly trend
const monthlyTrend = db
  .prepare(
    `
  SELECT 
    substr(completed_at, 1, 7) as month,
    COUNT(*) as issue_count,
    COALESCE(SUM(estimate), 0) as total_points
  FROM issues 
  WHERE completed_at LIKE '${YEAR}%'
  GROUP BY month
  ORDER BY month
`
  )
  .all() as { month: string; issue_count: number; total_points: number }[];

// Top projects by team (prefixed with _ as it's available for future use)
const _projectsByTeam = db
  .prepare(
    `
  SELECT 
    p.project_name,
    p.total_points,
    p.completed_at,
    p.teams
  FROM projects p
  WHERE p.completed_at LIKE '${YEAR}%'
  ORDER BY p.total_points DESC
`
  )
  .all() as {
  project_name: string;
  total_points: number;
  completed_at: string;
  teams: string;
}[];

// ============================================================================
// REPORT GENERATION
// ============================================================================

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ============================================================================
// 01 - RAW STATS
// ============================================================================
console.log("📊 Generating 01-raw-stats.md...");

const rawStatsContent = `# 2025 Raw Statistics

> Generated on ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

## Overview

| Metric | Value |
|--------|-------|
| **Total Issues Completed** | ${totalIssues2025.count.toLocaleString()} |
| **Total Story Points Delivered** | ${Math.round(totalPoints2025.total || 0).toLocaleString()} |
| **Projects Completed** | ${completedProjects2025.count} |
| **Active Teams** | ${uniqueTeams.count} |
| **Contributing Engineers** | ${uniqueEngineers.count} |
| **Data Range** | ${formatDate(dateRange.earliest)} - ${formatDate(dateRange.latest)} |

## Quarterly Breakdown

| Quarter | Issues | Story Points | Avg Points/Issue |
|---------|--------|--------------|------------------|
${quarterlyStats
  .map(
    (q) =>
      `| ${q.quarter} | ${q.issue_count.toLocaleString()} | ${Math.round(q.total_points).toLocaleString()} | ${(q.total_points / q.issue_count).toFixed(1)} |`
  )
  .join("\n")}
| **Total** | **${totalIssues2025.count.toLocaleString()}** | **${Math.round(totalPoints2025.total || 0).toLocaleString()}** | **${((totalPoints2025.total || 0) / totalIssues2025.count).toFixed(1)}** |

## Monthly Trend

| Month | Issues | Story Points |
|-------|--------|--------------|
${monthlyTrend
  .map(
    (m) =>
      `| ${formatMonth(m.month)} | ${m.issue_count.toLocaleString()} | ${Math.round(m.total_points).toLocaleString()} |`
  )
  .join("\n")}

## Key Insights

- **Peak Quarter:** ${quarterlyStats.reduce((max, q) => (q.total_points > max.total_points ? q : max), quarterlyStats[0]).quarter} with ${Math.round(quarterlyStats.reduce((max, q) => (q.total_points > max.total_points ? q : max), quarterlyStats[0]).total_points).toLocaleString()} story points
- **Average Issues per Month:** ${Math.round(totalIssues2025.count / monthlyTrend.length).toLocaleString()}
- **Average Points per Month:** ${Math.round((totalPoints2025.total || 0) / monthlyTrend.length).toLocaleString()}
`;

writeFileSync(join(OUTPUT_DIR, "01-raw-stats.md"), rawStatsContent);
console.log("  ✅ 01-raw-stats.md created\n");

// ============================================================================
// 02 - TEAM SUMMARIES
// ============================================================================
console.log("👥 Generating 02-team-summaries.md...");

// Parse teams JSON and build team->projects mapping
const teamProjectsMap = new Map<string, typeof allCompletedProjects>();
for (const project of allCompletedProjects) {
  try {
    const teams = JSON.parse(project.teams || "[]") as string[];
    for (const team of teams) {
      if (!teamProjectsMap.has(team)) {
        teamProjectsMap.set(team, []);
      }
      teamProjectsMap.get(team)!.push(project);
    }
  } catch {
    // Skip if teams is not valid JSON
  }
}

const teamSummariesContent = `# 2025 Team Summaries

> Each team's contributions to the year's success

## Team Leaderboard

| Rank | Team | Issues | Story Points | Engineers |
|------|------|--------|--------------|-----------|
${teamStats
  .slice(0, 15)
  .map(
    (t, i) =>
      `| ${i + 1} | ${t.team_name} | ${t.issue_count.toLocaleString()} | ${Math.round(t.total_points).toLocaleString()} | ${t.unique_engineers} |`
  )
  .join("\n")}

---

## Team Deep Dives

${teamStats
  .slice(0, 10)
  .map((team) => {
    const teamProjects = teamProjectsMap.get(team.team_name) || [];
    const topTeamProjects = teamProjects.slice(0, 3);

    return `### ${team.team_name}

**At a Glance:**
- 📋 **${team.issue_count.toLocaleString()}** issues completed
- 📊 **${Math.round(team.total_points).toLocaleString()}** story points delivered
- 👤 **${team.unique_engineers}** engineers contributing

**Top Projects:**
${
  topTeamProjects.length > 0
    ? topTeamProjects
        .map((p) => `- ${p.project_name} (${Math.round(p.total_points)} pts)`)
        .join("\n")
    : "- No projects tracked for this team"
}

---
`;
  })
  .join("\n")}
`;

writeFileSync(join(OUTPUT_DIR, "02-team-summaries.md"), teamSummariesContent);
console.log("  ✅ 02-team-summaries.md created\n");

// ============================================================================
// 03 - TOP PROJECTS
// ============================================================================
console.log("🚀 Generating 03-top-projects.md...");

const topProjectsContent = `# 2025 Top Projects

> The highest-impact projects completed this year

## Top 25 Projects by Story Points

| Rank | Project | Lead | Points | Issues | Engineers | Completed |
|------|---------|------|--------|--------|-----------|-----------|
${topProjects
  .map(
    (p, i) =>
      `| ${i + 1} | ${p.project_name} | ${p.project_lead_name || "—"} | ${Math.round(p.total_points)} | ${p.completed_issues}/${p.total_issues} | ${p.engineer_count} | ${formatDate(p.completed_at)} |`
  )
  .join("\n")}

---

## Project Highlights

${topProjects
  .slice(0, 10)
  .map((p, i) => {
    let teams: string[] = [];
    try {
      teams = JSON.parse(p.teams || "[]");
    } catch {
      // Ignore JSON parse errors, use empty array
    }

    return `### ${i + 1}. ${p.project_name}

| Metric | Value |
|--------|-------|
| **Project Lead** | ${p.project_lead_name || "Not assigned"} |
| **Story Points** | ${Math.round(p.total_points)} |
| **Issues Completed** | ${p.completed_issues} of ${p.total_issues} |
| **Team Size** | ${p.engineer_count} engineers |
| **Teams Involved** | ${teams.length > 0 ? teams.join(", ") : "—"} |
| **Avg Cycle Time** | ${p.average_cycle_time ? `${p.average_cycle_time.toFixed(1)} days` : "—"} |
| **Completed** | ${formatDate(p.completed_at)} |

---
`;
  })
  .join("\n")}

## Projects Completed by Quarter

${["Q1", "Q2", "Q3", "Q4"]
  .map((quarter) => {
    const monthPrefixes =
      quarter === "Q1"
        ? ["01", "02", "03"]
        : quarter === "Q2"
          ? ["04", "05", "06"]
          : quarter === "Q3"
            ? ["07", "08", "09"]
            : ["10", "11", "12"];

    const quarterProjects = allCompletedProjects.filter((p) =>
      monthPrefixes.some((m) => p.completed_at.startsWith(`${YEAR}-${m}`))
    );

    return `### ${quarter} ${YEAR} (${quarterProjects.length} projects)

${quarterProjects
  .slice(0, 5)
  .map(
    (p) =>
      `- **${p.project_name}** — ${Math.round(p.total_points)} pts (${p.project_lead_name || "No lead"})`
  )
  .join("\n")}
${quarterProjects.length > 5 ? `\n*...and ${quarterProjects.length - 5} more projects*` : ""}
`;
  })
  .join("\n")}
`;

writeFileSync(join(OUTPUT_DIR, "03-top-projects.md"), topProjectsContent);
console.log("  ✅ 03-top-projects.md created\n");

// ============================================================================
// 04 - ENGINEER HIGHLIGHTS
// ============================================================================
console.log("⭐ Generating 04-engineer-highlights.md...");

const engineerHighlightsContent = `# 2025 Engineer Highlights

> Celebrating our top contributors

## Top 20 Engineers by Story Points

| Rank | Engineer | Points | Issues | Projects | Teams |
|------|----------|--------|--------|----------|-------|
${engineerStats
  .slice(0, 20)
  .map(
    (e, i) =>
      `| ${i + 1} | ${e.assignee_name} | ${Math.round(e.total_points)} | ${e.issue_count} | ${e.project_count} | ${e.teams?.split(",").length || 1} |`
  )
  .join("\n")}

---

## Top Engineers by Issue Count

| Rank | Engineer | Issues | Points | Avg Pts/Issue |
|------|----------|--------|--------|---------------|
${[...engineerStats]
  .sort((a, b) => b.issue_count - a.issue_count)
  .slice(0, 15)
  .map(
    (e, i) =>
      `| ${i + 1} | ${e.assignee_name} | ${e.issue_count} | ${Math.round(e.total_points)} | ${(e.total_points / e.issue_count).toFixed(1)} |`
  )
  .join("\n")}

---

## Multi-Team Contributors

*Engineers who contributed across multiple teams:*

${engineerStats
  .filter((e) => e.teams && e.teams.split(",").length > 1)
  .sort((a, b) => b.teams.split(",").length - a.teams.split(",").length)
  .slice(0, 10)
  .map(
    (e) =>
      `- **${e.assignee_name}** — ${e.teams.split(",").length} teams: ${e.teams}`
  )
  .join("\n")}

---

## Individual Spotlights

${engineerStats
  .slice(0, 10)
  .map((e, i) => {
    const teamList = e.teams?.split(",") || [];

    return `### ${i + 1}. ${e.assignee_name}

| Metric | Value |
|--------|-------|
| **Story Points** | ${Math.round(e.total_points)} |
| **Issues Completed** | ${e.issue_count} |
| **Projects Contributed** | ${e.project_count} |
| **Primary Teams** | ${teamList.slice(0, 3).join(", ")}${teamList.length > 3 ? ` (+${teamList.length - 3} more)` : ""} |
| **Avg Points/Issue** | ${(e.total_points / e.issue_count).toFixed(1)} |

---
`;
  })
  .join("\n")}
`;

writeFileSync(
  join(OUTPUT_DIR, "04-engineer-highlights.md"),
  engineerHighlightsContent
);
console.log("  ✅ 04-engineer-highlights.md created\n");

// ============================================================================
// 05 - INITIATIVES
// ============================================================================
console.log("🎯 Generating 05-initiatives.md...");

const initiativesContent = `# 2025 Strategic Initiatives

> Major initiatives completed this year

## Completed Initiatives

| Initiative | Owner | Status | Completed | Projects |
|------------|-------|--------|-----------|----------|
${initiatives
  .map(
    (i) =>
      `| ${i.name} | ${i.owner_name || "—"} | ${i.status || "—"} | ${i.completed_at ? formatDate(i.completed_at) : "—"} | ${i.project_count} |`
  )
  .join("\n")}

---

## Initiative Details

${initiatives
  .slice(0, 15)
  .map(
    (init, i) => `### ${i + 1}. ${init.name}

| Attribute | Value |
|-----------|-------|
| **Owner** | ${init.owner_name || "Not assigned"} |
| **Status** | ${init.status || "Unknown"} |
| **Completed** | ${init.completed_at ? formatDate(init.completed_at) : "In progress"} |
| **Linked Projects** | ${init.project_count} |

---
`
  )
  .join("\n")}

## Summary

- **Total Initiatives Tracked:** ${initiatives.length}
- **Completed in 2025:** ${initiatives.filter((i) => i.completed_at?.startsWith(YEAR)).length}
`;

writeFileSync(join(OUTPUT_DIR, "05-initiatives.md"), initiativesContent);
console.log("  ✅ 05-initiatives.md created\n");

// ============================================================================
// FINAL WRAPPED REPORT
// ============================================================================
console.log("🎁 Generating FINAL-2025-wrapped.md...");

const topEngineer = engineerStats[0];
const topTeam = teamStats[0];
const topProject = topProjects[0];
const peakQuarter = quarterlyStats.reduce(
  (max, q) => (q.total_points > max.total_points ? q : max),
  quarterlyStats[0]
);
const peakMonth = monthlyTrend.reduce(
  (max, m) => (m.total_points > max.total_points ? m : max),
  monthlyTrend[0]
);

const wrappedContent = `# 🎉 2025 Year in Review

> A celebration of what we accomplished together

---

## The Big Picture

\`\`\`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ${totalIssues2025.count.toLocaleString().padStart(6)} issues completed                               ║
║   ${Math.round(totalPoints2025.total || 0)
  .toLocaleString()
  .padStart(6)} story points delivered                        ║
║   ${completedProjects2025.count.toString().padStart(6)} projects shipped                               ║
║   ${uniqueEngineers.count.toString().padStart(6)} engineers contributing                          ║
║   ${uniqueTeams.count.toString().padStart(6)} teams collaborating                              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
\`\`\`

From **${formatDate(dateRange.earliest)}** to **${formatDate(dateRange.latest)}**, we've been busy building, shipping, and improving.

---

## 📈 Quarter by Quarter

| Quarter | Issues | Story Points | Growth |
|---------|--------|--------------|--------|
${quarterlyStats
  .map((q, i) => {
    const prevPoints =
      i > 0 ? quarterlyStats[i - 1].total_points : q.total_points;
    const growth =
      i > 0
        ? (((q.total_points - prevPoints) / prevPoints) * 100).toFixed(0)
        : "—";
    const growthStr =
      i > 0 ? (parseInt(growth) >= 0 ? `+${growth}%` : `${growth}%`) : "—";
    return `| **${q.quarter}** | ${q.issue_count.toLocaleString()} | ${Math.round(q.total_points).toLocaleString()} | ${growthStr} |`;
  })
  .join("\n")}

**Peak Quarter:** ${peakQuarter.quarter} delivered **${Math.round(peakQuarter.total_points).toLocaleString()}** story points

---

## 🏆 Team Champions

### Top 5 Teams by Output

${teamStats
  .slice(0, 5)
  .map((t, i) => {
    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
    return `${medals[i]} **${t.team_name}** — ${Math.round(t.total_points).toLocaleString()} points across ${t.issue_count.toLocaleString()} issues`;
  })
  .join("\n\n")}

---

## 🚀 Biggest Projects Shipped

These projects represented our most significant investments:

${topProjects
  .slice(0, 10)
  .map((p, i) => {
    const rank = i + 1;
    return `### ${rank}. ${p.project_name}
- **${Math.round(p.total_points)} story points** | ${p.completed_issues} issues | ${p.engineer_count} engineers
- Lead: ${p.project_lead_name || "Team effort"}
- Shipped: ${formatDate(p.completed_at)}
`;
  })
  .join("\n")}

---

## ⭐ All-Stars

### Top Contributors by Impact

${engineerStats
  .slice(0, 10)
  .map((e, i) => {
    const emojis = ["👑", "🌟", "💫", "✨", "⚡", "🔥", "💪", "🎯", "🚀", "💎"];
    return `${emojis[i]} **${e.assignee_name}** — ${Math.round(e.total_points)} points | ${e.issue_count} issues | ${e.project_count} projects`;
  })
  .join("\n\n")}

---

## 🎯 Strategic Initiatives Completed

${initiatives
  .filter((i) => i.completed_at?.startsWith(YEAR))
  .slice(0, 8)
  .map((init) => `- **${init.name}** — ${init.owner_name || "Team effort"}`)
  .join("\n")}

---

## 📊 By the Numbers

| Metric | Value |
|--------|-------|
| Total Issues | **${totalIssues2025.count.toLocaleString()}** |
| Story Points | **${Math.round(totalPoints2025.total || 0).toLocaleString()}** |
| Completed Projects | **${completedProjects2025.count}** |
| Engineers | **${uniqueEngineers.count}** |
| Teams | **${uniqueTeams.count}** |
| Avg Points/Issue | **${((totalPoints2025.total || 0) / totalIssues2025.count).toFixed(1)}** |
| Avg Issues/Month | **${Math.round(totalIssues2025.count / monthlyTrend.length).toLocaleString()}** |
| Peak Month | **${formatMonth(peakMonth.month)}** |

---

## 🌟 Highlights

- **${topEngineer.assignee_name}** led all engineers with **${Math.round(topEngineer.total_points)}** story points
- **${topTeam.team_name}** was the most productive team with **${Math.round(topTeam.total_points)}** points
- **${topProject.project_name}** was the largest project at **${Math.round(topProject.total_points)}** points
- **${peakQuarter.quarter}** was our biggest quarter with **${Math.round(peakQuarter.total_points).toLocaleString()}** points delivered

---

## Looking Ahead

This year's accomplishments set the stage for an even bigger 2026. Thank you to every engineer, every team, and every contributor who made this possible.

**Here's to what we'll build next! 🚀**

---

*Report generated on ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}*
`;

writeFileSync(join(OUTPUT_DIR, "FINAL-2025-wrapped.md"), wrappedContent);
console.log("  ✅ FINAL-2025-wrapped.md created\n");

// Close database
db.close();

console.log("═".repeat(60));
console.log("\n🎉 Year in Review generation complete!\n");
console.log(`📁 Output directory: ${OUTPUT_DIR}/`);
console.log("   ├── 01-raw-stats.md");
console.log("   ├── 02-team-summaries.md");
console.log("   ├── 03-top-projects.md");
console.log("   ├── 04-engineer-highlights.md");
console.log("   ├── 05-initiatives.md");
console.log("   └── FINAL-2025-wrapped.md");
console.log("\n✨ Review the files and customize as needed!\n");

// Output the agentic plan suggestion
console.log("═".repeat(60));
console.log("\n🤖 Want deeper insights? Run the agentic exploration!\n");
console.log("The stats above are just the beginning. For narrative insights,");
console.log("impact stories, and a Wrapped-style celebration report:\n");
console.log("  1. Open this repo in Cursor (or your AI-enabled editor)");
console.log("  2. Reference PLAN-agentic-review.md");
console.log('  3. Ask: "Run the agentic year in review exploration"\n');
console.log("The AI will query the database, reason about findings,");
console.log("and build meaningful narratives from your data.\n");
console.log("📄 See PLAN-agentic-review.md for the full methodology.\n");
