import type { ProjectUpdate } from "../../../linear/client.js";

/**
 * Cache for project data within a sync session
 * Prevents duplicate API calls for the same project across different phases
 * Stores all metadata from fetchProjectFullData: description, content, labels, updates
 */
export interface ProjectData {
  labels: string[];
  content: string | null;
  description?: string | null;
  updates?: ProjectUpdate[];
}

export class ProjectDataCache {
  private cache = new Map<string, ProjectData>();

  /**
   * Get cached project data
   */
  get(projectId: string): ProjectData | undefined {
    return this.cache.get(projectId);
  }

  /**
   * Set project data in cache
   */
  set(projectId: string, data: ProjectData): void {
    this.cache.set(projectId, data);
  }

  /**
   * Check if project data is cached
   */
  has(projectId: string): boolean {
    return this.cache.has(projectId);
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}
