import { McpServer } from "@modelcontextprotocol/server";
import { PlaneClient } from "../client.js";
import { responseFormatField, workspaceSlugField } from "../schemas/common.js";
import { buildResult, errorResult, mdList } from "../format.js";
import { ResponseFormat } from "../constants.js";
import { PlaneUser } from "../types.js";
import * as z from 'zod/v4';

export function registerUserTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_get_current_user",
    {
      title: "Get Current Plane User",
      description: `Get the profile of the user identified by the configured PLANE_API_KEY.

Use this to confirm which account the server is authenticated as, or to get the user's own UUID for filtering "assigned to me" work items (compare against a work item's assignees array).

Returns: id, first_name, last_name, display_name, email, avatar.

Examples:
  - Use when: "Who am I connected to Plane as?"
  - Use when: you need your own user UUID before filtering work items by assignee.`,
      inputSchema: z.object({ response_format: responseFormatField }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ response_format }) => {
      try {
        const user = await client.request<PlaneUser>("GET", "/users/me/");
        const markdown = [
          `# ${user.display_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Current User"}`,
          `- **ID**: ${user.id}`,
          `- **Email**: ${user.email || "—"}`
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: user as unknown as Record<string, unknown> });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_list_workspace_members",
    {
      title: "List Plane Workspace Members",
      description: `List all users who are members of a workspace.

Use this to resolve a person's name/email to the UUID needed by tools like plane_create_work_item (assignees), plane_add_project_member, or plane_advanced_search_work_items filters.

Args:
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG if configured.

Returns: array of { id, first_name, last_name, display_name, email, role }. role is a numeric permission level (Plane convention: 5=Guest, 10=Viewer, 15=Member, 20=Admin).

Examples:
  - Use when: "Assign this to Priya" -> look up Priya's UUID here first.
  - Use when: "Who's in this workspace?"`,
      inputSchema: z.object({ workspace_slug: workspaceSlugField, response_format: responseFormatField }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const members = await client.request<PlaneUser[]>("GET", `/workspaces/${slug}/members/`);
        const markdown = [
          `# Workspace Members: ${slug}`,
          "",
          mdList(members, (m) => `**${m.display_name || m.email}** (${m.id}) — ${m.email || "no email"}, role ${m.role ?? "?"}`)
        ].join("\n");
        return buildResult({
          format: response_format,
          markdown,
          structured: { workspace_slug: slug, count: members.length, members }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}

