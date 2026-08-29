import { McpServer } from "@modelcontextprotocol/server";
import * as z from 'zod/v4';
import { PlaneClient } from "../client.js";
import { projectIdField, responseFormatField, workItemIdField, workspaceSlugField } from "../schemas/common.js";
import { buildResult, errorResult, fmtDate, mdList } from "../format.js";
import { ResponseFormat, MODULE_STATUSES } from "../constants.js";
import { CursorPage, PlaneModule, PlaneWorkItem } from "../types.js";

const moduleIdField = z.string().min(1).describe("UUID of the module (from plane_list_modules).");
const moduleStatusField = z.enum(MODULE_STATUSES).describe("Module status.");

function moduleLine(m: PlaneModule): string {
  const progress =
    m.total_issues && m.total_issues > 0
      ? `${Math.round(((m.completed_issues ?? 0) / m.total_issues) * 100)}% done (${m.completed_issues}/${m.total_issues})`
      : "no work items yet";
  return `**${m.name}** (${fmtDate(m.start_date as string)} → ${fmtDate(m.target_date as string)}) — ${m.status ?? "?"}, ${progress} — id: ${m.id}`;
}

export function registerModuleTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_list_modules",
    {
      title: "List Plane Modules",
      description: `List a project's modules (feature groupings that can span multiple cycles) with status and completion counts.`,
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
        const page = await client.request<CursorPage<PlaneModule> | PlaneModule[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/modules/`
        );
        const modules = Array.isArray(page) ? page : page.results;
        const markdown = [`# Modules (${modules.length})`, mdList(modules, moduleLine)].join("\n");
        return buildResult({ format: response_format, markdown, structured: { project_id, count: modules.length, modules } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_get_module",
    {
      title: "Get Plane Module",
      description: `Get full details and progress counts for a single module.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        module_id: moduleIdField,
        response_format: responseFormatField
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, module_id, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const mod = await client.request<PlaneModule>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/modules/${module_id}/`
        );
        return buildResult({ format: response_format, markdown: `# ${moduleLine(mod)}`, structured: mod as unknown as Record<string, unknown> });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_create_module",
    {
      title: "Create Plane Module",
      description: `Create a new module (feature/workstream grouping) in a project.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        name: z.string().min(1).max(255).describe("Module name, e.g. 'Onboarding revamp'."),
        description: z.string().optional(),
        start_date: z.string().optional().describe("ISO date, e.g. '2026-08-01'."),
        target_date: z.string().optional().describe("ISO date, e.g. '2026-09-01'."),
        status: moduleStatusField.optional(),
        lead: z.string().optional().describe("UUID of the module lead."),
        members: z.array(z.string()).optional().describe("UUIDs of members working on this module.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, ...body }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const mod = await client.request<PlaneModule>(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/modules/`,
          { data: body }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Created module **${mod.name}** with id \`${mod.id}\`.`,
          structured: mod as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_module",
    {
      title: "Update Plane Module",
      description: `Update a module's name, description, dates, status, lead, or member list.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        module_id: moduleIdField,
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        start_date: z.string().optional(),
        target_date: z.string().optional(),
        status: moduleStatusField.optional(),
        lead: z.string().optional(),
        members: z.array(z.string()).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, module_id, ...updates }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const mod = await client.request<PlaneModule>(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/modules/${module_id}/`,
          { data: updates }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated module \`${module_id}\`.`,
          structured: mod as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_module",
    {
      title: "Delete Plane Module",
      description: `Permanently delete a module. Work items that were in it are unassigned from the module, not deleted.`,
      inputSchema: z.object({ workspace_slug: workspaceSlugField, project_id: projectIdField, module_id: moduleIdField }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, module_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("DELETE", `/workspaces/${slug}/projects/${project_id}/modules/${module_id}/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted module \`${module_id}\`.`,
          structured: { module_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_list_module_work_items",
    {
      title: "List Plane Module Work Items",
      description: `List the work items currently assigned to a module.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        module_id: moduleIdField,
        response_format: responseFormatField
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, module_id, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const page = await client.request<CursorPage<PlaneWorkItem> | PlaneWorkItem[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/modules/${module_id}/module-issues/`
        );
        const items = Array.isArray(page) ? page : page.results;
        const markdown = [
          `# Work Items in Module (${items.length})`,
          mdList(items, (w) => `**${w.name}** — priority: ${w.priority ?? "?"}, id: ${w.id}`)
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: { module_id, count: items.length, work_items: items } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_add_module_work_items",
    {
      title: "Add Work Items to Plane Module",
      description: `Assign one or more existing work items to a module.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        module_id: moduleIdField,
        work_item_ids: z.array(z.string()).min(1).describe("UUIDs of work items to add to this module.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, module_id, work_item_ids }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const result = await client.request(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/modules/${module_id}/module-issues/`,
          { data: { issues: work_item_ids } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Added ${work_item_ids.length} work item(s) to module \`${module_id}\`.`,
          structured: { module_id, added: work_item_ids, result } as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_remove_module_work_item",
    {
      title: "Remove Work Item from Plane Module",
      description: `Remove a single work item from a module without deleting the work item itself.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        module_id: moduleIdField,
        work_item_id: workItemIdField
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, module_id, work_item_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request(
          "DELETE",
          `/workspaces/${slug}/projects/${project_id}/modules/${module_id}/module-issues/${work_item_id}/`
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Removed work item \`${work_item_id}\` from module \`${module_id}\`.`,
          structured: { module_id, work_item_id, removed: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
