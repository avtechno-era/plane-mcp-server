#!/usr/bin/env node

/**
 * MCP server for self-hosted Plane (Community Edition).
 *
 * Exposes Plane's project-management primitives — projects, work items, states,
 * labels, cycles, modules, comments, activity, links, members, intake, and pages —
 * as MCP tools so an LLM can act as a project manager across a Plane workspace.
 *
 * Transport:
 *   - local: stdio
 *   - server: HTTP
 *
 * Required environment variables:
 *   PLANE_BASE_URL  Base URL of your self-hosted Plane instance
 *                   (no trailing /api/v1)
 *   PLANE_API_KEY   Personal Access Token
 *
 * Optional:
 *   PLANE_WORKSPACE_SLUG
 *                   Default workspace slug used when a tool call omits
 *                   workspace_slug.
 *
 * Server mode:
 *   PORT            HTTP port (default: 3000)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "node:http";

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

type TransportMode = "local" | "server";

const TRANSPORT_MODE: TransportMode =
  process.env.MODE?.toLowerCase() === "server" ? "server" : "local";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

async function createMcpServer(): Promise<McpServer> {
  const config = loadConfig();
  const client = new PlaneClient(config);

  const server = new McpServer({
    name: "plane-mcp-server",
    version: "1.0.0",
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

  return server;
}

async function startStdioServer(): Promise<void> {
  const server = await createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("Plane MCP Server is running on stdio");
}

async function startHttpServer(): Promise<void> {
  const server = await createMcpServer();

  /*
    * StreamableHTTPServerTransport handles MCP requests over HTTP.
    *
    * A new transport is created for each request in this simple
    * stateless implementation.
  */
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const httpServer = createServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP request failed:", error);

      if (!res.headersSent) {
        res.writeHead(500, {"content-type": "application/json; charset=utf-8"});
        res.end(JSON.stringify({error: error instanceof Error ? error.message : String(error)}));
      }
    }
  });

  httpServer.listen(PORT, () => {
    console.error(`Plane MCP Server is running on port ${PORT}`);
    console.error(`MCP endpoint: http://localhost:${PORT}/mcp`);
  });
}

async function main(): Promise<void> {
  switch(TRANSPORT_MODE){
    case "local"  : await startStdioServer();break;
    case "server" : await startHttpServer();break;
  }
}

main().catch((error) => {
  console.error("Fatal error starting plane-mcp-server:", error);
  process.exit(1);
});