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
 */
@Service()
export class BoardsStore {
  private readonly api = inject(KanbanApi);
  private readonly writeApi = inject(KanbanWriteApi);

  private readonly _boards = signal<readonly Board[]>([]);
  private readonly _currentBoard = signal<BoardDetail | null>(null);
  private readonly _loading = signal<BoardsStoreLoading>('idle');
  private readonly _error = signal<ApiError | null>(null);

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
   * Loading convenience: returns `true` while a *specific* fetch is in
   * flight. Used by the pages to drive their skeletons without coupling to
   * the store's internal tri-state.
   */
  readonly isListLoading = computed(() => this._loading() === 'list');
  readonly isDetailLoading = computed(() => this._loading() === 'detail');

  /**
   * Fetch the boards list for a project. Sets the store's `error` signal
   * on failure and returns `null` so callers using `await` don't have to
   * wrap in try/catch (the page reads `store.error()` for the user message).
   */
  async loadBoards(projectId: number): Promise<readonly Board[] | null> {
    this._loading.set('list');
    this._error.set(null);
    try {
      const list = await firstValueFrom(this.api.listBoards(projectId));
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
   * Fetch the board detail (board + columns + cards-per-column). Writes the
   * detail cache. On error, sets `store.error()` and returns `null` so the
   * page renders the error state without a re-throw.
   */
  async loadBoard(projectId: number, boardId: number): Promise<BoardDetail | null> {
    this._loading.set('detail');
    this._error.set(null);
    try {
      const detail = await firstValueFrom(this.api.getBoardDetail(projectId, boardId));
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
    const previousColumnId = findPreviousColumn(current, card.id, card.column_id);
    const nextCardsByColumn: Record<string, readonly KanbanCard[]> = {
      ...current.cardsByColumnId,
    };

    if (previousColumnId !== null && previousColumnId !== card.column_id) {
      // Cross-column move: remove from source, insert into target.
      const sourceList = (nextCardsByColumn[String(previousColumnId)] ?? []).filter(
        (c) => c.id !== card.id,
      );
      nextCardsByColumn[String(previousColumnId)] = sourceList;
    }

    const targetList = (nextCardsByColumn[String(card.column_id)] ?? []).filter(
      (c) => c.id !== card.id,
    );
    nextCardsByColumn[String(card.column_id)] = [...targetList, card];

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
}

/**
 * Find which column the card was in before this mutation. Because the server
 * returns the *new* `column_id`, we have to search every column's card list
 * for an entry that is NOT already on the target column.
 */
function findPreviousColumn(
  detail: BoardDetail,
  cardId: number,
  targetColumnId: number,
): number | null {
  for (const [columnIdStr, cards] of Object.entries(detail.cardsByColumnId)) {
    const columnId = Number(columnIdStr);
    if (columnId === targetColumnId) {
      continue;
    }
    if (cards.some((c) => c.id === cardId)) {
      return columnId;
    }
  }
  return null;
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
