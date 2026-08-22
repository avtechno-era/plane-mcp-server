#!/usr/bin/env node
/**
 * MCP server for self-hosted Plane (Community Edition).
 *
 * Exposes Plane's project-management primitives — projects, work items, states,
 * labels, cycles, modules, comments, activity, links, members, intake, and pages — as
 * MCP tools so an LLM can act as a project manager across a Plane workspace.
 *
 * Transport: stdio (this server is designed to run locally, spawned by an MCP
 * client such as Claude Desktop / Claude Code, not exposed over the network).
 *
 * Required environment variables:
 *   PLANE_BASE_URL       Base URL of your self-hosted Plane instance (no trailing /api/v1)
 *   PLANE_API_KEY        Personal Access Token (Profile Settings > Personal Access Tokens)
 * Optional:
 *   PLANE_WORKSPACE_SLUG Default workspace slug used when a tool call omits workspace_slug
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { PlaneClient } from "./client.js";
import { registerUserTools } from "./tools/user.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerMemberTools } from "./tools/members.js";
import { registerStateTools } from "./tools/states.js";
import { registerLabelTools } from "./tools/labels.js";
import { registerWorkItemTools } from "./tools/workitems.js";
import { registerWorkItemDetailTools } from "./tools/workitem-detail.js";
import { registerCycleTools } from "./tools/cycles.js";
import { registerModuleTools } from "./tools/modules.js";
import { registerIntakeTools } from "./tools/intake.js";
import { registerPageTools } from "./tools/pages.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new PlaneClient(config);

  const server = new McpServer({
    name: "plane-mcp-server",
    version: "1.0.0"
  });

  registerUserTools(server, client);
  registerProjectTools(server, client);
  registerMemberTools(server, client);
  registerStateTools(server, client);
  registerLabelTools(server, client);
  registerWorkItemTools(server, client);
  registerWorkItemDetailTools(server, client);
  registerCycleTools(server, client);
  registerModuleTools(server, client);
  registerIntakeTools(server, client);
  registerPageTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `plane-mcp-server running via stdio (base URL: ${config.baseUrl}${
      config.defaultWorkspaceSlug ? `, default workspace: ${config.defaultWorkspaceSlug}` : ""
    })`
  );
}

main().catch((error) => {
  console.error("Fatal error starting plane-mcp-server:", error);
  process.exit(1);
});
