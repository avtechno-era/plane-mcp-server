import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { PlaneClient } from "../client.js";
import { projectIdField, workItemIdField, workspaceSlugField } from "../schemas/common.js";
import { buildResult, errorResult } from "../format.js";
import { ResponseFormat } from "../constants.js";

interface UploadCredentials {
  resource_id?: string;
  id?: string;
  upload_url?: string;
  url?: string;
  fields?: Record<string, string>;
  form_data?: Record<string, string>;
  [key: string]: unknown;
}

/** Attachment upload follows Plane CE's documented presigned-upload flow. */
export function registerAttachmentTools(server: McpServer, client: PlaneClient): void {
  server.registerTool(
    "plane_add_work_item_attachment",
    {
      title: "Add Plane Work Item Attachment",
      description: `Upload a local file to a work item. Plane CE creates an attachment resource, returns presigned upload credentials, and requires the resource to be marked uploaded after the storage upload completes. The file_path is resolved by the MCP runtime when proxied mounts are configured.`,
      inputSchema: z.object({
        workspace_slug: workspaceSlugField,
        project_id: projectIdField,
        work_item_id: workItemIdField,
        file_path: z.string().min(1).describe("Path to the file made available to the MCP server."),
        file_name: z.string().min(1).optional().describe("Name shown in Plane; defaults to the source file name."),
        content_type: z.string().min(1).default("application/octet-stream").describe("MIME type of the file.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ workspace_slug, project_id, work_item_id, file_path, file_name, content_type }) => {
      try {
        const name = file_name ?? basename(file_path);
        const bytes = await readFile(file_path);
        const slug = client.resolveWorkspaceSlug(workspace_slug);
        const basePath = `/workspaces/${slug}/projects/${project_id}/work-items/${work_item_id}/attachments/`;

        const credentials = await client.request<UploadCredentials>("POST", basePath, {
          data: { file_name: name, content_type }
        });
        const uploadUrl = credentials.upload_url ?? credentials.url;
        const fields = credentials.fields ?? credentials.form_data ?? {};
        const resourceId = credentials.resource_id ?? credentials.id;
        if (!uploadUrl || !resourceId) {
          throw new Error("Plane did not return upload credentials and a resource id for the attachment.");
        }

        await client.uploadToPresignedUrl(
          uploadUrl,
          fields,
          new Blob([bytes], { type: content_type }),
          name,
          content_type
        );
        await client.request("PATCH", `${basePath}${resourceId}/`, { data: { is_uploaded: true } });

        return buildResult({
          format: ResponseFormat.MARKDOWN,
          markdown: `Uploaded attachment **${name}** to work item \`${work_item_id}\`.`,
          structured: { work_item_id, resource_id: resourceId, file_name: name, content_type, uploaded: true }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
