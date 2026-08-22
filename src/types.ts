/**
 * Shape hints for Plane API responses. These are intentionally loose (most fields optional,
 * unknown extra fields allowed) because self-hosted Plane instances can run slightly different
 * versions with additional/renamed fields. We do not runtime-validate API *responses* against
 * these types (only tool *inputs* are validated, via Zod) so the server stays resilient to
 * upstream drift instead of throwing on unexpected fields.
 */

export interface PlaneUser {
  id: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  email?: string;
  avatar?: string;
  role?: number;
  [key: string]: unknown;
}

export interface PlaneProject {
  id: string;
  name: string;
  identifier: string;
  description?: string;
  network?: number;
  total_members?: number;
  total_cycles?: number;
  total_modules?: number;
  created_at?: string;
  updated_at?: string;
  project_lead?: string | null;
  default_assignee?: string | null;
  [key: string]: unknown;
}

export interface PlaneState {
  id: string;
  name: string;
  color?: string;
  group?: string;
  default?: boolean;
  sequence?: number;
  [key: string]: unknown;
}

export interface PlaneLabel {
  id: string;
  name: string;
  color?: string;
  [key: string]: unknown;
}

export interface PlaneWorkItem {
  id: string;
  name: string;
  description_html?: string;
  description_stripped?: string;
  priority?: string;
  sequence_id?: number;
  project?: string;
  project_identifier?: string;
  workspace?: string;
  state?: string | { id: string; name: string; group?: string };
  assignees?: string[];
  labels?: string[];
  parent?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  is_draft?: boolean;
  [key: string]: unknown;
}

export interface PlaneCycle {
  id: string;
  name: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
  total_issues?: number;
  completed_issues?: number;
  cancelled_issues?: number;
  started_issues?: number;
  unstarted_issues?: number;
  backlog_issues?: number;
  [key: string]: unknown;
}

export interface PlaneModule {
  id: string;
  name: string;
  description?: string;
  start_date?: string | null;
  target_date?: string | null;
  status?: string;
  total_issues?: number;
  completed_issues?: number;
  cancelled_issues?: number;
  started_issues?: number;
  unstarted_issues?: number;
  backlog_issues?: number;
  [key: string]: unknown;
}

export interface PlaneComment {
  id: string;
  comment_html?: string;
  comment_stripped?: string;
  actor?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface PlaneActivity {
  id: string;
  verb?: string;
  field?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  actor?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface PlaneLink {
  id: string;
  url: string;
  title?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface PlaneIntakeIssue {
  id: string;
  issue?: PlaneWorkItem;
  status?: number;
  source?: string;
  [key: string]: unknown;
}

export interface PlanePage {
  id: string;
  name: string;
  description_html?: string;
  description_stripped?: string;
  access?: number; // 0 = public, 1 = private
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CursorPage<T> {
  results: T[];
  count?: number;
  total_count?: number;
  total_results?: number;
  total_pages?: number;
  next_cursor?: string;
  prev_cursor?: string;
  next_page_results?: boolean;
  prev_page_results?: boolean;
  [key: string]: unknown;
}
