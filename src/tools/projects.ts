import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PlaneClient } from "../client.js";
import {
  cursorField,
  perPageField,
  projectIdField,
  responseFormatField,
  workspaceSlugField
} from "../schemas/common.js";
import { buildResult, errorResult, mdList } from "../format.js";
import { ResponseFormat } from "../constants.js";
import { CursorPage, PlaneProject } from "../types.js";

function projectLine(p: PlaneProject): string {
  return `**${p.name}** (\`${p.identifier}\`) — id: ${p.id}${p.description ? ` — ${p.description}` : ""}`;
}

export function registerProjectTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_list_projects",
    {
      title: "List Plane Projects",
      description: `List all projects in a workspace. This is typically the first call when acting across "multiple projects" — use it to discover project ids and identifiers (e.g. "ENG", "MKT") before calling project-scoped tools.

Args:
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG if configured.
  - cursor, per_page: pagination.

Returns paginated list of projects with id, name, identifier, description, total_members, total_cycles, total_modules.

Examples:
  - Use when: "What projects do we have?"
  - Use when: you need a project_id for another tool but only know the project's name.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        cursor: cursorField,
        per_page: perPageField,
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, cursor, per_page, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const page = await client.request<CursorPage<PlaneProject>>(
          "GET",
          `/workspaces/${slug}/projects/`,
          { params: { cursor, per_page } }
        );
        const markdown = [
          `# Projects in ${slug} (${page.total_results ?? page.results.length})`,
          "",
          mdList(page.results, projectLine),
          "",
          page.next_cursor && page.next_page_results
            ? `_More results available — pass cursor="${page.next_cursor}" for the next page._`
            : ""
        ]
          .filter(Boolean)
          .join("\n");
        return buildResult({ format: response_format, markdown, structured: page as unknown as Record<string, unknown> });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_get_project",
    {
      title: "Get Plane Project",
      description: `Get full details of a single project, including lead, default assignee, feature toggles (cycle_view, module_view, page_view), and counts of members/cycles/modules.

Args:
  - project_id (string, required): UUID from plane_list_projects.
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const project = await client.request<PlaneProject>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/`
        );
        const markdown = [
          `# ${project.name} (${project.identifier})`,
          project.description ? project.description : "_No description_",
          "",
          `- **ID**: ${project.id}`,
          `- **Members**: ${project.total_members ?? "?"}`,
          `- **Cycles**: ${project.total_cycles ?? "?"}`,
          `- **Modules**: ${project.total_modules ?? "?"}`,
          `- **Lead**: ${project.project_lead ?? "—"}`
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: project as unknown as Record<string, unknown> });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_create_project",
    {
      title: "Create Plane Project",
      description: `Create a new project in a workspace.

Args:
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG.
  - name (string, required): project name.
  - identifier (string, required): short unique key used as the prefix for work item IDs (e.g. "ENG" -> ENG-1, ENG-2). Uppercase letters/numbers, typically 2-8 chars.
  - description (string, optional).
  - network (0 | 2, optional): 0 = Secret (private, default), 2 = Public.
  - project_lead (string, optional): UUID of the workspace member who leads the project.

Returns the created project including its id (save this — most other tools require project_id).`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        name: z.string().min(1).max(255).describe("Project name."),
        identifier: z
          .string()
          .min(1)
          .max(12)
          .describe("Short unique project key used as the work-item ID prefix, e.g. 'ENG'."),
        description: z.string().optional().describe("Project description."),
        network: z.union([z.literal(0), z.literal(2)]).optional().describe("0 = Secret (private), 2 = Public."),
        project_lead: z.string().optional().describe("UUID of the workspace member leading the project.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, name, identifier, description, network, project_lead }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const project = await client.request<PlaneProject>("POST", `/workspaces/${slug}/projects/`, {
          data: { name, identifier, description, network, project_lead }
        });
        const markdown = `Created project **${project.name}** (\`${project.identifier}\`) with id \`${project.id}\`.`;
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown,
          structured: project as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_project",
    {
      title: "Update Plane Project",
      description: `Update an existing project's name, description, lead, default assignee, or visibility. Only supplied fields are changed.

Args:
  - project_id (string, required).
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG.
  - name, description, network, project_lead, default_assignee (all optional).`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        network: z.union([z.literal(0), z.literal(2)]).optional().describe("0 = Secret, 2 = Public."),
        project_lead: z.string().optional().describe("UUID of the new project lead."),
        default_assignee: z.string().optional().describe("UUID of the default assignee for new work items.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, ...updates }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const project = await client.request<PlaneProject>(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/`,
          { data: updates }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated project **${project.name}** (id \`${project.id}\`).`,
          structured: project as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_archive_project",
    {
      title: "Archive Plane Project",
      description: `Archive a project, hiding it from the default project list without deleting its data. Reversible with plane_unarchive_project.`,
      inputSchema: { workspace_slug: workspaceSlugField, project_id: projectIdField },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("POST", `/workspaces/${slug}/projects/${project_id}/archive/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Archived project \`${project_id}\`.`,
          structured: { project_id, archived: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_unarchive_project",
    {
      title: "Unarchive Plane Project",
      description: `Restore a previously archived project so it appears in the default project list again.`,
      inputSchema: { workspace_slug: workspaceSlugField, project_id: projectIdField },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("POST", `/workspaces/${slug}/projects/${project_id}/unarchive/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Unarchived project \`${project_id}\`.`,
          structured: { project_id, archived: false }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_project",
    {
      title: "Delete Plane Project",
      description: `PERMANENTLY delete a project and all its work items, cycles, modules, and history. This cannot be undone.

Only use this when the user has explicitly confirmed they want to permanently delete the project. For hiding a project without data loss, use plane_archive_project instead.`,
      inputSchema: { workspace_slug: workspaceSlugField, project_id: projectIdField },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("DELETE", `/workspaces/${slug}/projects/${project_id}/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted project \`${project_id}\`.`,
          structured: { project_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
