import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PlaneClient } from "../client.js";
import { projectIdField, responseFormatField, workItemIdField, workspaceSlugField } from "../schemas/common.js";
import { buildResult, errorResult, fmtDate, mdList } from "../format.js";
import { ResponseFormat } from "../constants.js";
import { CursorPage, PlaneCycle, PlaneWorkItem } from "../types.js";

const cycleIdField = z.string().min(1).describe("UUID of the cycle (from plane_list_cycles).");

function cycleLine(c: PlaneCycle): string {
  const progress =
    c.total_issues && c.total_issues > 0
      ? `${Math.round(((c.completed_issues ?? 0) / c.total_issues) * 100)}% done (${c.completed_issues}/${c.total_issues})`
      : "no work items yet";
  return `**${c.name}** (${fmtDate(c.start_date as string)} → ${fmtDate(c.end_date as string)}) — ${c.status ?? "?"}, ${progress} — id: ${c.id}`;
}

export function registerCycleTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_list_cycles",
    {
      title: "List Plane Cycles",
      description: `List a project's cycles (sprints) with their date ranges, status, and completion counts. Use this to find the current/upcoming cycle before reporting sprint progress.`,
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
        const page = await client.request<CursorPage<PlaneCycle> | PlaneCycle[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/cycles/`
        );
        const cycles = Array.isArray(page) ? page : page.results;
        const markdown = [`# Cycles (${cycles.length})`, mdList(cycles, cycleLine)].join("\n");
        return buildResult({ format: response_format, markdown, structured: { project_id, count: cycles.length, cycles } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_get_cycle",
    {
      title: "Get Plane Cycle",
      description: `Get full details and progress counts for a single cycle (sprint).`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        cycle_id: cycleIdField,
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, cycle_id, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const cycle = await client.request<PlaneCycle>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/`
        );
        return buildResult({ format: response_format, markdown: `# ${cycleLine(cycle)}`, structured: cycle as unknown as Record<string, unknown> });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_create_cycle",
    {
      title: "Create Plane Cycle",
      description: `Create a new cycle (sprint/iteration) in a project.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        name: z.string().min(1).max(255).describe("Cycle name, e.g. 'Sprint 24'."),
        description: z.string().optional(),
        start_date: z.string().optional().describe("ISO date/datetime, e.g. '2026-08-01'."),
        end_date: z.string().optional().describe("ISO date/datetime, e.g. '2026-08-14'."),
        owned_by: z.string().optional().describe("UUID of the cycle owner; defaults to the authenticated user.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, ...body }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const cycle = await client.request<PlaneCycle>(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/cycles/`,
          { data: body }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Created cycle **${cycle.name}** with id \`${cycle.id}\`.`,
          structured: cycle as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_cycle",
    {
      title: "Update Plane Cycle",
      description: `Update a cycle's name, description, or date range.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        cycle_id: cycleIdField,
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, cycle_id, ...updates }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const cycle = await client.request<PlaneCycle>(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/`,
          { data: updates }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated cycle \`${cycle_id}\`.`,
          structured: cycle as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_cycle",
    {
      title: "Delete Plane Cycle",
      description: `Permanently delete a cycle. Work items that were in it are unassigned from the cycle, not deleted.`,
      inputSchema: { workspace_slug: workspaceSlugField, project_id: projectIdField, cycle_id: cycleIdField },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, cycle_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("DELETE", `/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted cycle \`${cycle_id}\`.`,
          structured: { cycle_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_list_cycle_work_items",
    {
      title: "List Plane Cycle Work Items",
      description: `List the work items currently assigned to a cycle — use this for sprint status/burndown style reporting.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        cycle_id: cycleIdField,
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, cycle_id, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const page = await client.request<CursorPage<PlaneWorkItem> | PlaneWorkItem[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/cycle-issues/`
        );
        const items = Array.isArray(page) ? page : page.results;
        const markdown = [
          `# Work Items in Cycle (${items.length})`,
          mdList(items, (w) => `**${w.name}** — priority: ${w.priority ?? "?"}, id: ${w.id}`)
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: { cycle_id, count: items.length, work_items: items } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_add_cycle_work_items",
    {
      title: "Add Work Items to Plane Cycle",
      description: `Assign one or more existing work items to a cycle (sprint planning). Provide the work item UUIDs; get them from plane_list_work_items or plane_search_work_items.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        cycle_id: cycleIdField,
        work_item_ids: z.array(z.string()).min(1).describe("UUIDs of work items to add to this cycle.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, cycle_id, work_item_ids }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const result = await client.request(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/cycle-issues/`,
          { data: { issues: work_item_ids } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Added ${work_item_ids.length} work item(s) to cycle \`${cycle_id}\`.`,
          structured: { cycle_id, added: work_item_ids, result } as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_remove_cycle_work_item",
    {
      title: "Remove Work Item from Plane Cycle",
      description: `Remove a single work item from a cycle without deleting the work item itself.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        cycle_id: cycleIdField,
        work_item_id: workItemIdField
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, cycle_id, work_item_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request(
          "DELETE",
          `/workspaces/${slug}/projects/${project_id}/cycles/${cycle_id}/cycle-issues/${work_item_id}/`
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Removed work item \`${work_item_id}\` from cycle \`${cycle_id}\`.`,
          structured: { cycle_id, work_item_id, removed: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
