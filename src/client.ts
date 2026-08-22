import axios, { AxiosError, AxiosInstance } from "axios";
import { PlaneConfig } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export class PlaneApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "PlaneApiError";
    this.status = status;
    this.details = details;
  }
}

export class PlaneClient {
  private http: AxiosInstance;
  readonly defaultWorkspaceSlug?: string;

  constructor(config: PlaneConfig) {
    this.defaultWorkspaceSlug = config.defaultWorkspaceSlug;
    this.http = axios.create({
      baseURL: `${config.baseUrl}/api/v1`,
      timeout: 30000,
      headers: {
        "X-API-Key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    });
  }

  /** Resolve a workspace slug argument against the configured default. */
  resolveWorkspaceSlug(workspaceSlug?: string): string {
    const slug = workspaceSlug || this.defaultWorkspaceSlug;
    if (!slug) {
      throw new PlaneApiError(
        "No workspace_slug was provided and no PLANE_WORKSPACE_SLUG default is configured. " +
          "Pass workspace_slug explicitly, or set PLANE_WORKSPACE_SLUG in the server environment."
      );
    }
    return slug;
  }

  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    options: { params?: Record<string, unknown>; data?: unknown } = {}
  ): Promise<T> {
    try {
      const response = await this.http.request<T>({
        method,
        url: path,
        params: cleanParams(options.params),
        data: options.data
      });
      return response.data;
    } catch (error) {
      throw toPlaneApiError(error);
    }
  }
}

/** Remove undefined values so they aren't serialized as query params. */
function cleanParams(
  params?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function toPlaneApiError(error: unknown): PlaneApiError {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<any>;
    if (err.response) {
      const status = err.response.status;
      const body = err.response.data;
      const serverMessage =
        (body && (body.error || body.detail || body.message)) || undefined;

      switch (status) {
        case 400:
          return new PlaneApiError(
            `Bad request (400): ${serverMessage || "Check the parameters you supplied against the tool's schema."}`,
            status,
            body
          );
        case 401:
          return new PlaneApiError(
            "Unauthorized (401): the PLANE_API_KEY is missing, invalid, or expired. " +
              "Generate a new Personal Access Token in Plane under Profile Settings > Personal Access Tokens.",
            status,
            body
          );
        case 403:
          return new PlaneApiError(
            `Forbidden (403): your API key does not have permission for this action. ${serverMessage || ""}`.trim(),
            status,
            body
          );
        case 404:
          return new PlaneApiError(
            "Not found (404): double-check the workspace_slug, project_id, and any resource IDs. " +
              "IDs are UUIDs returned by the corresponding list/get/create tools, not display names.",
            status,
            body
          );
        case 429:
          return new PlaneApiError(
            "Rate limited (429): this Plane instance allows 60 requests/minute per API key. Wait a moment and retry.",
            status,
            body
          );
        default:
          return new PlaneApiError(
            `Plane API request failed with status ${status}${serverMessage ? `: ${serverMessage}` : ""}`,
            status,
            body
          );
      }
    } else if (err.code === "ECONNABORTED") {
      return new PlaneApiError(
        "Request to the Plane instance timed out after 30s. Check PLANE_BASE_URL and that the server is reachable."
      );
    } else if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
      return new PlaneApiError(
        `Could not reach the Plane instance at the configured PLANE_BASE_URL (${err.code}). ` +
          "Verify the URL is correct and reachable from this machine."
      );
    }
  }
  return new PlaneApiError(
    `Unexpected error calling Plane API: ${error instanceof Error ? error.message : String(error)}`
  );
}
