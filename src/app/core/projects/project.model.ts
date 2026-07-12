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
