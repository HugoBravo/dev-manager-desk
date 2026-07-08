/**
 * Wire shape of a Comment resource (matches the backend contract documented in
 * `dev-manager-backend/docs/kanban-api.md` §3.5).
 *
 * Comments are children of Cards. `body` is **canonical text** per api-doc §13
 * (NOT Markdown — render with `MarkdownPipe` is intentional in PR4 per the
 * orchestrator brief: comments are rendered with the same sanitized pipeline
 * the spec calls "first ~200 chars of `card.body`, plain text" for PR2; the
 * PR4 brief is explicit that `MarkdownPipe` IS applied to `comment.body` in
 * `CardDetailDialog`).
 *
 * `parent_id` is nullable (api-doc §14 thread-per-author). Same-author replies
 * use `parent_id`; different authors create new top-level comments.
 */
export interface KanbanComment {
  readonly id: number;
  readonly card_id: number;
  readonly parent_id: number | null;
  readonly author_id: number | string;
  readonly body: string;
  readonly created_at: string;
  readonly updated_at: string;
}