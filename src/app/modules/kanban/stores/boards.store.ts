import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ApiError } from '../../../core/errors/api-error';
import type { Board, BoardDetail, KanbanCard, KanbanColumn } from '../models';
import { KanbanApi } from '../api/kanban.api';
import { KanbanWriteApi } from '../api/kanban-write.api';

/**
 * Loading state tri-state for the store. `'idle'` means the store has data
 * (or has never been loaded). `'list'` / `'detail'` are exclusive — a list
 * fetch does not block a detail fetch and vice versa.
 */
export type BoardsStoreLoading = 'idle' | 'list' | 'detail';

/**
 * Signal-backed store for the boards list and the current board detail.
 *
 * ## Why a store now?
 *
 * PR2 used page-local signals because there were no writes. PR3 introduces
 * cross-page invalidation: a card create / move / archive / restore / delete
 * in `BoardDetailPage` must also refresh the list cache so a navigation back
 * to `BoardsListPage` shows the updated `archived_at` counts. A single store
 * gives both pages a shared source of truth without round-tripping through a
 * service bus.
 *
 * The store does NOT own the write logic — that lives in {@link KanbanWriteApi}.
 * The store is a *cache* (with an `error` signal) that the pages write into
 * after a successful mutation. The write API is responsible for normalizing
 * the request and routing errors through the normalizer (W3 contract).
 *
 * ## Server-confirmed moves
 *
 * The store exposes a single `applyCardMutation(card: KanbanCard)` method
 * that pages call from their `serverConfirmedMove()` `onSuccess` handler.
 * Because the server returned a resource with the canonical `position`, the
 * store can do a surgical update of the affected column's card list without
 * a refetch.
 *
 * ## Kanban-per-task taskId threading (S1)
 *
 * Every URL-scoped API call (reads AND writes) requires `taskId`. The store
 * carries a single `taskId` slot set via {@link setTaskId} before any
 * read/write is issued; pages call `store.setTaskId(taskId)` once on
 * activation. Internally the store fails fast (throws) if `taskId` is
 * missing when an API call is dispatched — this guarantees the URL chain is
 * always complete and surfaces a programmer error in tests instead of
 * silently dropping the segment.
 */
@Service()
export class BoardsStore {
  private readonly api = inject(KanbanApi);
  private readonly writeApi = inject(KanbanWriteApi);

  private readonly _boards = signal<readonly Board[]>([]);
  private readonly _trash = signal<readonly Board[]>([]);
  private readonly _currentBoard = signal<BoardDetail | null>(null);
  private readonly _loading = signal<BoardsStoreLoading>('idle');
  private readonly _trashLoading = signal<boolean>(false);
  private readonly _error = signal<ApiError | null>(null);

  /**
   * The currently-active task id. Set via {@link setTaskId} from the page
   * that owns the route param (S2); cleared via {@link clearTaskId} on
   * navigation away. Every URL-scoped API call reads this slot.
   */
  private _taskId: number | null = null;

  /**
   * Bind the store to a specific task. Called by the owning page on init
   * and on route-param change. The value is required for every URL-scoped
   * API call — pages must set it before triggering reads or writes.
   */
  setTaskId(taskId: number): void {
    this._taskId = taskId;
  }

  /**
   * Clear the task binding. Call this in `ngOnDestroy` / route cleanup so a
   * stale taskId doesn't leak into the next page's API calls.
   */
  clearTaskId(): void {
    this._taskId = null;
  }

  /**
   * Read-only access to the active task id. Throws if not set; use this in
   * callers that need to forward the id to write APIs directly.
   */
  get taskId(): number {
    if (this._taskId === null) {
      throw new Error(
        'BoardsStore: taskId is not set. Call setTaskId(taskId) before triggering API calls.',
      );
    }
    return this._taskId;
  }

  /**
   * Returns the active task id or throws. Use this in API wrappers so the
   * failure surfaces immediately when a page forgot to call
   * {@link setTaskId}.
   */
  private requireTaskId(): number {
    if (this._taskId === null) {
      throw new Error(
        'BoardsStore: taskId is not set. Call setTaskId(taskId) before triggering API calls.',
      );
    }
    return this._taskId;
  }

