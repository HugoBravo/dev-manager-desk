/**
 * Wire shape of a Card resource (matches the backend contract documented in
 * `dev-manager-backend/docs/kanban-api.md` §3.4).
 *
 * `body` is raw Markdown verbatim from the server (api-doc §13); the renderer
 * is the responsibility of the consumer (`MarkdownPipe` in PR4). PR2 shows the
 * truncated body as plain text only.
 *
 * `due_date` is a `YYYY-MM-DD` date string OR `null` (api-doc §2.6). It is NOT
 * an ISO timestamp; do not parse it as one.
 */
export interface KanbanCard {
  readonly id: number;
  readonly column_id: number;
  readonly title: string;
  readonly body: string | null;
  readonly due_date: string | null;
  readonly archived_at: string | null;
  readonly position: string;
  readonly created_at: string;
  readonly updated_at: string;
}
