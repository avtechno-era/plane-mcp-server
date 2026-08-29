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
import {SupportedTransportTypes} from "./types.js";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp";
import {createServer} from "http";

// @ts-ignore
const TRANSPORT_MODE: SupportedTransportTypes = (process.env.MODE || "local").toLowerCase();
const PORT = process.env.PORT || 3000;

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

  let transport = null;
  
  switch(TRANSPORT_MODE){
    case "local": transport = new StdioServerTransport();break;
    case "server": transport = new StreamableHTTPServerTransport({});
  }

  if(transport){
    await server.connect(transport);


    if(TRANSPORT_MODE === "server" && transport instanceof StreamableHTTPServerTransport){
      const http = createServer(async(req, res)=>{
        if(req.url !== "/mcp"){
          res.writeHead(404, {"content-type":"text/plain"});
          res.end("Not Found");
          return;
        }

        try{
          await transport.handleRequest(req, res);
        }catch(error){
          console.error(`MCP request failed:`, error);

          if(!res.headersSent){
            res.writeHead(500, {"content-type":"application/json"});
            res.end(JSON.stringify({error}));
          }
        }
      });

      http.listen(PORT,()=>{
        console.log(`Plane MCP Server is running on port ${PORT}`);
      });
    }else{
      console.log(`Plane MCP Server is running on stdio`);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error starting plane-mcp-server:", error);
  process.exit(1);
});