  readonly boards = this._boards.asReadonly();
  /**
   * Public writer for the boards cache. Used by pages that issue their own
   * HTTP request and want to commit the result to the store. Internal
   * callers (the write flows in PR3) use the dedicated `apply*` methods
   * which also run the relevant invalidations.
   */
  readonly boardsCache = {
    set: (boards: readonly Board[]) => this._boards.set(boards),
    update: (fn: (prev: readonly Board[]) => readonly Board[]) => this._boards.update(fn),
  };
  readonly currentBoard = this._currentBoard.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Trash list signal (api-doc §16 trash). Populated by {@link loadTrash}
   * and consumed by the {@link BoardTrashPage}. Distinct from the active
   * `boards` signal because the two views have orthogonal lifecycles and
   * pagination semantics — separating them avoids accidental cross-filtering.
   */
  readonly trash = this._trash.asReadonly();
  /**
   * `true` while a trash fetch is in flight. Drives the trash page's
   * loading skeleton without coupling to the global `loading` tri-state.
   */
  readonly trashLoading = this._trashLoading.asReadonly();

  /**
   * Loading convenience: returns `true` while a *specific* fetch is in
   * flight. Used by the pages to drive their skeletons without coupling to
   * the store's internal tri-state.
   */
  readonly isListLoading = computed(() => this._loading() === 'list');
  readonly isDetailLoading = computed(() => this._loading() === 'detail');

  /**
   * Fetch the boards list for a task. Sets the store's `error` signal
   * on failure and returns `null` so callers using `await` don't have to
   * wrap in try/catch (the page reads `store.error()` for the user message).
   *
   * Requires {@link setTaskId} to have been called.
   */
  async loadBoards(projectId: number): Promise<readonly Board[] | null> {
    const taskId = this.requireTaskId();
    this._loading.set('list');
    this._error.set(null);
    try {
      const list = await firstValueFrom(this.api.listBoards(projectId, taskId));
      this._boards.set(list);
      return list;
    } catch (err) {
      this._error.set(toApiError(err));
      return null;
    } finally {
      this._loading.set('idle');
    }
  }

  /**
   * Fetch the soft-deleted boards for a task (api-doc §16 trash). Sets
   * `trashLoading` while in flight and writes the result into the `trash`
   * signal. On failure, sets `store.error()` and returns `null` — the trash
   * page renders the error state without a re-throw.
   *
   * Requires {@link setTaskId} to have been called.
   */
  async loadTrash(projectId: number, page = 1): Promise<readonly Board[] | null> {
    const taskId = this.requireTaskId();
    this._trashLoading.set(true);
    this._error.set(null);
    try {
      const list = await firstValueFrom(
        this.api.listTrashedBoards(projectId, taskId, page),
      );
      this._trash.set(list);
      return list;
    } catch (err) {
      this._error.set(toApiError(err));
      return null;
    } finally {
      this._trashLoading.set(false);
    }
  }

  /**
   * Fetch the board detail (board + columns + cards-per-column). Writes the
   * detail cache. On error, sets `store.error()` and returns `null` so the
   * page renders the error state without a re-throw.
   *
   * Requires {@link setTaskId} to have been called.
   */
  async loadBoard(projectId: number, boardId: number): Promise<BoardDetail | null> {
    const taskId = this.requireTaskId();
    this._loading.set('detail');
    this._error.set(null);
    try {
      const detail = await firstValueFrom(
        this.api.getBoardDetail(projectId, taskId, boardId),
      );
      this._currentBoard.set(detail);
      return detail;
    } catch (err) {
      this._error.set(toApiError(err));
      return null;
    } finally {
      this._loading.set('idle');
    }
  }

