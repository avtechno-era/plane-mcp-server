import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PlaneClient } from "../client.js";
import { cursorField, perPageField, projectIdField, responseFormatField, workspaceSlugField } from "../schemas/common.js";
import { buildResult, errorResult, mdList } from "../format.js";
import { ResponseFormat } from "../constants.js";
import { CursorPage, PlaneIntakeIssue } from "../types.js";

const intakeIssueIdField = z.string().min(1).describe("UUID of the intake issue record (from plane_list_intake_issues).");

// Plane intake status codes: -2 Pending, -1 Rejected, 0 Snoozed, 1 Accepted, 2 Duplicate.
const intakeStatusField = z
  .union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)])
  .describe("Triage status: -2 Pending, -1 Rejected, 0 Snoozed, 1 Accepted, 2 Duplicate.");

export function registerIntakeTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_list_intake_issues",
    {
      title: "List Plane Intake Issues",
      description: `List work items sitting in a project's Intake — a triage queue for incoming requests/bugs before they're accepted into the backlog. Use this to help the user process their triage queue.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        cursor: cursorField,
        per_page: perPageField,
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, cursor, per_page, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const page = await client.request<CursorPage<PlaneIntakeIssue> | PlaneIntakeIssue[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/intake-issues/`,
          { params: { cursor, per_page } }
        );
        const items = Array.isArray(page) ? page : page.results;
        const markdown = [
          `# Intake Queue (${items.length})`,
          mdList(items, (i) => `**${i.issue?.name ?? i.id}** — status: ${i.status ?? "?"}, source: ${i.source ?? "?"}, id: ${i.id}`)
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: { project_id, count: items.length, intake_issues: items } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_add_intake_issue",
    {
      title: "Add Plane Intake Issue",
      description: `Submit a new work item into a project's Intake triage queue (rather than creating it directly in the backlog via plane_create_work_item). Useful for logging incoming requests that need review before being accepted.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        name: z.string().min(1).max(255).describe("Title of the incoming request/bug."),
        description_html: z.string().optional().describe("HTML description."),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, name, description_html, priority }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const created = await client.request<PlaneIntakeIssue>(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/intake-issues/`,
          { data: { issue: { name, description_html, priority } } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Added intake issue \`${created.id}\`.`,
          structured: created as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_intake_issue",
    {
      title: "Update Plane Intake Issue",
      description: `Triage an intake issue: accept it into the backlog, reject it, snooze it, or mark it a duplicate.

Args:
  - status (required): -2 Pending, -1 Rejected, 0 Snoozed, 1 Accepted, 2 Duplicate.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        intake_issue_id: intakeIssueIdField,
        status: intakeStatusField
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, intake_issue_id, status }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const updated = await client.request<PlaneIntakeIssue>(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/intake-issues/${intake_issue_id}/`,
          { data: { status } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated intake issue \`${intake_issue_id}\` to status ${status}.`,
          structured: updated as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
