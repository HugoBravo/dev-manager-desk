import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  Component,
  ElementRef,
  DestroyRef,
  AfterViewInit,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import type { ApiError } from '../../../core/errors/api-error';
import { ProjectService } from '../../../core/projects/project.service';
import { KanbanApi } from '../api/kanban.api';
import { KanbanWriteApi } from '../api/kanban-write.api';
import {
  CardDetailDialog,
  type CardDetailDialogData,
  type CardDetailDialogResult,
} from '../components/card-detail-dialog/card-detail-dialog';
import {
  CardEditorDialog,
  type CardEditorDialogData,
  type CardEditorDialogResult,
} from '../components/card-editor-dialog/card-editor-dialog';
import {
  ColumnEditorDialog,
  type ColumnEditorDialogData,
  type ColumnEditorDialogResult,
} from '../components/column-editor-dialog/column-editor-dialog';
import { CardLabelsStrip } from '../components/card-labels-strip/card-labels-strip';
import {
  LabelManagerDialog,
  type LabelManagerDialogData,
  type LabelManagerDialogResult,
} from '../components/label-manager-dialog/label-manager-dialog';
import type { BoardDetail, KanbanCard, KanbanColumn } from '../models';
import { BoardsStore } from '../stores/boards.store';
import { serverConfirmedMove } from '../utils/server-confirmed-move';

/**
 * Board detail (PR3). Renders columns + cards, supports CDK drag-drop with
 * **server-confirmed reorders only** (no optimistic mutations), and exposes
 * card edit / archive / restore / delete via Material dialogs.
 *
 * Reads board detail from `BoardsStore` (the single source of truth) instead
 * of local page signals — this lets card writes invalidate the cache for
 * every page that renders the affected board.
 *
 * ## Drag-drop contract (non-negotiable)
 *
 * On `cdkDropList.dropped`, the page calls {@link serverConfirmedMove} which
 * wraps the move API. NO local signal mutation happens before the HTTP
 * response. The server's `position` is committed to the store on success.
 *
 * On `422 position_exhausted`, the page refetches the board detail (the
 * affected scope) and surfaces a snackbar — see {@link handleMoveError}.
 */
@Component({
  selector: 'app-board-detail-page',
  imports: [
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    CardLabelsStrip,
  ],
  templateUrl: './board-detail.page.html',
  styleUrl: './board-detail.page.scss',
  host: {
    '[attr.aria-busy]': 'isBusy()',
  },
})
export class BoardDetailPage implements AfterViewInit {
  private readonly api = inject(KanbanApi);
  private readonly writeApi = inject(KanbanWriteApi);
  private readonly store = inject(BoardsStore);
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Bound from the route via `withComponentInputBinding()` */
  readonly projectId = input.required<string>();
  /** Bound from the route via `withComponentInputBinding()` */
  readonly boardId = input.required<string>();

  protected readonly loading = computed(() => this.store.isDetailLoading());
  protected readonly error = computed(() => this.store.error());
  protected readonly detail = computed<BoardDetail | null>(() => this.store.currentBoard());
  // Reactive accessor for the cards-by-column map. Templates must read this
  // signal directly (not via the plain `cardsFor()` function) so change
  // detection re-runs after a mutation (create / archive / restore / move).
  protected readonly cardsByColumn = this.store.cardsByColumn;
  protected readonly reloadTrigger = signal(0);

  protected readonly isBusy = computed(() => this.loading());
  protected readonly current = this.projectService.current;
  protected readonly statusMessage = computed(() => {
    if (this.loading()) {
      return 'Loading board';
    }
    const err = this.error();
    if (err) {
      return ErrorNormalizer.toUserMessage(err);
    }
    return '';
  });

  protected readonly columnHeadingId = (columnId: number): string => `board-column-${columnId}`;

  /** Lookup a card by id within the current board (or `null`). */
  protected readonly cardById = (cardId: number): KanbanCard | null => {
    const detail = this.detail();
    if (!detail) {
      return null;
    }
    for (const cards of Object.values(detail.cardsByColumnId)) {
      const found = cards.find((c) => c.id === cardId);
      if (found) {
        return found;
      }
    }
    return null;
  };

  /** Find the column containing the given card id. */
  protected readonly columnOfCard = (cardId: number): KanbanColumn | null => {
    const detail = this.detail();
    if (!detail) {
      return null;
    }
    for (const [columnIdStr, cards] of Object.entries(detail.cardsByColumnId)) {
      if (cards.some((c) => c.id === cardId)) {
        const columnId = Number(columnIdStr);
        return detail.columns.find((col) => col.id === columnId) ?? null;
      }
    }
    return null;
  };