  /**
   * Replace a card in the current board's card cache with the server-returned
   * resource. Used by `serverConfirmedMove()` `onSuccess` callbacks.
   *
   * If the card moved across columns, the entry is removed from the source
   * column and inserted into the target column at the new server-computed
   * position. The store does NOT sort by `position` here — the server's
   * `position` value is opaque, and the visual order is whatever the server
   * returned (which may match the column's natural order; the page renders
   * columns + cards in the order returned).
   */
  applyCardMutation(card: KanbanCard): void {
    const current = this._currentBoard();
    if (current === null) {
      return;
    }
    const nextCardsByColumn: Record<string, readonly KanbanCard[]> = {};

    // Remove the card from every column it might be in. The cache may
    // have drifted from the server (e.g. a previous mutation that did
    // not finish or a state where the same card appears in multiple
    // columns); the only safe move is to wipe all references and
    // re-insert under the server-returned column_id. This avoids the
    // "card appears in two columns" or "card never moved" bugs that
    // happen when findPreviousColumn returns the wrong column.
    let changed = false;
    for (const [columnIdStr, cards] of Object.entries(current.cardsByColumnId)) {
      const filtered = cards.filter((c) => c.id !== card.id);
      if (filtered.length !== cards.length) {
        changed = true;
      }
      nextCardsByColumn[columnIdStr] = filtered;
    }

    // Insert the card at the end of its target column. We don't sort
    // by position locally — the server's `position` is opaque and the
    // visual order matches what the server returned for this move.
    const targetKey = String(card.column_id);
    const targetList = [...(nextCardsByColumn[targetKey] ?? [])];
    targetList.push(card);
    nextCardsByColumn[targetKey] = targetList;
    changed = true;

    if (!changed) {
      // Defensive: the card wasn't anywhere in the cache and we just
      // added it under its server-returned column. Nothing else to do.
      void card;
    }

    this._currentBoard.set({
      ...current,
      cardsByColumnId: nextCardsByColumn,
    });
  }

  /**
   * Insert a freshly-created card into the current board's target column.
   * The server returns the canonical `position`; the store appends the card
   * to the target column's list (the page renders in arrival order — see
   * PR2 verify-report S4 for the same approach in the read-only viewer).
   */
  applyCardCreated(card: KanbanCard): void {
    this.applyCardMutation(card);
  }

  /**
   * Remove a card from the current board (called after a successful delete).
   * Idempotent — if the card is not in the cache, this is a no-op.
   */
  applyCardRemoved(cardId: number): void {
    const current = this._currentBoard();
    if (current === null) {
      return;
    }
    const nextCardsByColumn: Record<string, readonly KanbanCard[]> = {};
    let changed = false;
    for (const [columnId, cards] of Object.entries(current.cardsByColumnId)) {
      const filtered = cards.filter((c) => c.id !== cardId);
      if (filtered.length !== cards.length) {
        changed = true;
      }
      nextCardsByColumn[columnId] = filtered;
    }
    if (!changed) {
      return;
    }
    this._currentBoard.set({
      ...current,
      cardsByColumnId: nextCardsByColumn,
    });
  }

  /**
   * Update a board's metadata (e.g. `archived_at`) in the list cache. Used
   * by the archive / restore flow if it ever runs against a board-level
   * action. PR3 doesn't expose board archive/restore in the UI, but the
   * method is here for symmetry.
   */
  applyBoardUpdated(board: Board): void {
    const next = this._boards().map((b) => (b.id === board.id ? board : b));
    this._boards.set(next);
  }

  /**
   * Push a freshly-created board into the active boards cache and re-sort
   * by `position` ASC. The server returns the canonical `position` (api-doc
   * §16 create); sorting client-side keeps the list stable when boards
   * are inserted out-of-order by concurrent operations.
   *
   * Idempotent: if a board with the same id already exists, the entry is
   * replaced in place (treat as update). This guards against a race where
   * the optimistic commit lands before the server's authoritative response.
   */
  applyBoardCreated(board: Board): void {
    const existing = this._boards();
    const without = existing.filter((b) => b.id !== board.id);
    const next = sortBoardsByPosition([...without, board]);
    this._boards.set(next);
  }

  /**
   * Drop a board from the active boards cache. Idempotent — a missing id
   * is a no-op, so callers can fire-and-forget on a destroy path without
   * worrying about double-application (e.g. an undo snackbar followed by
   * the original delete's later cache commit).
   */
  applyBoardRemoved(boardId: number): void {
    const before = this._boards();
    const next = before.filter((b) => b.id !== boardId);
    if (next.length === before.length) {
      return;
    }
    this._boards.set(next);
  }

