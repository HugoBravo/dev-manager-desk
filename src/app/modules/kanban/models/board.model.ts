/**
 * Wire shape of a Board resource (matches the backend contract documented in
 * `dev-manager-backend/docs/kanban-api.md` §3.2).
 *
 * Boards belong to a Project. Cross-project access collapses to a single
 * `notFound` at the error layer (see `ErrorNormalizer`).
 *
 * `deleted_at` is optional in the wire shape: the default active resource
 * omits it (or sets it to `null`), and the trash endpoint returns it as a
 * non-null ISO timestamp. The optional field keeps existing fixtures and
 * test samples backward-compatible — the store treats `null` and `undefined`
 * equivalently when sorting / filtering.
 */
export interface Board {
  readonly id: number;
  readonly project_id: number;
  readonly name: string;
  readonly position: string;
  readonly archived_at: string | null;
  readonly deleted_at?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Wire shape of a Board audit log entry (api-doc §19, backend
 * `KanbanBoardAuditLog`). The paginated endpoint returns these in a Laravel
 * paginator envelope; {@link KanbanWriteApi.fetchBoardAudit} unwraps it.
 */
export interface BoardAuditLog {
  readonly id: number;
  readonly board_id: number;
  readonly actor_user_id: number | null;
  readonly action:
    | 'created'
    | 'renamed'
    | 'archived'
    | 'unarchived'
    | 'deleted'
    | 'restored'
    | 'purged'
    | 'cloned'
    | 'reordered';
  readonly payload: Readonly<Record<string, unknown>>;
  readonly created_at: string;
}

/**
 * One item in a bulk operation response. The `status` mirrors the per-board
 * HTTP outcome (`200` for rename, `204` for delete, `404` for cross-owner,
 * `409` for conflict, `422` for validation).
 */
export interface BulkOperationItem {
  readonly id: number;
  readonly status: 200 | 204 | 404 | 409 | 422;
  readonly error?: { readonly code: string; readonly message?: string };
}

/**
 * Bulk operation result envelope (api-doc §18). `summary` is convenient for
 * UI rendering without iterating `results`.
 */
export interface BulkOperationResult {
  readonly results: readonly BulkOperationItem[];
  readonly summary: { readonly total: number; readonly ok: number; readonly failed: number };
}
