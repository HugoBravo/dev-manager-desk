/**
 * Wire shape of a KanbanLabel resource (matches the backend contract
 * documented in `dev-manager-backend/docs/kanban-api.md` §3.7).
 *
 * Labels are user-scoped (NOT project-scoped). A user has one library of
 * labels and can apply them to any card in any of their projects. The
 * `name` is unique per user; the `color` is a `#RRGGBB` hex string
 * validated server-side.
 *
 * The backend sorts labels by `name` ASC on `GET /kanban-labels`. The
 * frontend mirrors that order in the library manager.
 */
export interface KanbanLabel {
  readonly id: number;
  readonly name: string;
  /** `#RRGGBB` — server-validated 7-char hex; we trust the value as-is. */
  readonly color: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Fixed 8-color palette exposed by the LabelManagerDialog. Mirrors the
 * palette seeded in `KanbanLabelFactory` on the backend so labels
 * created from the UI look the same as labels created by the test
 * suite. The backend accepts any `#RRGGBB`, but the UI restricts
 * creation to this set to keep the visual taxonomy consistent across
 * users.
 */
export const LABEL_PALETTE: readonly string[] = [
  '#64748b', // slate
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
] as const;
