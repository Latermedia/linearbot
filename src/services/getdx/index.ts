/**
 * GetDX Integration Service
 *
 * Provides access to GetDX API for productivity metrics.
 */

export {
  GetDXClient,
  isGetDXConfigured,
  getGetDXApiKey,
  isPRThroughputConfigured,
  getPRThroughputFeedToken,
} from "./client.js";
export type {
  GetDXClientConfig,
  GetDXError,
  GetDXResponse,
  GetDXResult,
  DatafeedResponse,
  PRThroughputRow,
} from "./client.js";

export {
  fetchProductivityMetrics,
  aggregateOrgProductivity,
} from "./snapshots.js";
export type {
  GetDXTeamProductivity,
  GetDXSnapshotResponse,
  ProductivityMetrics,
  FetchProductivityResult,
} from "./snapshots.js";
