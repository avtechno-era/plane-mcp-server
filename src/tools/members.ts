import { McpServer } from "@modelcontextprotocol/server";
import * as z from 'zod/v4';
import { PlaneClient } from "../client.js";
import { projectIdField, responseFormatField, workspaceSlugField } from "../schemas/common.js";
import { buildResult, errorResult, mdList } from "../format.js";
import { ResponseFormat } from "../constants.js";
import { PlaneUser } from "../types.js";

export function registerMemberTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_list_project_members",
    {
      title: "List Plane Project Members",
      description: `List the members of a specific project (a subset of the workspace's members). Use plane_list_workspace_members to see everyone in the workspace, and this tool to see who is actually staffed on a given project.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        response_format: responseFormatField
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const members = await client.request<PlaneUser[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/project-members/`
        );
        const markdown = [
          `# Project Members (${members.length})`,
          mdList(members, (m) => `**${m.display_name || m.email}** (${m.id}) — ${m.email || "no email"}`)
        ].join("\n");
        return buildResult({
          format: response_format,
          markdown,
          structured: { project_id, count: members.length, members }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_add_project_member",
    {
      title: "Add Plane Project Member",
      description: `Add an existing workspace member to a project so they can be assigned work items in it. The user must already be a workspace member (see plane_list_workspace_members) — this does not invite new users to the workspace.

Args:
  - member_id (string, required): UUID of the workspace member to add.
  - role (integer, optional): permission level in the project. Plane convention: 5=Guest, 10=Viewer, 15=Member, 20=Admin. Defaults to Member (15) if omitted.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        member_id: z.string().min(1).describe("UUID of the workspace member to add to the project."),
        role: z.number().int().optional().describe("Permission level: 5=Guest, 10=Viewer, 15=Member, 20=Admin.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, member_id, role }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const result = await client.request(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/project-members/`,
          { data: { member: member_id, role } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Added member \`${member_id}\` to project \`${project_id}\`.`,
          structured: result as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_project_member",
    {
      title: "Update Plane Project Member Role",
      description: `Change a project member's role (permission level).`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        member_id: z.string().min(1).describe("UUID of the project member record to update."),
        role: z.number().int().describe("New permission level: 5=Guest, 10=Viewer, 15=Member, 20=Admin.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, member_id, role }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const result = await client.request(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/project-members/${member_id}/`,
          { data: { role } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated member \`${member_id}\` role to ${role}.`,
          structured: result as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_remove_project_member",
    {
      title: "Remove Plane Project Member",
      description: `Remove a member from a project. They remain a workspace member but lose access to this specific project and are unassigned from its work items.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        member_id: z.string().min(1).describe("UUID of the project member record to remove.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, member_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("DELETE", `/workspaces/${slug}/projects/${project_id}/project-members/${member_id}/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Removed member \`${member_id}\` from project \`${project_id}\`.`,
          structured: { project_id, member_id, removed: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
