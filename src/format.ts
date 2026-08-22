import { CHARACTER_LIMIT, ResponseFormat } from "./constants.js";

export interface ToolTextResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Build a tool result honoring the requested response_format, truncating oversized
 * output and always attaching structuredContent when the payload is a plain object.
 */
export function buildResult(options: {
  format: ResponseFormat;
  markdown: string;
  structured: unknown;
}): ToolTextResult {
  let text = options.format === ResponseFormat.JSON ? JSON.stringify(options.structured, null, 2) : options.markdown;

  let truncated = false;
  if (text.length > CHARACTER_LIMIT) {
    text = `${text.slice(0, CHARACTER_LIMIT)}\n\n[...output truncated at ${CHARACTER_LIMIT} characters. Narrow your query with filters, a smaller per_page, or a more specific id.]`;
    truncated = true;
  }

  const result: ToolTextResult = {
    content: [{ type: "text", text }]
  };

  if (
    options.structured &&
    typeof options.structured === "object" &&
    !Array.isArray(options.structured)
  ) {
    let structured = options.structured as Record<string, unknown>;
    if (JSON.stringify(structured).length > CHARACTER_LIMIT) {
      structured = { note: `structuredContent omitted: exceeds ${CHARACTER_LIMIT} characters. See the text content instead, or narrow your query with filters, a smaller per_page, or fewer expand fields.` };
      truncated = true;
    }
    result.structuredContent = {
      ...structured,
      ...(truncated ? { truncated: true } : {})
    };
  }

  return result;
}

export function errorResult(message: string): ToolTextResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true
  };
}

/** Render a short human-readable date, or '—' if absent. */
export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

/** Render a list of items as a markdown bullet list using a per-item renderer. */
export function mdList<T>(items: T[], render: (item: T) => string): string {
  if (items.length === 0) return "_None_";
  return items.map((item) => `- ${render(item)}`).join("\n");
}

export function truncateText(value: string | undefined | null, max = 200): string {
  if (!value) return "";
  const stripped = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}