  private readonly titleRef = viewChild<ElementRef<HTMLElement>>('boardTitle');

  constructor() {
    effect(() => {
      const projectRaw = this.projectId();
      const boardRaw = this.boardId();
      // dependency tracking on reloadTrigger too
      this.reloadTrigger();

      const projectId = parseId(projectRaw);
      const boardId = parseId(boardRaw);

      if (projectId === null || boardId === null) {
        this.store.invalidateDetail();
        // Surface via the error signal; page renders the error state.
        // Use the store's error via direct API call's synthetic path.
        void this.handleInvalidRoute();
        return;
      }

      void this.store.loadBoard(projectId, boardId);
    });
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      const ref = this.titleRef();
      ref?.nativeElement.focus();
    });
  }

  protected retry(): void {
    this.reloadTrigger.update((n) => n + 1);
  }

  /**
   * Drag-drop handler. Wired through {@link serverConfirmedMove} so the
   * server-confirmed-reorder contract is enforced at the type level.
   *
   * The handler ignores the drop's `previousIndex` / `currentIndex` — those
   * are pre-mutation UI affordances. The server computes the canonical
   * `position` from the target column id alone (the backend appends to the
   * column's chain when no explicit `position` is provided).
   */
  protected readonly onCardDrop = serverConfirmedMove<KanbanCard>({
    move: (event: CdkDragDrop<unknown, unknown, any>) => {
      const cardId = Number(event.item.data);
      const card = this.cardById(cardId);
      const projectIdNum = parseId(this.projectId());
      const boardIdNum = parseId(this.boardId());
      if (card === null || projectIdNum === null || boardIdNum === null) {
        throw new Error('onCardDrop: missing card or route params');
      }
      // The target column id is carried on the drop container's `data` (set
      // via [cdkDropListData] in the template).
      const targetContainer = event.container.data as { columnId: number } | undefined;
      const targetColumnId = targetContainer?.columnId ?? card.column_id;
      return this.writeApi.moveCard(projectIdNum, boardIdNum, card.column_id, card.id, {
        to_column_id: targetColumnId,
      });
    },
    onSuccess: (card) => {
      this.store.applyCardMutation(card);
      this.snackBar.open(`Moved "${card.title}"`, 'Dismiss', { duration: 2000 });
    },
    onError: (err) => {
      this.handleMoveError(err);
    },
  });

  /**
   * Centralized error handler for move failures. 422 `position_exhausted`
   * triggers a refetch (per spec `kanban-write` F4) — NO local
   * recomputation. Other errors surface via the store's `error` signal and
   * the page's existing error UI.
   */
  private handleMoveError(err: ApiError): void {
    if (err.kind === 'validation' && err.code === 'position_exhausted') {
      this.snackBar.open(
        'Card positions were refetched due to server-side index exhaustion.',
        'Dismiss',
        { duration: 4000 },
      );
      const projectIdNum = parseId(this.projectId());
      const boardIdNum = parseId(this.boardId());
      if (projectIdNum !== null && boardIdNum !== null) {
        void this.store.loadBoard(projectIdNum, boardIdNum);
      }
      return;
    }
    this.snackBar.open(ErrorNormalizer.toUserMessage(err), 'Dismiss', {
      duration: 4000,
    });
  }

  private handleInvalidRoute(): void {
    // Synthetic error so the page renders the error state. We bypass the
    // store here because the route-level precondition failed before any
    // HTTP call would make sense.
    this.snackBar.open('Board or project is missing or invalid.', 'Dismiss', { duration: 4000 });
  }

  /**
   * Open the card detail dialog when the user clicks a card. Wired to
   * `(click)` on the card mat-card (PR2 had `tabindex="0"` but no click
   * handler).
   */
  protected openCard(card: KanbanCard, triggerElement: HTMLElement): void {
    const projectIdNum = parseId(this.projectId());
    const boardIdNum = parseId(this.boardId());
    if (projectIdNum === null || boardIdNum === null) {
      return;
    }
    const columnOfCard = this.columnOfCard(card.id);
    const columnId = columnOfCard?.id ?? card.column_id;

    const data: CardDetailDialogData = {
      card,
      projectId: projectIdNum,
      boardId: boardIdNum,
      columnId,
      triggerElement,
    };
    const ref = this.dialog.open<CardDetailDialog, CardDetailDialogData, CardDetailDialogResult>(
      CardDetailDialog,
      { data },
    );
    void ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Return focus to the trigger element (WCAG AA focus management).
        triggerElement.focus();
      });
  }

  /**
   * Open the card editor dialog in create mode. Wired to the "Add card"
   * button inside each column.
   */
  protected openCreateCard(columnId: number): void {
    const projectIdNum = parseId(this.projectId());
    const boardIdNum = parseId(this.boardId());
    if (projectIdNum === null || boardIdNum === null) {
      return;
    }
    const data: CardEditorDialogData = {
      mode: 'create',
      projectId: projectIdNum,
      boardId: boardIdNum,
      columnId,
    };
    this.dialog.open<CardEditorDialog, CardEditorDialogData, CardEditorDialogResult>(
      CardEditorDialog,
      { data },
    );
  }

  /**
   * Open the label manager dialog. The user can manage their label
   * library (create / rename / recolor / delete) from here. The
   * dialog returns focus to the trigger element on close.
   *
   * PR 1: this opens the dialog so the user can manage their library
   * without card-level integration. PR 2 will also call this from the
   * `CardDetailDialog` "Manage library" link and refresh the card
   * cache when the dialog reports a delete.
   */
  protected openLabelManager(triggerElement: HTMLElement): void {
    const data: LabelManagerDialogData = { triggerElement };
    const ref = this.dialog.open<
      LabelManagerDialog,
      LabelManagerDialogData,
      LabelManagerDialogResult
    >(LabelManagerDialog, { data });
    void firstValueFrom(ref.afterClosed()).then(() => {
      triggerElement.focus();
    });
  }

  // --- Column management (commit 3) ---

  /**
   * Open the column editor in `create` mode. Triggered by the
   * "+ Add column" affordance at the right edge of the columns row.
   */
  protected openAddColumn(triggerElement: HTMLElement): void {
    const data: ColumnEditorDialogData = { mode: 'create', triggerElement };
    const ref = this.dialog.open<
      ColumnEditorDialog,
      ColumnEditorDialogData,
      ColumnEditorDialogResult
    >(ColumnEditorDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      // Return focus regardless of outcome (WCAG AA focus management).
      triggerElement.focus();
      if (!result || result.action !== 'saved' || !result.name) {
        return;
      }
      void this.createColumn(result.name);
    });
  }

  /**
   * Open the column editor in `rename` mode. Triggered from the
   * per-column menu's "Rename" entry.
   */
  protected openRenameColumn(column: KanbanColumn, triggerElement: HTMLElement): void {
    const data: ColumnEditorDialogData = {
      mode: 'rename',
      initialName: column.name,
      triggerElement,
    };
    const ref = this.dialog.open<
      ColumnEditorDialog,
      ColumnEditorDialogData,
      ColumnEditorDialogResult
    >(ColumnEditorDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      triggerElement.focus();
      if (!result || result.action !== 'saved' || !result.name) {
        return;
      }
      if (result.name === column.name) {
        return;
      }
      void this.renameColumn(column, result.name);
    });
  }

  /**
   * Archive a column by setting `archived_at = now` server-side. The
   * server returns the updated resource; we commit via
   * {@link BoardsStore.applyColumnUpdated} and surface a snackbar.
   */
  protected archiveColumn(column: KanbanColumn): void {
    const projectIdNum = parseId(this.projectId());
    const boardIdNum = parseId(this.boardId());
    if (projectIdNum === null || boardIdNum === null) {
      return;
    }
    void this.safeColumnWrite(
      this.writeApi.updateColumn(projectIdNum, boardIdNum, column.id, {
        archived_at: new Date().toISOString(),
      }),
    ).then((updated) => {
      if (updated !== null) {
        this.snackBar.open('Archived', 'Dismiss', { duration: 2000 });
      }
    });
  }

  /**
   * Unarchive a column by setting `archived_at = null`.
   */
  protected unarchiveColumn(column: KanbanColumn): void {
    const projectIdNum = parseId(this.projectId());
    const boardIdNum = parseId(this.boardId());
    if (projectIdNum === null || boardIdNum === null) {
      return;
    }
    void this.safeColumnWrite(
      this.writeApi.updateColumn(projectIdNum, boardIdNum, column.id, {
        archived_at: null,
      }),
    ).then((updated) => {
      if (updated !== null) {
        this.snackBar.open('Restored', 'Dismiss', { duration: 2000 });
      }
    });
  }

  /**
   * Delete a column. Confirms via `window.confirm` first. On 409
   * `column_has_contents`, surfaces a snackbar with the localized
   * message; on other errors, falls back to the normalizer.
   */
  protected deleteColumn(column: KanbanColumn): void {
    const projectIdNum = parseId(this.projectId());
    const boardIdNum = parseId(this.boardId());
    if (projectIdNum === null || boardIdNum === null) {
      return;
    }
    // Browser-native confirmation step. Window.confirm is sufficient
    // for this destructive action — Material's confirm dialog would
    // require managing focus across a third dialog layer.
    const confirmed = window.confirm(
      `Delete column "${column.name}"? Cards in it must be moved first.`,
    );
    if (!confirmed) {
      return;
    }
    void firstValueFrom(
      this.writeApi.deleteColumn(projectIdNum, boardIdNum, column.id),
    )
      .then(() => {
        this.store.applyColumnRemoved(column.id);
        this.snackBar.open('Deleted', 'Dismiss', { duration: 2000 });
      })
      .catch((err: unknown) => {
        const apiError = err as ApiError | unknown;
        if (
          apiError &&
          typeof apiError === 'object' &&
          'kind' in apiError &&
          (apiError as ApiError).kind === 'conflict'
        ) {
          this.snackBar.open(
            'This column has cards. Move or delete them first.',
            'Dismiss',
            { duration: 4000 },
          );
          return;
        }
        this.snackBar.open(
          err &&
            typeof err === 'object' &&
            'kind' in err
            ? ErrorNormalizer.toUserMessage(err as ApiError)
            : 'Could not delete the column. Please try again.',
          'Dismiss',
          { duration: 4000 },
        );
      });
  }

  /**
   * Internal: POST a new column on success, commit to the store, and
   * surface a snackbar.
   */
  private async createColumn(name: string): Promise<void> {
    const projectIdNum = parseId(this.projectId());
    const boardIdNum = parseId(this.boardId());
    if (projectIdNum === null || boardIdNum === null) {
      return;
    }
    const created = await this.safeColumnWrite(
      this.writeApi.createColumn(projectIdNum, boardIdNum, { name }),
    );
    if (created !== null) {
      this.store.applyColumnCreated(created);
      this.snackBar.open(`Added '${created.name}'`, 'Dismiss', { duration: 2000 });
    }
  }

  /**
   * Internal: PATCH a column with a new name, commit to the store,
   * and surface a snackbar.
   */
  private async renameColumn(column: KanbanColumn, name: string): Promise<void> {
    const projectIdNum = parseId(this.projectId());
    const boardIdNum = parseId(this.boardId());
    if (projectIdNum === null || boardIdNum === null) {
      return;
    }
    const updated = await this.safeColumnWrite(
      this.writeApi.updateColumn(projectIdNum, boardIdNum, column.id, { name }),
    );
    if (updated !== null) {
      this.store.applyColumnUpdated(updated);
      this.snackBar.open(`Renamed to '${updated.name}'`, 'Dismiss', { duration: 2000 });
    }
  }

  /**
   * Run a write against the columns endpoint. Returns the
   * server-returned resource on success, or `null` if the write failed
   * (with a snackbar fired). The caller branches on the result to
   * commit (success) or skip (failure).
   */
  private async safeColumnWrite(
    obs: ReturnType<KanbanWriteApi['createColumn']>,
  ): Promise<KanbanColumn | null> {
    try {
      return await firstValueFrom(obs);
    } catch (err) {
      const apiError = err as ApiError | unknown;
      this.snackBar.open(
        apiError && typeof apiError === 'object' && 'kind' in apiError
          ? ErrorNormalizer.toUserMessage(apiError as ApiError)
          : 'Could not save the column. Please try again.',
        'Dismiss',
        { duration: 4000 },
      );
      return null;
    }
  }

  protected cardsFor(columnId: number): readonly KanbanCard[] {
    // Reactive read: depends on the cardsByColumn signal so change detection
    // re-runs after a mutation. Calling the store's plain function would NOT
    // be reactive.
    return this.cardsByColumn()[String(columnId)] ?? [];
  }

  protected bodyPreview(body: string | null): string {
    return truncatePlainText(body, 200);
  }
}

function parseId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function truncatePlainText(body: string | null, maxChars: number): string {
  if (body === null || body === '') {
    return '';
  }
  const flattened = body.replace(/\s+/g, ' ').trim();
  if (flattened.length <= maxChars) {
    return flattened;
  }
  return flattened.slice(0, maxChars - 1).trimEnd() + '…';
}
