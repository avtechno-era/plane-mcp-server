# Plane MCP Connector — Tool QA Report
Tested: 2026-08-30 · Workspace: `computebay` · Method: live calls against a temporary sandbox project (`MCPQA`, deleted after testing) plus read-only calls against real projects

## Summary
- **~45 tools exercised** out of 66 total
- **11 confirmed bugs / broken tools**
- **1 dangerous false-positive** (silent no-op reported as success)
- **1 legitimate non-bug error** (Intake not enabled — expected behavior)
- **~10 tools untested** — blocked because their prerequisite create-tool is broken (no cycles/pages exist to test against), or intentionally skipped as destructive-without-benefit

---

## ✅ Working correctly
| Area | Tools |
|---|---|
| Auth / workspace | `list_workspace_members`, `get_current_user`, `list_projects` |
| Project | `create_project`, `get_project`, `update_project`, `archive_project`, `delete_project` |
| States | `list_states`, `create_state`, `update_state`, `delete_state` |
| Labels | `create_label`, `update_label`, `delete_label` |
| Work items | `create_work_item`, `get_work_item_by_identifier`, `update_work_item`, `list_work_items`, `search_work_items` (project + workspace scope), `delete_work_item` |
| Comments | `add_work_item_comment`, `update_work_item_comment`, `delete_work_item_comment` |
| Links | `add_work_item_link`, `delete_work_item_link` |
| Activity | `list_work_item_activity` |
| Modules (read) | `list_modules`, `list_module_work_items` |
| Members | `list_project_members`, `add_project_member` |

## 🐛 Bugs found

**Note: Pages API is inaccessible due to a [silent deprecation/feature-gating of upstream repo](https://github.com/makeplane/plane/issues/8986)**

| # | Tool | Issue | Severity |
|---|---|---|---|
| 1 | `plane_list_labels` | Fails with `items.map is not a function` — can't list labels at all | High |
| 2 | `plane_list_work_item_links` | Same `items.map is not a function` error | High |
| 3 | `plane_get_work_item` | Labels render as `[object Object]`; description shows as empty even when set | Medium |
| 4 | `plane_list_work_item_comments` | Comment body text missing from output — only shows author + timestamp | Medium |
| 5 | `plane_advanced_search_work_items` | Always 404s, even with valid project_id and simple query/filters | High |
| 6 | `plane_create_module` | 400 Bad Request with only required fields (`name`, `project_id`) | High — blocks all module creation |
| 7 | `plane_create_cycle` | 400 Bad Request with only required fields (`name`, `project_id`) | High — blocks all cycle creation |
| 8 | `plane_create_project_page` | 404 Not Found | High |
| 9 | `plane_create_workspace_page` | 404 Not Found | High |
| 10 | `plane_list_project_pages` | 404 Not Found | High — entire Pages feature unusable via connector |
| 11 | `plane_list_workspace_pages` | 404 Not Found | High |
| 12 | `plane_update_project_member` | 404 using member ID from `list_project_members` | Medium |
| 13 | `plane_remove_project_member` | Same 404 as above | Medium |
| 14 | `plane_unarchive_project` | 404 immediately after a successful `archive_project` on the same project ID | Medium |

## ⚠️ Dangerous false-positive
**`plane_add_module_work_items`** returned a success message ("Added 1 work item(s) to module...") when given a work item ID from a *different* project than the module. Verifying with `list_module_work_items` showed nothing was actually added — the call silently no-ops instead of failing. This could mislead an agent (or a user) into thinking cross-project linking worked when it didn't. Recommend this either succeeds properly or returns a clear error, not a false "success."

## ℹ️ Not a bug
- `plane_add_intake_issue` correctly errored with "Intake is not enabled for this project" — expected behavior, not tested further since no project in the workspace has Intake enabled.

## Untested (blocked or skipped)
- `plane_get_cycle`, `plane_update_cycle`, `plane_delete_cycle`, `plane_add_cycle_work_items`, `plane_remove_cycle_work_item`, `plane_list_cycle_work_items` — no cycles exist in any real project, and `create_cycle` is broken, so there was nothing to test against.
- `plane_update_project_page`, `plane_get_project_page`, `plane_delete_project_page`, `plane_get_workspace_page`, `plane_update_workspace_page`, `plane_delete_workspace_page` — blocked because page creation/listing is broken (bugs #8–11).
- `plane_update_intake_issue`, `plane_list_intake_issues` — blocked because Intake isn't enabled on any project.
- `plane_delete_module` — not reached since `create_module` never succeeded.

## Suggested priority for fixes
1. **Module & Cycle creation** (#6, #7) — these block a large chunk of the tool surface (all module/cycle sub-tools) and are core PM features.
2. **Pages** (#8–11) — the whole feature area is non-functional via this connector.
3. **`advanced_search_work_items`** (#5) — plain `search_work_items` works, but the filtered/advanced search is the more useful tool for status reporting and it's fully broken.
4. **`list_labels` / `list_work_item_links`** (#1, #2) — basic read tools failing outright.
5. **The false-positive on `add_module_work_items`** — silent no-ops are worse than errors since they're invisible until manually verified.

## Test artifacts
A temporary project `MCP Tool QA Sandbox` (`MCPQA`) was created, used for all destructive/mutating tests, and fully deleted at the end. Your real projects (ComputeBay, WeaveNet, Avante, Ecomm) were not modified except for one transient, non-persisting `add_module_work_items` call against a ComputeBay module, which verifiably added nothing (see false-positive note above).