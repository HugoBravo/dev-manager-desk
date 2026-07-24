/**
 * Discriminated union for typed kanban API errors. Every variant carries the
 * raw `status` so the UI can render status-aware copy without re-deriving it
 * from `kind`.
 *
 * Non-negotiable: cross-owner 404 collapses to `notFound` (the same variant
 * that a genuinely-missing resource produces). Downstream code MUST NOT branch
 * on the original cause of the 404 — that would leak ownership information.
 */
export type ApiError =
  | { readonly kind: 'network'; readonly status: 0; readonly message: string }
  | { readonly kind: 'unauthorized'; readonly status: 401; readonly message: string }
  | {
      readonly kind: 'forbidden';
      readonly status: 403;
      readonly message: string;
      readonly code?: 'edit_window_expired';
    }
  | { readonly kind: 'notFound'; readonly status: 404; readonly message: string }
  | {
      readonly kind: 'validation';
      readonly status: 422;
      readonly message: string;
      readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
      readonly code?: 'position_exhausted' | 'attachment_mime_blocked';
    }
  | {
      readonly kind: 'conflict';
      readonly status: 409;
      readonly message: string;
      /**
       * Optional. A typed 409 (board_has_contents / column_has_contents /
       * task_has_active_boards) carries a `code`; an untyped 409 does NOT —
       * the UI must fall back to a generic conflict message via
       * {@link ErrorNormalizer.toUserMessage}.
       */
      readonly code?: 'board_has_contents' | 'column_has_contents' | 'task_has_active_boards';
    }
  | {
      readonly kind: 'http';
      readonly status: number;
      readonly message: string;
    };
