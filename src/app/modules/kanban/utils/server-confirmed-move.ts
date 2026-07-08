import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { Observable, isObservable } from 'rxjs';

import type { ApiError } from '../../../core/errors/api-error';

/**
 * Context passed to {@link ServerConfirmedMoveOptions.move}. The caller
 * derives the context from the drop event (e.g. source column id, target
 * column id, target index) and passes it through. The context is also
 * forwarded to `onSuccess` so the caller can correlate the response with
 * the original intent.
 */
export type ServerConfirmedMoveContext = Readonly<Record<string, unknown>>;

/**
 * Options accepted by {@link serverConfirmedMove}. The `applyLocal` field is a
 * **compile-time guard**: its type is `never`, so TypeScript rejects any
 * attempt to pass an optimistic local-mutation callback. This is the
 * enforcement mechanism for the non-negotiable "no optimistic reorders"
 * contract (spec `kanban-write` F3 + design AD #7).
 */
export interface ServerConfirmedMoveOptions<TResponse> {
  /**
   * Build the server-call Observable. Called once per drop. Returning a
   * fresh Observable per drop is intentional — the caller should not
   * pre-build before the drop happens (otherwise the move fires even when
   * the user cancels the drag).
   *
   * The Observable must already have errors normalized to `ApiError` (use
   * `catchHttpError` in the API layer).
   */
  readonly move: (event: CdkDragDrop<unknown, unknown, any>) => Observable<TResponse>;

  /**
   * Called with the server's response on `next`. By the time this fires the
   * server has computed the canonical `position`; the caller MUST write the
   * server-returned resource into the local signal cache (NOT a local guess).
   * The function NEVER fires before `move()` resolves successfully.
   */
  readonly onSuccess: (
    response: TResponse,
    event: CdkDragDrop<unknown, unknown, any>,
  ) => void;

  /**
   * Called with the normalized `ApiError` on error. Since we never mutated
   * local state before the response, no rollback is necessary — the caller's
   * implementation is typically a snackbar + invalidation trigger.
   */
  readonly onError: (
    apiError: ApiError,
    event: CdkDragDrop<unknown, unknown, any>,
  ) => void;

  /**
   * **COMPILE-TIME GUARD.** Always `never`. The presence of this field in
   * the type is intentional: any object literal that assigns
   * `applyLocal: <anything>` will be rejected by the TypeScript compiler.
   * Tests assert this guard with a `// @ts-expect-error` comment.
   */
  readonly applyLocal?: never;
}

/**
 * Wire a `cdkDropList.dropped` event to a **server-confirmed write**.
 *
 * The contract is enforced by the type signature (`applyLocal?: never`) and by
 * the runtime behavior (the handler does NOTHING until `move()` resolves
 * successfully). Local state is mutated only via {@link ServerConfirmedMoveOptions.onSuccess},
 * which the caller implements with a server-returned resource.
 *
 * Why this exists:
 * - The kanban API uses **fractional-indexing** for `position` (api-doc §12).
 *   The server computes the canonical string; the client CANNOT compute it
 *   locally.
 * - Optimistic local mutation before the server response causes desync when
 *   the server rejects or reorders the move (e.g. `422 position_exhausted`).
 *
 * Tests (`server-confirmed-move.spec.ts`) assert that:
 *   1. The `onSuccess` callback fires AFTER the HTTP `next` callback.
 *   2. The `onError` callback fires with a normalized `ApiError` on HTTP error.
 *   3. No local-state write happens before success.
 *   4. The `applyLocal?: never` guard is a compile-time error (via `// @ts-expect-error`).
 *
 * Usage (board-detail.page.ts):
 * ```ts
 * protected readonly handleDrop = serverConfirmedMove<KanbanCard>({
 *   move: (event) =>
 *     this.writeApi.moveCard(projectId, boardId, sourceColumnId, cardId, {
 *       target_column_id: targetColumnId,
 *     }),
 *   onSuccess: (card, event) => this.store.applyMove(card),
 *   onError: (err, event) => this.handleMoveError(err),
 * });
 * ```
 */
export function serverConfirmedMove<TResponse>(
  opts: ServerConfirmedMoveOptions<TResponse>,
): (event: CdkDragDrop<unknown>) => void {
  // Reference `opts.applyLocal` so the type guard stays in the public type
  // signature (and so unused-variable linters do not strip it).
  const applyLocalGuard: never | undefined = opts.applyLocal;
  void applyLocalGuard;

  return (event: CdkDragDrop<unknown>) => {
    // Cast to the wider event shape so callers can pass any
    // `cdkDropListData` shape. The narrower inference (e.g. `CdkDragDrop<{
    // columnId: number }, ...>`) is what the template binds to, but
    // structurally we only read `event.item.data`, `event.container.data`,
    // and the index fields — all present on the wider shape.
    const wide = event as CdkDragDrop<unknown, unknown, any>;
    const response$ = opts.move(wide);
    if (!isObservable(response$)) {
      // Defensive runtime guard. The signature promises an Observable;
      // anything else is a programmer error. We surface it as a network
      // error so the caller does not silently swallow a bug.
      const apiError: ApiError = {
        kind: 'network',
        status: 0,
        message: 'serverConfirmedMove: move() did not return an Observable.',
      };
      opts.onError(apiError, wide);
      return;
    }

    response$.subscribe({
      next: (response: TResponse) => {
        // Commit ONLY the server-returned resource. The caller is forbidden
        // from passing an optimistic callback (compile-time guard) so the
        // signal write here is the ONLY local state mutation for this drop.
        opts.onSuccess(response, wide);
      },
      error: (err: unknown) => {
        const apiError: ApiError = toApiError(err);
        opts.onError(apiError, wide);
      },
    });
  };
}

/**
 * Narrow whatever `move()` threw into an `ApiError`. The API layer should
 * already pipe through `catchHttpError`, so this is a defensive fallback.
 */
function toApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'kind' in err) {
    return err as ApiError;
  }
  return {
    kind: 'network',
    status: 0,
    message:
      err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'Unexpected error during move.',
  };
}