import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { getDatabase } from "../db/connection.js";
import { createLinearClient } from "../linear/client.js";

interface SyncViewProps {
  onComplete: () => void;
  onBack: () => void;
}

type SyncStatus = "connecting" | "fetching" | "storing" | "complete" | "error";

export function SyncView({ onComplete, onBack }: SyncViewProps) {
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [issueCount, setIssueCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  useInput((input) => {
    if (canGoBack && (input === "b" || input === "q")) {
      onBack();
    }
  });

  useEffect(() => {
    runSync();
  }, []);

  const runSync = async () => {
    try {
      // Get ignored team keys
      const ignoredTeamKeys = process.env.IGNORED_TEAM_KEYS
        ? process.env.IGNORED_TEAM_KEYS.split(",").map((key) => key.trim())
        : [];

      // Connect to Linear
      setStatus("connecting");
      const linearClient = createLinearClient();
      const connected = await linearClient.testConnection();

      if (!connected) {
        setStatus("error");
        setErrorMessage("Failed to connect to Linear. Check your API key.");
        setCanGoBack(true);
        return;
      }

      // Fetch issues
      setStatus("fetching");
      const allIssues = await linearClient.fetchStartedIssues((count) => {
        setIssueCount(count);
      });

      // Filter ignored teams
      const issues = allIssues.filter(
        (issue) => !ignoredTeamKeys.includes(issue.teamKey)
      );

      // Store in database
      setStatus("storing");
      const db = getDatabase();

      const getExistingIssueIds = db.prepare(`SELECT id FROM issues`);
      const existingIds = new Set(
        (getExistingIssueIds.all() as { id: string }[]).map((row) => row.id)
      );

      const upsertIssue = db.prepare(`
        INSERT INTO issues (
          id, identifier, title, description, team_id, team_name, team_key,
          state_id, state_name, state_type,
          assignee_id, assignee_name, priority, 
          created_at, updated_at, url
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          identifier = excluded.identifier,
          title = excluded.title,
          description = excluded.description,
          team_id = excluded.team_id,
          team_name = excluded.team_name,
          team_key = excluded.team_key,
          state_id = excluded.state_id,
          state_name = excluded.state_name,
          state_type = excluded.state_type,
          assignee_id = excluded.assignee_id,
          assignee_name = excluded.assignee_name,
          priority = excluded.priority,
          updated_at = excluded.updated_at,
          url = excluded.url
      `);

      let newIssues = 0;
      let updatedIssues = 0;

      const syncTransaction = db.transaction(() => {
        for (const issue of issues) {
          if (existingIds.has(issue.id)) {
            updatedIssues++;
          } else {
            newIssues++;
          }

          upsertIssue.run(
            issue.id,
            issue.identifier,
            issue.title,
            issue.description,
            issue.teamId,
            issue.teamName,
            issue.teamKey,
            issue.stateId,
            issue.stateName,
            issue.stateType,
            issue.assigneeId,
            issue.assigneeName,
            issue.priority,
            issue.createdAt.toISOString(),
            issue.updatedAt.toISOString(),
            issue.url
          );
        }
      });

      syncTransaction();

      // Remove ignored teams from database
      if (ignoredTeamKeys.length > 0) {
        const placeholders = ignoredTeamKeys.map(() => "?").join(",");
        const deleteIgnored = db.prepare(`
          DELETE FROM issues WHERE team_key IN (${placeholders})
        `);
        deleteIgnored.run(...ignoredTeamKeys);
      }

      // Get total count
      const getTotalCount = db.prepare(`SELECT COUNT(*) as count FROM issues`);
      const total = (getTotalCount.get() as { count: number }).count;

      setNewCount(newIssues);
      setUpdatedCount(updatedIssues);
      setTotalCount(total);
      setStatus("complete");

      setTimeout(() => {
        onComplete();
      }, 3000);
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      setCanGoBack(true);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {status === "connecting" && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Connecting to Linear...</Text>
        </Box>
      )}

      {status === "fetching" && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text> Fetching issues from Linear...</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Issues found: {issueCount}</Text>
          </Box>
        </Box>
      )}

      {status === "storing" && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Storing in database...</Text>
        </Box>
      )}

      {status === "complete" && (
        <Box flexDirection="column" padding={1}>
          <Box marginBottom={1}>
            <Text color="green" bold>
              ✓ Sync Complete!
            </Text>
          </Box>
          <Box flexDirection="column" paddingLeft={2}>
            <Text>
              <Text color="green">New issues:</Text> {newCount}
            </Text>
            <Text>
              <Text color="yellow">Updated issues:</Text> {updatedCount}
            </Text>
            <Text>
              <Text color="cyan">Total issues:</Text> {totalCount}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Returning to menu...</Text>
          </Box>
        </Box>
      )}

      {status === "error" && (
        <Box flexDirection="column" padding={1}>
          <Box marginBottom={1}>
            <Text color="red" bold>
              ✗ Sync Failed
            </Text>
          </Box>
          <Box paddingLeft={2} marginBottom={1}>
            <Text color="red">{errorMessage}</Text>
          </Box>
          <Box>
            <Text dimColor>Press 'b' or 'q' to go back</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
