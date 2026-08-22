/**
 * Environment-based configuration for the Plane MCP server.
 *
 * Required:
 *   PLANE_BASE_URL   - Base URL of your self-hosted Plane instance, e.g. https://plane.mycompany.com
 *                       (do NOT include /api/v1 - it is appended automatically)
 *   PLANE_API_KEY    - Personal Access Token generated from Plane > Profile Settings > Personal Access Tokens
 *
 * Optional:
 *   PLANE_WORKSPACE_SLUG - Default workspace slug to use when a tool call omits workspace_slug.
 *                           Useful if you mostly work in a single workspace.
 */

export interface PlaneConfig {
  baseUrl: string;
  apiKey: string;
  defaultWorkspaceSlug?: string;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function loadConfig(): PlaneConfig {
  const baseUrl = process.env.PLANE_BASE_URL;
  const apiKey = process.env.PLANE_API_KEY;
  const defaultWorkspaceSlug = process.env.PLANE_WORKSPACE_SLUG;

  const missing: string[] = [];
  if (!baseUrl) missing.push("PLANE_BASE_URL");
  if (!apiKey) missing.push("PLANE_API_KEY");

  if (missing.length > 0) {
    console.error(
      `ERROR: Missing required environment variable(s): ${missing.join(", ")}.\n` +
        "Set PLANE_BASE_URL to your self-hosted Plane instance URL (e.g. https://plane.mycompany.com)\n" +
        "and PLANE_API_KEY to a Personal Access Token (Profile Settings > Personal Access Tokens)."
    );
    process.exit(1);
  }

  return {
    baseUrl: stripTrailingSlash(baseUrl as string),
    apiKey: apiKey as string,
    defaultWorkspaceSlug: defaultWorkspaceSlug || undefined
  };
}
