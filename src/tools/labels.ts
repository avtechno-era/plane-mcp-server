import { McpServer } from "@modelcontextprotocol/server";
import * as z from 'zod/v4';
import { PlaneClient } from "../client.js";
import { projectIdField, responseFormatField, workspaceSlugField } from "../schemas/common.js";
import { buildResult, errorResult, mdList } from "../format.js";
import { ResponseFormat } from "../constants.js";
import { PlaneLabel } from "../types.js";

const labelIdField = z.string().min(1).describe("UUID of the label (from plane_list_labels).");

export function registerLabelTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_list_labels",
    {
      title: "List Plane Work Item Labels",
      description: `List the labels defined in a project. Use this to find a label's UUID before attaching it to a work item via plane_create_work_item or plane_update_work_item.`,
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
        const labels = await client.request<PlaneLabel[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/labels/`
        );
        const markdown = [`# Labels (${labels.length})`, mdList(labels, (l) => `**${l.name}** — id: ${l.id}`)].join(
          "\n"
        );
        return buildResult({ format: response_format, markdown, structured: { project_id, count: labels.length, labels } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_create_label",
    {
      title: "Create Plane Work Item Label",
      description: `Create a new label in a project for tagging/categorizing work items (e.g. "bug", "needs-design").`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        name: z.string().min(1).max(255).describe("Label name."),
        color: z.string().optional().describe("Hex color, e.g. '#e11d48'."),
        description: z.string().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, name, color, description }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const label = await client.request<PlaneLabel>(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/labels/`,
          { data: { name, color, description } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Created label **${label.name}** with id \`${label.id}\`.`,
          structured: label as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_label",
    {
      title: "Update Plane Work Item Label",
      description: `Rename or recolor an existing label.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        label_id: labelIdField,
        name: z.string().min(1).max(255).optional(),
        color: z.string().optional(),
        description: z.string().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, label_id, ...updates }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const label = await client.request<PlaneLabel>(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/labels/${label_id}/`,
          { data: updates }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated label \`${label_id}\`.`,
          structured: label as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_label",
    {
      title: "Delete Plane Work Item Label",
      description: `Delete a label from a project. It is automatically removed from any work items that had it applied.`,
      inputSchema: z.object({ workspace_slug: workspaceSlugField, project_id: projectIdField, label_id: labelIdField }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, label_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("DELETE", `/workspaces/${slug}/projects/${project_id}/labels/${label_id}/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted label \`${label_id}\`.`,
          structured: { label_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