  /**
   * Insert a freshly-restored board into the active cache. The restored
   * board's `deleted_at` is `null` and the server returns a fresh
   * `position`; we re-sort by position ASC to keep the cache stable.
   */
  applyBoardRestored(board: Board): void {
    const existing = this._boards();
    const without = existing.filter((b) => b.id !== board.id);
    const next = sortBoardsByPosition([...without, board]);
    this._boards.set(next);
  }

  /**
   * Insert a freshly-cloned board into the active cache. The source board
   * is unchanged — clone does NOT remove the source from the project. If
   * the source isn't in the cache (e.g. the user navigated straight from
   * the detail page), only the clone is appended.
   */
  applyBoardCloned(board: Board): void {
    this.applyBoardCreated(board);
  }

  /**
   * Drop a board from the trash cache (api-doc §16 restore on the
   * frontend). Idempotent: a missing id is a no-op. Used by
   * {@link BoardTrashPage} after a successful restore so the page
   * reflects the server's state without a refetch.
   */
  applyTrashBoardRemoved(boardId: number): void {
    const before = this._trash();
    const next = before.filter((b) => b.id !== boardId);
    if (next.length === before.length) {
      return;
    }
    this._trash.set(next);
  }

  /**
   * Invalidate (clear) the boards list cache. Used by the write paths when
   * the mutation might affect a board not currently rendered.
   */
  invalidateList(): void {
    this._boards.set([]);
  }

  /**
   * Invalidate (clear) the current board detail cache. Forces the next
   * `loadBoard()` to fetch from the server.
   */
  invalidateDetail(): void {
    this._currentBoard.set(null);
  }

  /**
   * Strip a label id out of every card's `labels` array across every
   * column in the current board. Used by {@link LabelsStore.remove}
   * after a successful DELETE so the UI doesn't render an orphan chip
   * that the server has already unlinked via FK cascade.
   *
   * No-op if the current board is `null` or no card carried the label.
   * The method never reaches for the network — it's a pure cache
   * mutation.
   */
  pruneLabelFromCards(labelId: number): void {
    const current = this._currentBoard();
    if (current === null) {
      return;
    }
    let changed = false;
    const nextCardsByColumn: Record<string, readonly KanbanCard[]> = {};
    for (const [columnId, cards] of Object.entries(current.cardsByColumnId)) {
      const stripped = cards.map((c) => {
        if (!c.labels.some((l) => l.id === labelId)) {
          return c;
        }
        changed = true;
        return {
          ...c,
          labels: c.labels.filter((l) => l.id !== labelId),
        };
      });
      nextCardsByColumn[columnId] = stripped;
    }
    if (!changed) {
      return;
    }
    this._currentBoard.set({
      ...current,
      cardsByColumnId: nextCardsByColumn,
    });
  }

  /**
   * Convenience accessor for components that want to import the write API
   * through the same surface. Not strictly necessary — pages inject
   * `KanbanWriteApi` directly — but documented so consumers understand the
   * layering.
   */
  get writeApiInstance(): KanbanWriteApi {
    return this.writeApi;
  }

  /**
   * Convenience accessor: returns the columns array from the current detail,
   * or `[]` if none. Lets templates iterate without nullish checks.
   */
  readonly currentColumns = computed<readonly KanbanColumn[]>(
    () => this._currentBoard()?.columns ?? [],
  );

  /**
   * Reactive accessor: a signal that returns the cards-by-column map of the
   * current board detail. Templates can read `cardsByColumn()` and Angular's
   * signal-based change detection will re-render when the map mutates.
   *
   * Prefer this over {@link cardsFor} when you need template reactivity.
   * `cardsFor(columnId)` is a plain function and will NOT trigger re-render
   * by itself — it has to be called inside an already-reactive context.
   */
  readonly cardsByColumn = computed<Readonly<Record<string, readonly KanbanCard[]>>>(
    () => this._currentBoard()?.cardsByColumnId ?? {},
  );

  /**
   * Convenience accessor: returns the cards for a column from the current
   * detail, or `[]` if the column is unknown / no detail is loaded.
   *
   * NOTE: this is a plain function, not a signal. Callers that need template
   * reactivity should read {@link cardsByColumn} directly (e.g.,
   * `cardsByColumn()[String(columnId)] ?? []`) so the change detection cycle
   * re-runs when the underlying signal mutates.
   */
  cardsFor(columnId: number): readonly KanbanCard[] {
    const current = this._currentBoard();
    if (current === null) {
      return [];
    }
    return current.cardsByColumnId[String(columnId)] ?? [];
  }

