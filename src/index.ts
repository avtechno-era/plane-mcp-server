/**
 * In-flight channels: progress, logging, cancellation.
 *
 * The `countdown` tool emits a `notifications/progress` per step (when the
 * call carried a `_meta.progressToken`), a logging notification per step
 * (when the server has the `logging` capability), and stops promptly when the
 * client cancels (`ctx.mcpReq.signal.aborted`). One binary, either transport.
 */
import { serve } from '@hono/node-server';
import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

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
import {PlaneClient} from './client.js';
import {loadConfig} from './config.js';
import {SupportedTransportTypes} from './types.js';

const TRANSPORT_MODE: SupportedTransportTypes = process.env.MODE?.toLowerCase() === "server" ? "server" : "local";
const PORT = Number(process.env.PORT ?? 3000);
const HOST = (process.env.HOST_DOMAIN || "");

function buildServer(): McpServer {
    const server = new McpServer({ name: 'plane-mcp-server', version: '1.0.0' });
    const config = loadConfig();
    const client = new PlaneClient(config);

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

if (TRANSPORT_MODE === 'local') {
    void serveStdio(buildServer);
    console.log('[server] serving over stdio');
} else {
    const handler = createMcpHandler(buildServer);

    // `createMcpHonoApp()` arms localhost host/origin validation by default;
    // bind loopback explicitly to match.
    const app = createMcpHonoApp({
      allowedHosts: [ HOST ]
    });
    app.all('/mcp', async(c) => {
      const clone = c.req.raw.clone();
      const parsed = await clone.json();
      console.error("[mcp]", {
        method: c.req.method,
        url: c.req.url,
        origin: c.req.header("origin"),
        host: c.req.header("host"),
        accept: c.req.header("accept"),
        contentType: c.req.header("content-type"),
        userAgent: c.req.header("user-agent"),
        body: parsed
      });
      return handler.fetch(c.req.raw)
    });
    serve({ fetch: app.fetch, port: PORT }, () => {
        console.log(`[plane-mcp-server] Hono listening on ${PORT}/mcp`);
    });
}