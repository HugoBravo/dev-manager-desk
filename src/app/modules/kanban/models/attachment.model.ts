/**
 * Wire shape of an Attachment resource (matches the backend contract documented
 * in `dev-manager-backend/docs/kanban-api.md` §3.6).
 *
 * `url` is **always `null` in v1** (api-doc §15) — the download endpoint has
 * not shipped yet. The desk app must NOT render a download action; metadata
 * only (name, size, mime). When the backend adds a download endpoint, the
 * shape stays compatible: only `url` flips from `null` to a string.
 */
export interface KanbanAttachment {
  readonly id: number;
  readonly card_id: number;
  readonly uploader_id: number | string;
  readonly disk: string;
  readonly path: string;
  readonly original_filename: string;
  readonly mime: string;
  readonly size_bytes: number;
  readonly url: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}