#!/usr/bin/env bun

import { createLinearClient, RateLimitError } from "../src/linear/client.js";

console.log("🔍 Exploring Linear API data...\n");

try {
  const client = createLinearClient();

  // Test connection first
  console.log("Testing Linear API connection...");
  const connected = await client.testConnection();
  if (!connected) {
    console.error("❌ Failed to connect to Linear API. Check your API key.");
    process.exit(1);
  }
  console.log("✅ Connected to Linear API\n");

  // Explore Initiatives
  console.log("=".repeat(80));
  console.log("INITIATIVES - SCHEMA INTROSPECTION");
  console.log("=".repeat(80));
  try {
    const introspectionData = await client.introspectType("Initiative");
    console.log("Available fields on Initiative type:");
    const fields = introspectionData.__type?.fields || [];
    fields.forEach((field: any) => {
      const type = field.type.ofType || field.type;
      const typeName = type.name || `${type.kind}`;
      console.log(`  - ${field.name}: ${typeName}${field.description ? ` (${field.description})` : ""}`);
    });
    console.log("\n");
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error("❌ Rate limit exceeded");
      process.exit(1);
    }
    console.error("❌ Error introspecting Initiative type:", error instanceof Error ? error.message : error);
  }

  console.log("=".repeat(80));
  console.log("INITIATIVES - SAMPLE DATA");
  console.log("=".repeat(80));
  try {
    const initiativesData = await client.exploreInitiatives();
    console.log(JSON.stringify(initiativesData, null, 2));
    console.log("\n");
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error("❌ Rate limit exceeded");
      process.exit(1);
    }
    console.error("❌ Error exploring initiatives:", error instanceof Error ? error.message : error);
  }

  // Explore Issue Labels
  console.log("=".repeat(80));
  console.log("ISSUE LABELS");
  console.log("=".repeat(80));
  try {
    const issueLabelsData = await client.exploreIssueLabels();
    console.log(JSON.stringify(issueLabelsData, null, 2));
    console.log("\n");
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error("❌ Rate limit exceeded");
      process.exit(1);
    }
    console.error("❌ Error exploring issue labels:", error instanceof Error ? error.message : error);
  }

  // Explore Project Completion Dates
  console.log("=".repeat(80));
  console.log("PROJECT COMPLETION DATES");
  console.log("=".repeat(80));
  try {
    const projectCompletionData = await client.exploreProjectCompletionDates();
    console.log(JSON.stringify(projectCompletionData, null, 2));
    console.log("\n");
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error("❌ Rate limit exceeded");
      process.exit(1);
    }
    console.error("❌ Error exploring project completion dates:", error instanceof Error ? error.message : error);
  }

  console.log("\n✅ Exploration complete!");
} catch (error) {
  console.error("❌ Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
}

