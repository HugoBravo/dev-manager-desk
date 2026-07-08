/**
 * Wire shape of a Column resource (matches the backend contract documented in
 * `dev-manager-backend/docs/kanban-api.md` §3.3). Naming the type `KanbanColumn`
 * — not `Column` — avoids clashing with the reserved HTML/SVG attribute name.
 */
export interface KanbanColumn {
  readonly id: number;
  readonly board_id: number;
  readonly name: string;
  readonly position: string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}
