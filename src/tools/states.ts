import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PlaneClient } from "../client.js";
import { projectIdField, responseFormatField, workspaceSlugField } from "../schemas/common.js";
import { buildResult, errorResult, mdList } from "../format.js";
import { ResponseFormat } from "../constants.js";
import { PlaneState } from "../types.js";

const stateIdField = z.string().min(1).describe("UUID of the state (from plane_list_states).");
const stateGroupField = z
  .enum(["backlog", "unstarted", "started", "completed", "cancelled"])
  .describe("The workflow group this state belongs to; drives board columns and 'done' calculations.");

/**
 * Plane's states endpoint has returned a bare array in some deployments and a
 * `{ results: [...] }` / group-keyed object (e.g. `{ backlog: [...], started: [...] }`)
 * in others. Normalize defensively instead of assuming the shape.
 */
function extractStates(raw: unknown): PlaneState[] {
  if (Array.isArray(raw)) return raw as PlaneState[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as PlaneState[];
    const values = Object.values(obj);
    if (values.every((v) => Array.isArray(v))) {
      return (values as PlaneState[][]).flat();
    }
  }
  return [];
}

export function registerStateTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_list_states",
    {
      title: "List Plane Work Item States",
      description: `List the workflow states (columns) configured for a project, e.g. Backlog, Todo, In Progress, Done, Cancelled. Each state belongs to a group (backlog/unstarted/started/completed/cancelled) used for progress reporting.

Use this before plane_create_work_item or plane_update_work_item if you need a state's UUID rather than its name.`,
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
        const raw = await client.request<unknown>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/states/`
        );
        const states = extractStates(raw);
        const markdown = [
          `# States (${states.length})`,
          mdList(states, (s) => `**${s.name}** (${s.group}) — id: ${s.id}${s.default ? " _[default]_" : ""}`)
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: { project_id, count: states.length, states } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_create_state",
    {
      title: "Create Plane Work Item State",
      description: `Create a new custom workflow state (board column) in a project.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        name: z.string().min(1).max(255).describe("State name, e.g. 'In Review'."),
        group: stateGroupField,
        color: z.string().optional().describe("Hex color, e.g. '#5e6ad2'."),
        description: z.string().optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, name, group, color, description }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const state = await client.request<PlaneState>(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/states/`,
          { data: { name, group, color, description } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Created state **${state.name}** with id \`${state.id}\`.`,
          structured: state as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_state",
    {
      title: "Update Plane Work Item State",
      description: `Rename, recolor, or regroup an existing workflow state.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        state_id: stateIdField,
        name: z.string().min(1).max(255).optional(),
        group: stateGroupField.optional(),
        color: z.string().optional(),
        description: z.string().optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, state_id, ...updates }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const state = await client.request<PlaneState>(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/states/${state_id}/`,
          { data: updates }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated state \`${state_id}\`.`,
          structured: state as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_state",
    {
      title: "Delete Plane Work Item State",
      description: `Delete a workflow state. Plane will typically refuse this if work items still reference it — move or update those work items to another state first.`,
      inputSchema: { workspace_slug: workspaceSlugField, project_id: projectIdField, state_id: stateIdField },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, state_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("DELETE", `/workspaces/${slug}/projects/${project_id}/states/${state_id}/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted state \`${state_id}\`.`,
          structured: { state_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
