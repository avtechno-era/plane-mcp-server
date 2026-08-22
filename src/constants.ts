// Maximum number of characters returned in a single tool response before truncation.
export const CHARACTER_LIMIT = 30000;

// Default / max page sizes for Plane's cursor pagination (server max is 100).
export const DEFAULT_PER_PAGE = 25;
export const MAX_PER_PAGE = 100;

export const WORK_ITEM_PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;

export const MODULE_STATUSES = [
  "backlog",
  "planned",
  "in-progress",
  "paused",
  "completed",
  "cancelled"
] as const;

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}
