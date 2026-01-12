/**
 * GetDX API Client
 *
 * Authenticated HTTP client for the GetDX API.
 * Uses bearer token authentication via GETDX_API_KEY environment variable.
 */

export interface GetDXClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface GetDXError {
  ok: false;
  error: string;
  code?: string;
}

export interface GetDXResponse<T> {
  ok: true;
  data: T;
}

export type GetDXResult<T> = GetDXResponse<T> | GetDXError;

/**
 * Datafeed response from queries.datafeed
 */
export interface DatafeedResponse {
  ok: boolean;
  data: {
    rows: string[][];
    columns: string[];
  };
}

/**
 * PR Throughput data row (parsed from datafeed)
 */
export interface PRThroughputRow {
  day: string;
  teamName: string;
  throughput: number;
  prCount: number;
}

/**
 * Get the GetDX API key from environment
 */
export function getGetDXApiKey(): string | null {
  if (typeof process === "undefined" || !process.env) {
    return null;
  }
  return process.env.GETDX_API_KEY || null;
}

/**
 * Get the PR Throughput datafeed token from environment
 */
export function getPRThroughputFeedToken(): string | null {
  if (typeof process === "undefined" || !process.env) {
    return null;
  }
  return process.env.GETDX_PR_THROUGHPUT_FEED_TOKEN || null;
}

/**
 * Check if GetDX integration is configured
 */
export function isGetDXConfigured(): boolean {
  return getGetDXApiKey() !== null;
}

/**
 * Check if PR Throughput datafeed is configured
 */
export function isPRThroughputConfigured(): boolean {
  return isGetDXConfigured() && getPRThroughputFeedToken() !== null;
}

/**
 * GetDX API Client
 */
export class GetDXClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: GetDXClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.getdx.com";
  }

  /**
   * Create a client from environment configuration
   */
  static fromEnv(): GetDXClient | null {
    const apiKey = getGetDXApiKey();
    if (!apiKey) {
      return null;
    }
    return new GetDXClient({ apiKey });
  }

  /**
   * Make an authenticated GET request to the GetDX API
   */
  async get<T>(
    endpoint: string,
    params?: Record<string, string>
  ): Promise<GetDXResult<T>> {
    try {
      const url = new URL(endpoint, this.baseUrl);
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          url.searchParams.set(key, value);
        }
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GETDX] API error (${response.status}): ${errorText}`);
        return {
          ok: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          code: `HTTP_${response.status}`,
        };
      }

      const data = await response.json();
      return { ok: true, data: data as T };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[GETDX] Request failed: ${errorMessage}`);
      return {
        ok: false,
        error: errorMessage,
        code: "REQUEST_FAILED",
      };
    }
  }

  /**
   * Make an authenticated POST request to the GetDX API
   */
  async post<T>(endpoint: string, body?: unknown): Promise<GetDXResult<T>> {
    try {
      const url = new URL(endpoint, this.baseUrl);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GETDX] API error (${response.status}): ${errorText}`);
        return {
          ok: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          code: `HTTP_${response.status}`,
        };
      }

      const data = await response.json();
      return { ok: true, data: data as T };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[GETDX] Request failed: ${errorMessage}`);
      return {
        ok: false,
        error: errorMessage,
        code: "REQUEST_FAILED",
      };
    }
  }

  /**
   * Fetch PR Throughput data from the datafeed
   */
  async fetchPRThroughput(): Promise<GetDXResult<PRThroughputRow[]>> {
    const feedToken = getPRThroughputFeedToken();
    if (!feedToken) {
      return {
        ok: false,
        error: "GETDX_PR_THROUGHPUT_FEED_TOKEN not configured",
        code: "NOT_CONFIGURED",
      };
    }

    const result = await this.get<DatafeedResponse>(
      `/queries.datafeed?feed_token=${feedToken}`
    );

    if (!result.ok) {
      return result;
    }

    // Parse the rows into typed objects
    // Expected columns: ["day", "team_name", "throughput", "pr_count"]
    const rows: PRThroughputRow[] = result.data.data.rows.map((row) => ({
      day: row[0],
      teamName: row[1],
      throughput: parseFloat(row[2]) || 0,
      prCount: parseInt(row[3], 10) || 0,
    }));

    return { ok: true, data: rows };
  }

  /**
   * Fetch PR Throughput aggregated by team for the last N days
   */
  async fetchPRThroughputByTeam(
    days: number = 7
  ): Promise<
    GetDXResult<
      Map<string, { throughput: number; prCount: number; avgDaily: number }>
    >
  > {
    const result = await this.fetchPRThroughput();
    if (!result.ok) {
      return result;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    // Filter to last N days and aggregate by team
    const teamData = new Map<
      string,
      { throughput: number; prCount: number; days: Set<string> }
    >();

    for (const row of result.data) {
      const rowDate = row.day.split(" ")[0]; // "2026-01-05 00:00:00" -> "2026-01-05"
      if (rowDate < cutoffStr) continue;

      const existing = teamData.get(row.teamName) || {
        throughput: 0,
        prCount: 0,
        days: new Set<string>(),
      };
      existing.throughput += row.throughput;
      existing.prCount += row.prCount;
      existing.days.add(rowDate);
      teamData.set(row.teamName, existing);
    }

    // Convert to final format with daily average
    const aggregated = new Map<
      string,
      { throughput: number; prCount: number; avgDaily: number }
    >();
    for (const [team, data] of teamData) {
      const numDays = data.days.size || 1;
      aggregated.set(team, {
        throughput: Math.round(data.throughput * 100) / 100,
        prCount: data.prCount,
        avgDaily: Math.round((data.throughput / numDays) * 100) / 100,
      });
    }

    return { ok: true, data: aggregated };
  }

  /**
   * Get org-wide PR Throughput totals for the last N days
   */
  async fetchOrgPRThroughput(
    days: number = 7
  ): Promise<
    GetDXResult<{
      throughput: number;
      prCount: number;
      avgDaily: number;
      teamCount: number;
    }>
  > {
    const result = await this.fetchPRThroughputByTeam(days);
    if (!result.ok) {
      return result;
    }

    let totalThroughput = 0;
    let totalPRCount = 0;
    let teamCount = 0;

    for (const data of result.data.values()) {
      totalThroughput += data.throughput;
      totalPRCount += data.prCount;
      teamCount++;
    }

    return {
      ok: true,
      data: {
        throughput: Math.round(totalThroughput * 100) / 100,
        prCount: totalPRCount,
        avgDaily: Math.round((totalThroughput / days) * 100) / 100,
        teamCount,
      },
    };
  }
}
