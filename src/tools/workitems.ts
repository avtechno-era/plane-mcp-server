import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PlaneClient } from "../client.js";
import {
  cursorField,
  expandField,
  perPageField,
  projectIdField,
  responseFormatField,
  workItemIdField,
  workspaceSlugField
} from "../schemas/common.js";
import { buildResult, errorResult, fmtDate, mdList, truncateText } from "../format.js";
import { ResponseFormat, WORK_ITEM_PRIORITIES } from "../constants.js";
import { CursorPage, PlaneWorkItem } from "../types.js";

const priorityField = z.enum(WORK_ITEM_PRIORITIES).describe("Priority: urgent, high, medium, low, or none.");

function workItemLine(w: PlaneWorkItem): string {
  const stateName = typeof w.state === "object" && w.state ? (w.state as any).name : w.state;
  const idLabel = w.project_identifier && w.sequence_id ? `${w.project_identifier}-${w.sequence_id}` : w.id;
  return `**${idLabel}** ${w.name} — priority: ${w.priority ?? "none"}, state: ${stateName ?? "?"}${
    w.target_date ? `, due ${fmtDate(w.target_date as string)}` : ""
  }`;
}

export function registerWorkItemTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_list_work_items",
    {
      title: "List Plane Work Items",
      description: `List work items (issues/tasks) in a project, paginated. This does NOT support filtering by state/assignee/priority directly — use plane_advanced_search_work_items for filtered queries, or plane_search_work_items for a text/name search. Use this tool for a straightforward paginated dump of everything in a project, e.g. for a status report.

Args:
  - project_id (string, required).
  - workspace_slug (string, optional): defaults to PLANE_WORKSPACE_SLUG.
  - order_by (string, optional): field to sort by, prefix with '-' for descending, e.g. '-created_at', 'priority', 'sequence_id'.
  - expand (string, optional): comma-separated related fields to inline, e.g. 'state,assignees,labels'. Without it you only get UUIDs for these fields.
  - cursor, per_page: pagination.

Returns paginated work items with id, name, priority, state, sequence_id, assignees, labels, dates.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        order_by: z.string().optional().describe("Sort field, e.g. '-created_at' or 'priority'."),
        expand: expandField,
        cursor: cursorField,
        per_page: perPageField,
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, order_by, expand, cursor, per_page, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const page = await client.request<CursorPage<PlaneWorkItem>>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/work-items/`,
          { params: { order_by, expand, cursor, per_page } }
        );
        const markdown = [
          `# Work Items (${page.total_results ?? page.results.length})`,
          "",
          mdList(page.results, workItemLine),
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
    "plane_get_work_item",
    {
      title: "Get Plane Work Item",
      description: `Get full details of a single work item by its UUID, including description, priority, state, assignees, labels, and dates.

If you only know the human-readable identifier (e.g. "ENG-123") rather than the UUID, use plane_get_work_item_by_identifier instead.`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        expand: expandField,
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, expand, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const w = await client.request<PlaneWorkItem>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/`,
          { params: { expand } }
        );
        const markdown = [
          `# ${w.name}`,
          `- **ID**: ${w.id} (sequence #${w.sequence_id ?? "?"})`,
          `- **Priority**: ${w.priority ?? "none"}`,
          `- **State**: ${typeof w.state === "object" && w.state ? (w.state as any).name : w.state ?? "—"}`,
          `- **Assignees**: ${(w.assignees ?? []).join(", ") || "—"}`,
          `- **Labels**: ${(w.labels ?? []).join(", ") || "—"}`,
          `- **Start**: ${fmtDate(w.start_date as string)}  **Due**: ${fmtDate(w.target_date as string)}`,
          "",
          w.description_stripped ? truncateText(w.description_stripped, 2000) : "_No description_"
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: w as unknown as Record<string, unknown> });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_get_work_item_by_identifier",
    {
      title: "Get Plane Work Item by Identifier",
      description: `Get a work item using its human-readable identifier, e.g. "ENG-123", instead of its UUID. This is the natural way to look up a work item mentioned in conversation, a commit message, or a Slack thread.

Args:
  - project_identifier (string, required): the project's short key, e.g. "ENG" (see plane_list_projects).
  - issue_number (integer, required): the numeric part, e.g. 123 for "ENG-123".`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_identifier: z.string().min(1).describe("Project key/prefix, e.g. 'ENG' in 'ENG-123'."),
        issue_number: z.number().int().positive().describe("Numeric sequence id, e.g. 123 in 'ENG-123'."),
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_identifier, issue_number, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const w = await client.request<PlaneWorkItem>(
          "GET",
          `/workspaces/${slug}/work-items/${project_identifier}-${issue_number}/`
        );
        const markdown = [
          `# ${project_identifier}-${issue_number}: ${w.name}`,
          `- **ID (UUID)**: ${w.id}`,
          `- **Priority**: ${w.priority ?? "none"}`,
          `- **Assignees**: ${(w.assignees ?? []).join(", ") || "—"}`
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: w as unknown as Record<string, unknown> });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_search_work_items",
    {
      title: "Search Plane Work Items",
      description: `Fast text search for work items by name, description, or identifier — across one project or the whole workspace. Good for "find the work item about X" style lookups. For filtering by state/priority/assignee/labels instead of free text, use plane_advanced_search_work_items.

Args:
  - search (string, required): text to search for.
  - project_id (string, optional): restrict to one project; omit to search the whole workspace.
  - workspace_search (boolean, optional): explicitly search across the whole workspace.
  - limit (integer, optional): max results (default 10).`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        search: z.string().min(1).describe("Search text."),
        project_id: z.string().optional().describe("Restrict search to this project's UUID."),
        workspace_search: z.boolean().optional().describe("Search across all projects in the workspace."),
        limit: z.number().int().min(1).max(100).default(10).describe("Maximum number of results."),
        response_format: responseFormatField
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, search, project_id, workspace_search, limit, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const data = await client.request<{ issues: PlaneWorkItem[] }>(
          "GET",
          `/workspaces/${slug}/work-items/search/`,
          { params: { search, project_id, workspace_search, limit } }
        );
        const issues = data.issues ?? [];
        const markdown = [
          `# Search results for "${search}" (${issues.length})`,
          mdList(issues, (w) => `**${(w as any).project__identifier ?? w.project_identifier}-${w.sequence_id}** ${w.name} — id: ${w.id}`)
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: { search, count: issues.length, issues } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_advanced_search_work_items",
    {
      title: "Advanced Search Plane Work Items",
      description: `Search work items with structured filters (state, priority, assignees, labels, etc.) plus an optional text query, within a project. This is the right tool for questions like "what's overdue and assigned to me" or "show urgent bugs in this project".

Args:
  - project_id (string, required): Plane's advanced-search endpoint is project-scoped. To search across the whole workspace, call this once per project (see plane_list_projects), or use plane_list_work_items + manual filtering instead.
  - query (string, optional): free-text search combined with the filters.
  - filters (object, optional): filter object passed through to Plane's issue filter engine as query params. Common keys (all optional, values are typically arrays of UUIDs or strings):
      state: [state_uuid, ...]
      state_group: ["backlog"|"unstarted"|"started"|"completed"|"cancelled", ...]
      priority: ["urgent"|"high"|"medium"|"low"|"none", ...]
      assignees: [user_uuid, ...]
      labels: [label_uuid, ...]
      created_by: [user_uuid, ...]
      target_date: ["YYYY-MM-DD;before" | "YYYY-MM-DD;after" | "YYYY-MM-DD;lte" ...] (check your Plane version's exact filter syntax if this errors)
    If unsure of exact filter syntax for your instance, prefer resolving UUIDs first (plane_list_states, plane_list_labels, plane_list_workspace_members) then pass minimal filters, and fall back to plane_list_work_items + manual filtering if this returns an error.
  - limit (integer, optional): max results (default 25).`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        query: z.string().optional().describe("Free-text search query."),
        filters: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Structured filter object, e.g. {\"priority\": [\"urgent\",\"high\"], \"state_group\": [\"started\"]}."),
        limit: z.number().int().min(1).max(100).default(25).describe("Maximum number of results.")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, query, filters, limit }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        // Plane's advanced-search endpoint is project-scoped and takes GET query params
        // (filter values comma-joined), not a workspace-wide POST with a JSON body.
        const filterParams: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(filters ?? {})) {
          filterParams[key] = Array.isArray(value) ? value.join(",") : value;
        }
        const raw = await client.request<unknown>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/work-items/advanced-search/`,
          { params: { search: query, limit, ...filterParams } }
        );
        const results: PlaneWorkItem[] = Array.isArray(raw)
          ? ((raw as unknown[]).flat(2) as PlaneWorkItem[])
          : Array.isArray((raw as any)?.results)
            ? ((raw as any).results as PlaneWorkItem[])
            : [];
        const markdown = [
          `# Advanced search results (${results.length})`,
          mdList(
            results,
            (w) => `**${w.project_identifier ?? "?"}-${w.sequence_id ?? "?"}** ${w.name} — priority: ${w.priority ?? "?"}, id: ${w.id}`
          )
        ].join("\n");
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown,
          structured: { count: results.length, results }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_create_work_item",
    {
      title: "Create Plane Work Item",
      description: `Create a new work item (issue/task) in a project.

Args:
  - project_id (string, required).
  - name (string, required): title of the work item.
  - description_html (string, optional): HTML body (wrap plain text in <p>...</p>).
  - priority (enum, optional): urgent | high | medium | low | none.
  - state (string, optional): UUID of a state from plane_list_states. Defaults to the project's default state if omitted.
  - assignees (string[], optional): UUIDs from plane_list_workspace_members / plane_list_project_members.
  - labels (string[], optional): UUIDs from plane_list_labels.
  - parent (string, optional): UUID of a parent work item, to create a sub-item.
  - start_date, target_date (string, optional): 'YYYY-MM-DD'.

Returns the created work item including its id and sequence_id (combine with the project identifier for the human-readable "PROJ-123" form).`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        name: z.string().min(1).max(255).describe("Work item title."),
        description_html: z.string().optional().describe("HTML description, e.g. '<p>Details...</p>'."),
        priority: priorityField.optional(),
        state: z.string().optional().describe("UUID of the state to place this work item in."),
        assignees: z.array(z.string()).optional().describe("UUIDs of users to assign."),
        labels: z.array(z.string()).optional().describe("UUIDs of labels to attach."),
        parent: z.string().optional().describe("UUID of the parent work item, if this is a sub-item."),
        start_date: z.string().optional().describe("Start date, YYYY-MM-DD."),
        target_date: z.string().optional().describe("Due date, YYYY-MM-DD.")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, ...body }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const w = await client.request<PlaneWorkItem>(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/work-items/`,
          { data: body }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Created work item **${w.name}** (id \`${w.id}\`, sequence #${w.sequence_id ?? "?"}).`,
          structured: w as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_work_item",
    {
      title: "Update Plane Work Item",
      description: `Update fields on an existing work item — move it to a new state, reassign it, change priority/dates, edit its description, or replace its labels. Only the fields you supply are changed; omit fields you don't want to touch.

To close/complete a work item, set state to a UUID from a state whose group is 'completed' (see plane_list_states).`,
      inputSchema: {
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        name: z.string().min(1).max(255).optional(),
        description_html: z.string().optional(),
        priority: priorityField.optional(),
        state: z.string().optional().describe("UUID of the new state."),
        assignees: z.array(z.string()).optional().describe("Replaces the full assignee list with these UUIDs."),
        labels: z.array(z.string()).optional().describe("Replaces the full label list with these UUIDs."),
        parent: z.string().nullable().optional().describe("UUID of new parent, or null to remove parent."),
        start_date: z.string().optional(),
        target_date: z.string().optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, ...updates }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const w = await client.request<PlaneWorkItem>(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/`,
          { data: updates }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated work item \`${work_item_id}\`.`,
          structured: w as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_work_item",
    {
      title: "Delete Plane Work Item",
      description: `Permanently delete a work item, including its comments, links, and activity history. This cannot be undone. Confirm with the user before calling this unless they were explicit about deleting.`,
      inputSchema: { workspace_slug: workspaceSlugField, project_id: projectIdField, work_item_id: workItemIdField },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request("DELETE", `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/`);
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted work item \`${work_item_id}\`.`,
          structured: { work_item_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
