import { getDatabase } from "../src/db/connection.js";
import { getProjectsByLabel } from "../src/db/queries.js";

const db = getDatabase();

console.log("Checking for projects with 'Executive Visibility' label...\n");

// Get all projects with Executive Visibility label
const executiveProjects = getProjectsByLabel("Executive Visibility");

console.log(
  `Total projects with "Executive Visibility" label: ${executiveProjects.length}\n`
);

if (executiveProjects.length === 0) {
  console.log("No projects found with this label.");

  // Check what labels exist in the database
  const allProjects = db
    .prepare("SELECT project_id, project_name, labels FROM projects LIMIT 20")
    .all() as Array<{
    project_id: string;
    project_name: string;
    labels: string | null;
  }>;

  console.log("\nSample of projects and their labels:");
  allProjects.forEach((p) => {
    console.log(`- ${p.project_name} (${p.project_id}): ${p.labels || "null"}`);
  });

  // Check total project count
  const totalProjects = db
    .prepare("SELECT COUNT(*) as count FROM projects")
    .get() as { count: number };
  console.log(`\nTotal projects in database: ${totalProjects.count}`);
} else {
  console.log("Projects with 'Executive Visibility' label:");
  executiveProjects.forEach((project) => {
    const stateCategory = project.project_state_category || "null";
    const isInProgress =
      stateCategory.toLowerCase().includes("progress") ||
      stateCategory.toLowerCase().includes("started");

    console.log(`\n- ${project.project_name} (${project.project_id})`);
    console.log(`  State Category: ${stateCategory}`);
    console.log(`  In Progress: ${isInProgress ? "YES" : "NO"}`);
    console.log(`  Labels: ${project.labels || "null"}`);
  });

  // Count how many are in progress
  const inProgressCount = executiveProjects.filter((p) => {
    const stateCategory = (p.project_state_category || "").toLowerCase();
    return (
      stateCategory.includes("progress") || stateCategory.includes("started")
    );
  }).length;

  console.log(`\n\nSummary:`);
  console.log(`- Total with label: ${executiveProjects.length}`);
  console.log(`- In progress: ${inProgressCount}`);
  console.log(
    `- Not in progress: ${executiveProjects.length - inProgressCount}`
  );
}

// Also check all project state categories to see what values exist
console.log("\n\nAll unique project_state_category values in database:");
const stateCategories = db
  .prepare(
    `
  SELECT DISTINCT project_state_category, COUNT(*) as count 
  FROM projects 
  WHERE project_state_category IS NOT NULL
  GROUP BY project_state_category
  ORDER BY count DESC
`
  )
  .all() as Array<{ project_state_category: string; count: number }>;

stateCategories.forEach((row) => {
  console.log(`- "${row.project_state_category}": ${row.count} projects`);
});
