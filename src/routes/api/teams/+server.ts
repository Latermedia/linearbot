import { json } from "@sveltejs/kit";
import { getAllEngineers, getTeamKeysByName } from "../../../db/queries.js";
import { getDomainMappings } from "../../../utils/domain-mapping.js";
import type { RequestHandler } from "./$types";

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  teamKeys: string[];
  teamNames: string[];
  wipCount: number;
  isFromMapping: boolean; // true if from ENGINEER_TEAM_MAPPING, false if from DB
}

export interface Team {
  teamKey: string;
  teamName: string | null;
  domain: string | null;
  members: TeamMember[];
}

export interface Domain {
  name: string;
  teams: Team[];
}

export interface ValidationError {
  type: "duplicate_engineer";
  engineer: string;
  teams: string[];
  message: string;
}

export interface DatabaseEngineer {
  id: string;
  name: string;
  avatarUrl: string | null;
  wipCount: number;
  teamNames: string[];
  suggestedTeamKey: string | null; // Auto-detected from their issues
}

export interface TeamsResponse {
  domains: Domain[];
  unassignedTeams: Team[];
  engineerTeamMapping: Record<string, string>;
  teamDomainMappings: Record<string, string>;
  validationErrors: ValidationError[];
  allEngineers: DatabaseEngineer[]; // All engineers from the database
}

export const GET: RequestHandler = async () => {
  const validationErrors: ValidationError[] = [];

  // Load engineer-to-team mapping from environment variable
  // Track all occurrences to detect duplicates
  const engineerTeamMapping: Record<string, string> = {};
  const engineerOccurrences: Record<string, string[]> = {};

  if (process.env.ENGINEER_TEAM_MAPPING) {
    const pairs = process.env.ENGINEER_TEAM_MAPPING.split(",");
    for (const pair of pairs) {
      const [engineer, teamKey] = pair.split(":").map((s) => s.trim());
      if (engineer && teamKey) {
        // Track all occurrences for validation
        if (!engineerOccurrences[engineer]) {
          engineerOccurrences[engineer] = [];
        }
        engineerOccurrences[engineer].push(teamKey);

        // Store the first mapping (or last - doesn't matter, it's invalid anyway)
        engineerTeamMapping[engineer] = teamKey;
      }
    }
  }

  // Validate: check for duplicate engineer mappings
  for (const [engineer, teams] of Object.entries(engineerOccurrences)) {
    if (teams.length > 1) {
      validationErrors.push({
        type: "duplicate_engineer",
        engineer,
        teams,
        message: `Engineer "${engineer}" is mapped to multiple teams: ${teams.join(", ")}`,
      });
    }
  }

  // Get team-to-domain mappings
  const teamDomainMappings = getDomainMappings();

  // Get team_name -> team_key mapping from database
  const teamKeysByName = getTeamKeysByName();

  // Get all engineers from DB
  const engineers = getAllEngineers();

  // Build a map of team key -> team info
  const teamsMap = new Map<string, Team>();

  // Initialize teams from domain mappings
  for (const [teamKey, domain] of Object.entries(teamDomainMappings)) {
    teamsMap.set(teamKey, {
      teamKey,
      teamName: null, // Will be filled from engineer data
      domain,
      members: [],
    });
  }

  // Add teams from engineer mapping that might not be in domain mappings
  for (const teamKey of Object.values(engineerTeamMapping)) {
    if (!teamsMap.has(teamKey)) {
      teamsMap.set(teamKey, {
        teamKey,
        teamName: null,
        domain: null,
        members: [],
      });
    }
  }

  // Create a set of engineer names that are in the mapping
  const mappedEngineerNames = new Set(Object.keys(engineerTeamMapping));

  // Process engineers from the database
  for (const engineer of engineers) {
    const teamNames: string[] = JSON.parse(engineer.team_names || "[]");

    const member: TeamMember = {
      id: engineer.assignee_id,
      name: engineer.assignee_name,
      avatarUrl: engineer.avatar_url,
      teamKeys: [],
      teamNames,
      wipCount: engineer.wip_issue_count,
      isFromMapping: mappedEngineerNames.has(engineer.assignee_name),
    };

    // If engineer is in the mapping, add them to that team
    if (engineerTeamMapping[engineer.assignee_name]) {
      const teamKey = engineerTeamMapping[engineer.assignee_name];
      member.teamKeys.push(teamKey);

      if (!teamsMap.has(teamKey)) {
        teamsMap.set(teamKey, {
          teamKey,
          teamName: null,
          domain: teamDomainMappings[teamKey] || null,
          members: [],
        });
      }

      const team = teamsMap.get(teamKey)!;
      team.members.push(member);

      // Update team name from engineer's team names if not set
      if (!team.teamName && teamNames.length > 0) {
        team.teamName = teamNames[0];
      }
    }
  }

  // Also add engineers from the mapping who might not be in the DB yet (no active WIP)
  for (const [engineerName, teamKey] of Object.entries(engineerTeamMapping)) {
    const team = teamsMap.get(teamKey);
    if (team) {
      const existingMember = team.members.find((m) => m.name === engineerName);
      if (!existingMember) {
        team.members.push({
          id: `mapped-${engineerName}`,
          name: engineerName,
          avatarUrl: null,
          teamKeys: [teamKey],
          teamNames: [],
          wipCount: 0,
          isFromMapping: true,
        });
      }
    }
  }

  // Group teams by domain
  const domainMap = new Map<string, Domain>();
  const unassignedTeams: Team[] = [];

  for (const team of teamsMap.values()) {
    // Sort members by name
    team.members.sort((a, b) => a.name.localeCompare(b.name));

    if (team.domain) {
      if (!domainMap.has(team.domain)) {
        domainMap.set(team.domain, {
          name: team.domain,
          teams: [],
        });
      }
      domainMap.get(team.domain)!.teams.push(team);
    } else {
      unassignedTeams.push(team);
    }
  }

  // Sort domains alphabetically, and teams within domains
  const domains = Array.from(domainMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const domain of domains) {
    domain.teams.sort((a, b) => a.teamKey.localeCompare(b.teamKey));
  }
  unassignedTeams.sort((a, b) => a.teamKey.localeCompare(b.teamKey));

  // Build list of all engineers from the database (for the add engineer dropdown)
  // Include suggested team key based on their team_names
  const allEngineers: DatabaseEngineer[] = engineers
    .map((e) => {
      const teamNames: string[] = JSON.parse(e.team_names || "[]");
      // Find the first team_name that maps to a known team_key
      let suggestedTeamKey: string | null = null;
      for (const teamName of teamNames) {
        if (teamKeysByName[teamName]) {
          suggestedTeamKey = teamKeysByName[teamName];
          break;
        }
      }
      return {
        id: e.assignee_id,
        name: e.assignee_name,
        avatarUrl: e.avatar_url,
        wipCount: e.wip_issue_count,
        teamNames,
        suggestedTeamKey,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return json({
    domains,
    unassignedTeams,
    engineerTeamMapping,
    teamDomainMappings,
    validationErrors,
    allEngineers,
  } as TeamsResponse);
};