  // --- Column mutation helpers (commit 3) ---

  /**
   * Append a server-returned column to the current board's column list
   * and seed an empty card map entry for it. The server returns the
   * canonical `position`; the page renders columns in array order.
   *
   * No-op if the current board is `null` (the caller should refresh via
   * `loadBoard()` to adopt the new column into the cache).
   */
  applyColumnCreated(column: KanbanColumn): void {
    const current = this._currentBoard();
    if (current === null) {
      return;
    }
    if (current.columns.some((c) => c.id === column.id)) {
      // Idempotent: a column with this id is already in the cache. Treat
      // as an update instead of an append so we don't double-render.
      this.applyColumnUpdated(column);
      return;
    }
    const nextCardsByColumn: Record<string, readonly KanbanCard[]> = {
      ...current.cardsByColumnId,
      [String(column.id)]: [],
    };
    this._currentBoard.set({
      ...current,
      columns: [...current.columns, column],
      cardsByColumnId: nextCardsByColumn,
    });
  }

  /**
   * Replace the column matching `column.id` in the current cache. Used
   * after rename / archive / restore / move / reorder-refresh so the UI
   * reflects the server-computed `position`, `archived_at`, etc.
   *
   * No-op if no column with the id exists in the cache OR if the cache
   * is unloaded. Callers that hit the unloaded branch should fall back
   * to `loadBoard()` so the next render reflects the change.
   */
  applyColumnUpdated(column: KanbanColumn): void {
    const current = this._currentBoard();
    if (current === null) {
      return;
    }
    let changed = false;
    const nextColumns = current.columns.map((c) => {
      if (c.id !== column.id) {
        return c;
      }
      changed = true;
      return column;
    });
    if (!changed) {
      return;
    }
    this._currentBoard.set({ ...current, columns: nextColumns });
  }

  /**
   * Remove a column (and its card map) from the current cache. Used
   * after a successful DELETE; the server cascades any FK references.
   * All cards under the removed column are dropped — they're gone with
   * the column on the server (404 returns for the cards' column_id).
   *
   * No-op if no column with the id exists OR if the cache is unloaded.
   */
  applyColumnRemoved(columnId: number): void {
    const current = this._currentBoard();
    if (current === null) {
      return;
    }
    const nextColumns = current.columns.filter((c) => c.id !== columnId);
    if (nextColumns.length === current.columns.length) {
      return;
    }
    const nextCardsByColumn: Record<string, readonly KanbanCard[]> = {};
    for (const [key, cards] of Object.entries(current.cardsByColumnId)) {
      if (Number(key) === columnId) {
        continue;
      }
      nextCardsByColumn[key] = cards;
    }
    this._currentBoard.set({
      ...current,
      columns: nextColumns,
      cardsByColumnId: nextCardsByColumn,
    });
  }

  /**
   * Replace the entire column array with the supplied list. Card maps
   * stay untouched — the column ids are preserved, only their order /
   * identity in the list changes. Used after a successful reorder
   * (api-doc §6.6) where the server returns a count, not the list — the
   * caller refetches via {@link KanbanApi.listColumns} and commits the
   * result through this method.
   */
  replaceColumnOrder(columns: readonly KanbanColumn[]): void {
    const current = this._currentBoard();
    if (current === null) {
      return;
    }
    this._currentBoard.set({ ...current, columns: [...columns] });
  }
}

function toApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'kind' in err) {
    return err as ApiError;
  }
  return {
    kind: 'network',
    status: 0,
    message:
      err &&
      typeof err === 'object' &&
      'message' in err &&
      typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'Could not reach the server.',
  };
}

/**
 * Sort boards by their server-computed `position` string (lexorank). The
 * backend uses fraccional indexing with a 36-char alphabet; we delegate to
 * the native `String.localeCompare` because the alphabet is a contiguous
 * ASCII range where lexicographic order matches server order.
 */
function sortBoardsByPosition(boards: readonly Board[]): readonly Board[] {
  return [...boards].sort((a, b) => a.position.localeCompare(b.position));
}
