# plane-mcp-server

An MCP (Model Context Protocol) server for **self-hosted Plane (Community Edition)**. It gives Claude 56 tools covering projects, work items, states, labels, cycles, modules, comments, activity history, links, members, and intake triage, enough to act as a project manager across every project in your Plane workspace, from a local chat session.

Built against Plane's public REST API (`/api/v1`), documented at [developers.plane.so](https://developers.plane.so/api-reference/introduction). Community Edition covers projects, work items, cycles, modules, intake, and states/labels — this server sticks to that surface. Epics, initiatives, teamspaces, and customers are Plane Commercial/Cloud-only features and are intentionally not included.

## Setup

### 1. Generate a Plane API key

In your Plane instance: **Profile Settings → Personal Access Tokens → Add personal access token**.

### 2. Install dependencies and build

```bash
cd plane-mcp-server
npm install
npm run build
```

### 3. Configure environment variables

Copy `.env.example` to `.env` for reference, but note: MCP clients (Claude Desktop, Claude Code) pass environment variables directly in their config, not via a `.env` file loaded by this process.

| Variable | Required | Description |
|---|---|---|
| `PLANE_BASE_URL` | Yes | Base URL of your self-hosted instance, e.g. `https://plane.mycompany.com` (no `/api/v1` suffix). |
| `PLANE_API_KEY` | Yes | Personal Access Token from step 1. |
| `PLANE_WORKSPACE_SLUG` | No | Default workspace slug (from your Plane URL). If set, tools' `workspace_slug` argument becomes optional. |

### 4. Add to your MCP client

**Claude Code** (`claude mcp add` or edit `.mcp.json`):

```json
{
  "mcpServers": {
    "plane": {
      "command": "node",
      "args": ["/absolute/path/to/plane-mcp-server/dist/index.js"],
      "env": {
        "PLANE_BASE_URL": "https://plane.mycompany.com",
        "PLANE_API_KEY": "plane_api_xxxxxxxxxxxxxxxxxxxx",
        "PLANE_WORKSPACE_SLUG": "acme"
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`): same `mcpServers` block as above.

Restart the client after editing config. You should see the `plane` server connect with 56 tools available.

## What it can do

- **Projects** — list/get/create/update/archive/delete, keeping track of every project in a workspace at once.
- **Work items (issues)** — full CRUD, lookup by UUID or human identifier (`ENG-123`), free-text search, and advanced structured-filter search (by state, priority, assignee, labels).
- **States & labels** — inspect and manage each project's workflow columns and tags.
- **Cycles (sprints)** — create/update/delete, assign or remove work items, read progress counts for status reporting.
- **Modules** — same lifecycle as cycles, for longer-running feature groupings.
- **Comments & activity** — read/write discussion threads, read the audit trail of field changes on a work item.
- **Links** — attach PRs/docs/designs to a work item.
- **Members** — resolve people's names/emails to UUIDs, staff projects, change roles.
- **Intake** — triage incoming requests (accept/reject/snooze/duplicate) before they hit the backlog.

Every list/get tool accepts `response_format: "markdown" | "json"` (markdown by default, for readability; json for further programmatic use), and every tool that needs a workspace defaults to `PLANE_WORKSPACE_SLUG` if you configured one, so most calls only need a `project_id`.

### Not implemented

Scoped out deliberately to keep the surface focused and CE-only: file/attachment uploads, pages, estimates, time tracking (worklogs), custom work item types/properties, and the commercial-only epics/initiatives/teamspaces/customers/IDP-sync APIs. These can be added later following the same pattern in `src/tools/`.

## A typical multi-project PM session

1. `plane_list_projects` — see everything in the workspace.
2. `plane_advanced_search_work_items` on the active project with a priority/state filter — find what's urgent. It's project-scoped, so call it once per project to cover the whole workspace.
3. `plane_list_cycles` on the active project, then `plane_list_cycle_work_items` — check current sprint status.
4. `plane_update_work_item` — move items between states, reassign, reprioritize.
5. `plane_add_work_item_comment` — leave status notes.
6. `plane_list_intake_issues` + `plane_update_intake_issue` — clear the triage queue.

## Development

```bash
npm run dev     # tsx watch, runs src/index.ts directly
npm run build   # compile to dist/
npm start       # run compiled dist/index.js
```

Test with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

(Set `PLANE_BASE_URL` / `PLANE_API_KEY` / `PLANE_WORKSPACE_SLUG` in the Inspector's environment panel.)

## Notes on endpoint stability

This server was built from Plane's hosted API docs (developers.plane.so) plus the documented self-hosting behavior — self-hosted instances share the same `/api/v1` surface, but exact behavior can vary slightly by Plane version. If a less common tool (e.g. `plane_advanced_search_work_items` filter syntax) returns a 400/404 on your instance, prefer the simpler `plane_list_work_items` / `plane_list_states` / `plane_list_labels` tools and filter client-side, or check your instance's own API docs at `<your-plane-url>/api/` if exposed.
