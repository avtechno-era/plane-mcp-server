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
import { buildResult, errorResult, mdList, truncateText, fmtDate } from "../format.js";
import { ResponseFormat } from "../constants.js";
import { CursorPage, PlanePage } from "../types.js";

const pageIdField = z
  .string()
  .min(1)
  .describe("UUID of the page (from plane_list_pages or plane_create_page).");

const pageAccessField = z
  .enum(["public", "private"])
  .optional()
  .describe("Page access level: 'public' (accessible to all workspace members) or 'private' (only to creator and explicitly added members).");

function pageLine(p: PlanePage): string {
  const accessLabel = p.access ? (p.access === 0 ? "public" : "private") : "?";
  const createdLabel = p.created_at ? fmtDate(p.created_at) : "?";
  return `**${p.name}** — access: ${accessLabel}, created: ${createdLabel}, id: ${p.id}${
    p.description ? ` — ${truncateText(p.description, 100)}` : ""
  }`;
}

export function registerPageTools(server: McpServer, client: PlaneClient): void {
  /**
   * Workspace-level pages: documentation accessible across all projects in a workspace.
   */

  server.registerTool(
    "plane_list_workspace_pages",
    {
      title: "List Workspace Pages",
      description: `List all pages at the workspace level, accessible across all projects. These are shared documentation pages visible to the entire workspace.

Args:
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG.
  - cursor, per_page: pagination.

Returns paginated workspace pages with id, name, description, access level, and creation date.`,
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
        const page = await client.request<CursorPage<PlanePage>>(
          "GET",
          `/workspaces/${slug}/pages/`,
          { params: { cursor, per_page } }
        );
        const markdown = [
          `# Workspace Pages (${page.total_results ?? page.results.length})`,
          "",
          mdList(page.results, pageLine),
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
    "plane_get_workspace_page",
    {
      title: "Get Workspace Page",
      description: `Get the full details and content of a single workspace-level page by its UUID.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        page_id: pageIdField,
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, page_id, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const p = await client.request<PlanePage>(
          "GET",
          `/workspaces/${slug}/pages/${page_id}/`
        );
        const markdown = [
          `# ${p.name}`,
          `- **ID**: ${p.id}`,
          `- **Access**: ${p.access === 0 ? "public" : p.access === 1 ? "private" : "?"}`,
          `- **Created**: ${fmtDate(p.created_at as string)}${p.updated_at ? ` — Updated: ${fmtDate(p.updated_at)}` : ""}`,
          `- **Created by**: ${p.created_by ?? "?"}`,
          "",
          p.description_html ? truncateText(p.description_html, 2000) : "_No description_"
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: p as unknown as Record<string, unknown> });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_create_workspace_page",
    {
      title: "Create Workspace Page",
      description: `Create a new documentation page at the workspace level, accessible across all projects.

Args:
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG.
  - name (string, required): page title.
  - description_html (string, optional): HTML content of the page, e.g. '<p>Documentation here...</p>'.
  - access (0 | 1, optional): 0 = public (default), 1 = private.

Returns the created page with its id.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        name: z.string().min(1).max(255).describe("Page title."),
        description_html: z.string().optional().describe("HTML page content, e.g. '<p>Documentation...</p>'."),
        access: z.union([z.literal(0), z.literal(1)]).optional().describe("0 = public (default), 1 = private.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, name, description_html, access }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const p = await client.request<PlanePage>(
          "POST",
          `/workspaces/${slug}/pages/`,
          { data: { name, description_html, access } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Created workspace page **${p.name}** (id \`${p.id}\`, access: ${p.access === 0 ? "public" : "private"}).`,
          structured: p as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_workspace_page",
    {
      title: "Update Workspace Page",
      description: `Update a workspace-level page's name, description, or access level. Only supplied fields are changed.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        page_id: pageIdField,
        name: z.string().min(1).max(255).optional(),
        description_html: z.string().optional(),
        access: z.union([z.literal(0), z.literal(1)]).optional().describe("0 = public, 1 = private.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, page_id, ...updates }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const p = await client.request<PlanePage>(
          "PATCH",
          `/workspaces/${slug}/pages/${page_id}/`,
          { data: updates }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated workspace page \`${page_id}\`.`,
          structured: p as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_workspace_page",
    {
      title: "Delete Workspace Page",
      description: `Permanently delete a workspace-level page. This cannot be undone. Confirm with the user before calling this unless they were explicit.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        page_id: pageIdField
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, page_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("DELETE", `/workspaces/${slug}/pages/${page_id}/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted workspace page \`${page_id}\`.`,
          structured: { page_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  /**
   * Project-level pages: documentation specific to individual projects.
   */

  server.registerTool(
    "plane_list_project_pages",
    {
      title: "List Project Pages",
      description: `List all pages at the project level, specific to an individual project.

Args:
  - project_id (string, required): UUID of the project.
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG.
  - cursor, per_page: pagination.

Returns paginated project pages with id, name, description, access level, and creation date.`,
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
        const page = await client.request<CursorPage<PlanePage>>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/pages/`,
          { params: { cursor, per_page } }
        );
        const markdown = [
          `# Project Pages (${page.total_results ?? page.results.length})`,
          "",
          mdList(page.results, pageLine),
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
    "plane_get_project_page",
    {
      title: "Get Project Page",
      description: `Get the full details and content of a single project-level page by its UUID.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        page_id: pageIdField,
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, page_id, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const p = await client.request<PlanePage>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/pages/${page_id}/`
        );
        const markdown = [
          `# ${p.name}`,
          `- **ID**: ${p.id}`,
          `- **Access**: ${p.access === 0 ? "public" : p.access === 1 ? "private" : "?"}`,
          `- **Created**: ${fmtDate(p.created_at as string)}${p.updated_at ? ` — Updated: ${fmtDate(p.updated_at)}` : ""}`,
          `- **Created by**: ${p.created_by ?? "?"}`,
          "",
          p.description_html ? truncateText(p.description_html, 2000) : "_No description_"
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: p as unknown as Record<string, unknown> });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_create_project_page",
    {
      title: "Create Project Page",
      description: `Create a new documentation page at the project level, specific to this project only.

Args:
  - project_id (string, required): UUID of the project.
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG.
  - name (string, required): page title.
  - description_html (string, optional): HTML content of the page.
  - access (0 | 1, optional): 0 = public (default), 1 = private.

Returns the created page with its id.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        name: z.string().min(1).max(255).describe("Page title."),
        description_html: z.string().optional().describe("HTML page content."),
        access: z.union([z.literal(0), z.literal(1)]).optional().describe("0 = public (default), 1 = private.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, name, description_html, access }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const p = await client.request<PlanePage>(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/pages/`,
          { data: { name, description_html, access } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Created project page **${p.name}** (id \`${p.id}\`, access: ${p.access === 0 ? "public" : "private"}).`,
          structured: p as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_project_page",
    {
      title: "Update Project Page",
      description: `Update a project-level page's name, description, or access level. Only supplied fields are changed.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        page_id: pageIdField,
        name: z.string().min(1).max(255).optional(),
        description_html: z.string().optional(),
        access: z.union([z.literal(0), z.literal(1)]).optional().describe("0 = public, 1 = private.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, page_id, ...updates }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const p = await client.request<PlanePage>(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/pages/${page_id}/`,
          { data: updates }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated project page \`${page_id}\`.`,
          structured: p as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_project_page",
    {
      title: "Delete Project Page",
      description: `Permanently delete a project-level page. This cannot be undone. Confirm with the user before calling this unless they were explicit.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        page_id: pageIdField
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, page_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("DELETE", `/workspaces/${slug}/projects/${project_id}/pages/${page_id}/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted project page \`${page_id}\`.`,
          structured: { page_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
