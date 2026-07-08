/**
 * Wire shape of a Board resource (matches the backend contract documented in
 * `dev-manager-backend/docs/kanban-api.md` §3.2).
 *
 * Boards belong to a Project. Cross-project access collapses to a single
 * `notFound` at the error layer (see `ErrorNormalizer`).
 */
export interface Board {
  readonly id: number;
  readonly project_id: number;
  readonly name: string;
  readonly position: string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}
