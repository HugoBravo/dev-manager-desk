/**
 * Wire shape of a Project resource (matches the backend Project contract
 * documented in `dev-manager-backend/docs/kanban-api.md` §3.1).
 */
export interface Project {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly owner_id: number;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Patch payload accepted by `ProjectsApi.update` and the service-level
 * mutation wrappers. Every field is optional so callers can build partial
 * updates (rename, archive, unarchive) without restating the whole record.
 *
 * `archived_at` accepts either a ISO timestamp (archive) or `null`
 * (unarchive). The backend `UpdateProjectRequest` treats `null` as an
 * explicit unarchive — omitting the field leaves the existing value
 * untouched.
 */
export type ProjectPatch = Partial<Pick<Project, 'name' | 'description' | 'archived_at'>>;
