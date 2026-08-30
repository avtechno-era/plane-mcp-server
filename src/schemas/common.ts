import * as z from 'zod/v4';
import { DEFAULT_PER_PAGE, MAX_PER_PAGE, ResponseFormat } from "../constants.js";

/** Every tool accepts an optional workspace_slug; falls back to PLANE_WORKSPACE_SLUG if omitted. */
export const workspaceSlugField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace slug (found in the Plane URL, e.g. 'my-team' in https://plane.example.com/my-team/projects/). " +
      "Optional if PLANE_WORKSPACE_SLUG is configured on the server; required otherwise."
  );

export const projectIdField = z
  .string()
  .min(1)
  .describe("UUID of the project (from plane_list_projects).");

export const workItemIdField = z
  .string()
  .min(1)
  .describe("UUID of the work item (from plane_list_work_items, plane_create_work_item, or plane_search_work_items).");

export const responseFormatField = z
  .enum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' for human-readable text (default) or 'json' for machine-readable structured data.");

export const cursorField = z
  .string()
  .optional()
  .describe("Pagination cursor from a previous response's next_cursor field. Omit to get the first page.");

export const perPageField = z
  .number()
  .int()
  .min(1)
  .max(MAX_PER_PAGE)
  .default(DEFAULT_PER_PAGE)
  .describe(`Number of results per page (1-${MAX_PER_PAGE}, default ${DEFAULT_PER_PAGE}).`);

export const expandField = z
  .string()
  .optional()
  .describe(
    "Comma-separated list of related fields to expand in the response, e.g. 'assignees,state,labels'. " +
      "Without this, related objects are returned as UUIDs only."
  );
