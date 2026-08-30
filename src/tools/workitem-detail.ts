import { McpServer } from "@modelcontextprotocol/server";
import * as z from 'zod/v4';
import { PlaneClient } from "../client.js";
import {
  cursorField,
  perPageField,
  projectIdField,
  responseFormatField,
  workItemIdField,
  workspaceSlugField
} from "../schemas/common.js";
import { buildResult, errorResult, mdList, truncateText } from "../format.js";
import { ResponseFormat } from "../constants.js";
import { CursorPage, PlaneActivity, PlaneComment, PlaneLink } from "../types.js";

const commentIdField = z.string().min(1).describe("UUID of the comment (from plane_list_work_item_comments).");
const linkIdField = z.string().min(1).describe("UUID of the link (from plane_list_work_item_links).");

export function registerWorkItemDetailTools(server: McpServer, client: PlaneClient): void {
  // --- Comments ---------------------------------------------------------

  server.registerTool(
    "plane_list_work_item_comments",
    {
      title: "List Plane Work Item Comments",
      description: `List the discussion comments on a work item, in order. Use this to catch up on context before replying or making a decision on an item.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        cursor: cursorField,
        per_page: perPageField,
        response_format: responseFormatField
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, cursor, per_page, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const page = await client.request<CursorPage<PlaneComment> | PlaneComment[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/comments/`,
          { params: { cursor, per_page } }
        );
        const comments = Array.isArray(page) ? page : page.results;
        const markdown = [
          `# Comments (${comments.length})`,
          mdList(comments, (c) => `**${c.actor ?? "?"}** (${c.created_at ?? "?"}): ${truncateText(c.comment_stripped, 300)}`)
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: { work_item_id, count: comments.length, comments } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_add_work_item_comment",
    {
      title: "Add Plane Work Item Comment",
      description: `Post a new comment on a work item.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        comment_html: z.string().min(1).describe("HTML body of the comment, e.g. '<p>Looks good, shipping this.</p>'.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, comment_html }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const comment = await client.request<PlaneComment>(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/comments/`,
          { data: { comment_html } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Added comment \`${comment.id}\` to work item \`${work_item_id}\`.`,
          structured: comment as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_update_work_item_comment",
    {
      title: "Update Plane Work Item Comment",
      description: `Edit the text of an existing comment.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        comment_id: commentIdField,
        comment_html: z.string().min(1).describe("New HTML body for the comment.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, comment_id, comment_html }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const comment = await client.request<PlaneComment>(
          "PATCH",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/comments/${comment_id}/`,
          { data: { comment_html } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Updated comment \`${comment_id}\`.`,
          structured: comment as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_work_item_comment",
    {
      title: "Delete Plane Work Item Comment",
      description: `Permanently delete a comment from a work item.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        comment_id: commentIdField
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, comment_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request(
          "DELETE",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/comments/${comment_id}/`
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted comment \`${comment_id}\`.`,
          structured: { comment_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // --- Activity -----------------------------------------------------------

  server.registerTool(
    "plane_list_work_item_activity",
    {
      title: "List Plane Work Item Activity",
      description: `List the audit trail of field changes on a work item (state transitions, reassignments, priority changes, etc.) — useful for reconstructing "what happened and when" on an item.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        cursor: cursorField,
        per_page: perPageField,
        response_format: responseFormatField
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, cursor, per_page, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const page = await client.request<CursorPage<PlaneActivity> | PlaneActivity[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/activities/`,
          { params: { cursor, per_page } }
        );
        const activities = Array.isArray(page) ? page : page.results;
        const markdown = [
          `# Activity (${activities.length})`,
          mdList(
            activities,
            (a) => `${a.created_at ?? "?"} — ${a.actor ?? "?"} ${a.verb ?? "changed"} ${a.field ?? ""}: ${a.old_value ?? "—"} → ${a.new_value ?? "—"}`
          )
        ].join("\n");
        return buildResult({ format: response_format, markdown, structured: { work_item_id, count: activities.length, activities } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // --- Links ---------------------------------------------------------------

  server.registerTool(
    "plane_list_work_item_links",
    {
      title: "List Plane Work Item Links",
      description: `List external URLs attached to a work item (e.g. links to a PR, design file, or doc).`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        response_format: responseFormatField
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, response_format }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const links = await client.request<PlaneLink[]>(
          "GET",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/links/`
        );
        const markdown = [`# Links (${links.length})`, mdList(links, (l) => `[${l.title || l.url}](${l.url}) — id: ${l.id}`)].join(
          "\n"
        );
        return buildResult({ format: response_format, markdown, structured: { work_item_id, count: links.length, links } });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_add_work_item_link",
    {
      title: "Add Plane Work Item Link",
      description: `Attach an external URL (PR, design, doc, etc.) to a work item.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        url: z.string().url().describe("The URL to attach."),
        title: z.string().optional().describe("Display title for the link.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, url, title }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const link = await client.request<PlaneLink>(
          "POST",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/links/`,
          { data: { url, title } }
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Added link \`${link.id}\` (${url}) to work item \`${work_item_id}\`.`,
          structured: link as unknown as Record<string, unknown>
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "plane_delete_work_item_link",
    {
      title: "Delete Plane Work Item Link",
      description: `Remove an external link from a work item.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        link_id: linkIdField
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, link_id }) => {
      try {
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        await client.request(
          "DELETE",
          `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/links/${link_id}/`
        );
        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Deleted link \`${link_id}\`.`,
          structured: { link_id, deleted: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
