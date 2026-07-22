import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import { ProjectService } from '../../../core/projects/project.service';
import type { ApiError } from '../../../core/errors/api-error';
import { KanbanApi } from '../api/kanban.api';
import { KanbanWriteApi } from '../api/kanban-write.api';
import {
  BoardEditorDialog,
  type BoardEditorDialogData,
  type BoardEditorDialogResult,
} from '../components/board-editor-dialog/board-editor-dialog';
import {
  BoardConflictDialog,
  type BoardConflictDialogData,
  type BoardConflictDialogResult,
} from '../components/board-conflict-dialog/board-conflict-dialog';
import { BulkActionsBar } from '../components/bulk-actions-bar/bulk-actions-bar';
import { requireProjectId } from '../guards/project-required.guard';
import type { Board, BulkOperationResult } from '../models';
import { BoardsStore } from '../stores/boards.store';
import { buildBoardRoute } from '../utils/build-board-route';

/**
 * Boards list. Reads the boards cache from {@link BoardsStore} (the single
 * source of truth shared with the detail page) for the boards array, but
 * issues its own HTTP call via {@link KanbanApi} so the loading/error
 * signals are local to the page (synchronous writes from the subscribe
 * callback). The store is updated on success for cross-page consistency.
 *
 * Why not `store.loadBoards()` directly? The store's async wrapper flips
 * the loading signal inside an `await`, so the template re-renders only on
 * the next microtask. In the Angular testbed the microtask doesn't always
 * trigger another change-detection pass before the test's assertions run.
 * Doing the HTTP subscribe here keeps the lifecycle deterministic.
 *
 * States (spec `kanban-read` F7 + scenario 5):
 * - **loading**: `mat-progress-spinner` + `role="status" aria-live="polite"`
 * - **empty**: centered "No boards yet" card + CTA to create the first board
 * - **error**: `role="alert"` + the normalizer's user message + Retry button
 *
 * Actions (Batch 6 — `boards-kanban-crud-full`):
 * - Create board via `BoardEditorDialog` (mode `create`)
 * - Per-card Rename via `BoardEditorDialog` (mode `rename`)
 * - Per-card Delete via `window.confirm` + `BoardConflictDialog` on 409
 * - Multi-select via per-card checkbox + `BulkActionsBarComponent` for bulk
 *   delete (single wire — bulk-rename UX deferred)
 */
@Component({
  selector: 'app-boards-list-page',
  imports: [
    BulkActionsBar,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './boards-list.page.html',
  styleUrl: './boards-list.page.scss',
  host: {
    '[attr.aria-busy]': 'isBusy()',
    '[attr.aria-live]': '"polite"',
  },
})
export class BoardsListPage {
  private readonly api = inject(KanbanApi);
  private readonly writeApi = inject(KanbanWriteApi);
  private readonly store = inject(BoardsStore);
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Bound from the route via `withComponentInputBinding()` */
  readonly projectId = input.required<string>();
  /**
   * S2: task id flows from the route (`/projects/:projectId/tasks/:taskId/boards`).
   * The page threads this value into every direct API call and keeps
   * {@link BoardsStore.setTaskId} in sync so the store's internal
   * `loadBoards` / `loadTrash` / `loadBoard` calls also carry the segment.
   */
  readonly taskId = input.required<string>();

  protected readonly boards = computed(() => this.store.boards());
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly isBusy = computed(() => this.loading());

  protected readonly current = this.projectService.current;
  protected readonly statusMessage = computed(() => {
    if (this.loading()) {
      return 'Loading boards';
    }
    const err = this.error();
    if (err) {
      return ErrorNormalizer.toUserMessage(err);
    }
    return '';
  });

  /**
   * Set of selected board ids. Owned by the page; the per-card checkbox
   * toggles entries, and `BulkActionsBarComponent` emits bulk actions that
   * read the current set. Cleared when `projectId` changes so navigating
   * between projects never leaks a stale selection.
   */
  protected readonly selection = signal<ReadonlySet<number>>(new Set());

  constructor() {
    effect(() => {
      const rawProject = this.projectId();
      const rawTask = this.taskId();
      const projectId = readProjectId(rawProject);
      const taskId = readTaskId(rawTask);
      // Reset selection on every project change so a stale id from
      // another project never ends up in a bulk request.
      this.selection.set(new Set());
      if (projectId === null || taskId === null) {
        this.loading.set(false);
        return;
      }
      // Keep the store's taskId slot bound so dialogs (which still
      // read store.taskId) and the store's internal loads carry the
      // segment. The page itself uses the parsed `taskId` value
      // directly so a stale store binding cannot leak across routes.
      this.store.setTaskId(taskId);
      this.fetch(projectId, taskId);
    });
  }

  protected retry(): void {
    const projectId = readProjectId(this.projectId());
    const taskId = readTaskId(this.taskId());
    if (projectId === null || taskId === null) {
      return;
    }
    this.fetch(projectId, taskId);
  }

  private fetch(projectId: number, taskId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .listBoards(projectId, taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (boards) => {
          this.store.boardsCache.set(boards);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          if (err && typeof err === 'object' && 'kind' in err) {
            this.error.set(err as ApiError);
          } else {
            this.error.set(null);
          }
        },
      });
  }

  protected openBoard(boardId: number): void {
    const projectId = readProjectId(this.projectId());
    const taskId = readTaskId(this.taskId());
    if (projectId === null || taskId === null) {
      return;
    }
    void this.router.navigate([
      '/modules/kanban/projects',
      projectId,
      'tasks',
      taskId,
      'boards',
      boardId,
    ]);
  }

  /**
   * Toggle a board's id in the selection set. Idempotent — clicking the
   * same checkbox twice returns to the empty set.
   */
  protected toggleSelection(boardId: number): void {
    this.selection.update((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) {
        next.delete(boardId);
      } else {
        next.add(boardId);
      }
      return next;
    });
  }

  /**
   * Open the board editor dialog in `create` mode. On submit, POSTs the
   * board, commits it to the store, and navigates to the new board's
   * detail page. On cancel / Escape, no-ops.
   */
  protected openCreateBoardDialog(triggerElement: HTMLElement): void {
    const projectIdNum = readProjectId(this.projectId());
    const taskIdNum = readTaskId(this.taskId());
    if (projectIdNum === null || taskIdNum === null) {
      return;
    }
    const data: BoardEditorDialogData = {
      mode: 'create',
      projectId: projectIdNum,
      taskId: taskIdNum,
      triggerElement,
    };
    const ref = this.dialog.open<BoardEditorDialog, BoardEditorDialogData, BoardEditorDialogResult>(
      BoardEditorDialog,
      { data },
    );
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result || result.action !== 'saved' || !result.name) {
        return;
      }
      void this.createBoard(projectIdNum, taskIdNum, result.name);
    });
  }

  /**
   * Open the board editor dialog in `rename` mode. On submit, PATCHes the
   * board, commits the updated resource to the store, and fires a
   * snackbar.
   */
  protected openRenameBoardDialog(board: Board, triggerElement: HTMLElement): void {
    const projectIdNum = readProjectId(this.projectId());
    const taskIdNum = readTaskId(this.taskId());
    if (projectIdNum === null || taskIdNum === null) {
      return;
    }
    const data: BoardEditorDialogData = {
      mode: 'rename',
      projectId: projectIdNum,
      taskId: taskIdNum,
      boardId: board.id,
      initialName: board.name,
      triggerElement,
    };
    const ref = this.dialog.open<BoardEditorDialog, BoardEditorDialogData, BoardEditorDialogResult>(
      BoardEditorDialog,
      { data },
    );
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result || result.action !== 'saved' || !result.name) {
        return;
      }
      if (result.name === board.name) {
        return;
      }
      void this.renameBoard(projectIdNum, taskIdNum, board, result.name);
    });
  }

  /**
   * Confirm then soft-delete a board. On 409 `board_has_contents`, open
   * {@link BoardConflictDialog} so the user can navigate to the board and
   * empty it first. Other errors fall through to a snackbar via
   * {@link ErrorNormalizer}.
   */
  protected openDeleteBoardConfirm(board: Board): void {
    const projectIdNum = readProjectId(this.projectId());
    const taskIdNum = readTaskId(this.taskId());
    if (projectIdNum === null || taskIdNum === null) {
      return;
    }
    const confirmed = window.confirm(`Delete board "${board.name}"? This moves it to the trash.`);
    if (!confirmed) {
      return;
    }
    this.deleteBoard(projectIdNum, taskIdNum, board);
  }

  private async createBoard(projectIdNum: number, taskIdNum: number, name: string): Promise<void> {
    try {
      const created = await firstValueFrom(
        this.writeApi.createBoard(projectIdNum, taskIdNum, { name }),
      );
      this.store.applyBoardCreated(created);
      this.snackBar.open(`Created board "${created.name}"`, 'Dismiss', {
        duration: 2500,
      });
      void this.router.navigate([
        '/modules/kanban/projects',
        projectIdNum,
        'tasks',
        taskIdNum,
        'boards',
        created.id,
      ]);
    } catch (err) {
      this.snackBar.open(toUserMessage(err, 'Could not create the board.'), 'Dismiss', {
        duration: 4000,
      });
    }
  }

  private async renameBoard(
    projectIdNum: number,
    taskIdNum: number,
    board: Board,
    name: string,
  ): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.writeApi.updateBoard(projectIdNum, taskIdNum, board.id, { name }),
      );
      this.store.applyBoardUpdated(updated);
      this.snackBar.open(`Renamed to "${updated.name}"`, 'Dismiss', {
        duration: 2500,
      });
    } catch (err) {
      const apiError = err as ApiError | unknown;
      if (
        apiError &&
        typeof apiError === 'object' &&
        'kind' in apiError &&
        (apiError as ApiError).kind === 'validation'
      ) {
        this.openConflictDialog(board, this.conflictMessage(apiError), taskIdNum);
        return;
      }
      this.snackBar.open(toUserMessage(err, 'Could not rename the board.'), 'Dismiss', {
        duration: 4000,
      });
    }
  }

  private async deleteBoard(
    projectIdNum: number,
    taskIdNum: number,
    board: Board,
  ): Promise<void> {
    try {
      await firstValueFrom(this.writeApi.deleteBoard(projectIdNum, taskIdNum, board.id));
      this.store.applyBoardRemoved(board.id);
      // Also drop the id from the selection so a stale entry can't end up
      // in a subsequent bulk request.
      this.selection.update((prev) => {
        if (!prev.has(board.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(board.id);
        return next;
      });
      this.snackBar.open(`Moved "${board.name}" to trash`, 'Dismiss', {
        duration: 2500,
      });
    } catch (err) {
      const apiError = err as ApiError | unknown;
      if (
        apiError &&
        typeof apiError === 'object' &&
        'kind' in apiError &&
        (apiError as ApiError).kind === 'conflict' &&
        (apiError as { code?: string }).code === 'board_has_contents'
      ) {
        this.openConflictDialog(board, this.conflictMessage(apiError), taskIdNum);
        return;
      }
      this.snackBar.open(toUserMessage(err, 'Could not delete the board.'), 'Dismiss', {
        duration: 4000,
      });
    }
  }

  /**
   * Open {@link BoardConflictDialog} with the typed 409 message. The
   * dialog exposes an "Open" action that lets the user navigate to the
   * board so they can empty it before retrying.
   *
   * S4: navigateTarget is built via {@link buildBoardRoute} so the URL
   * chain is always the canonical task-scoped shape — never the legacy
   * project-level `projects/{p}/boards/{b}` form.
   */
  private openConflictDialog(board: Board, message: string, taskIdNum: number): void {
    const projectIdNum = readProjectId(this.projectId());
    if (projectIdNum === null) {
      return;
    }
    const data: BoardConflictDialogData = {
      entityType: 'board',
      entityName: board.name,
      navigateTarget: buildBoardRoute(projectIdNum, taskIdNum, board.id),
      message,
    };
    const ref = this.dialog.open<
      BoardConflictDialog,
      BoardConflictDialogData,
      BoardConflictDialogResult
    >(BoardConflictDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result || result.action !== 'open') {
        return;
      }
      void this.router.navigate(result.navigateTo as unknown as string[]);
    });
  }

  /**
   * Run a bulk soft-delete against the current selection. Calls
   * `KanbanWriteApi.bulkDeleteBoards` with the current selection, then
   * applies the per-id store commit so the UI reflects the server's
   * state without a refetch of the full list. On partial failure, fires
   * a snackbar summarizing the failed count.
   */
  protected async runBulkDelete(): Promise<void> {
    const projectIdNum = readProjectId(this.projectId());
    const taskIdNum = readTaskId(this.taskId());
    if (projectIdNum === null || taskIdNum === null) {
      return;
    }
    const ids = [...this.selection()];
    if (ids.length === 0) {
      return;
    }
    try {
      const result: BulkOperationResult = await firstValueFrom(this.writeApi.bulkDeleteBoards(ids));
      for (const item of result.results) {
        if (item.status === 204) {
          this.store.applyBoardRemoved(item.id);
        }
      }
      // Refresh the list cache so the page reflects server state.
      this.fetch(projectIdNum, taskIdNum);
      this.selection.set(new Set());
      if (result.summary.failed > 0) {
        this.snackBar.open(
          `${result.summary.ok} deleted, ${result.summary.failed} failed (open trash to retry).`,
          'Dismiss',
          { duration: 4000 },
        );
        return;
      }
      this.snackBar.open(`${result.summary.ok} boards moved to trash`, 'Dismiss', {
        duration: 2500,
      });
    } catch (err) {
      this.snackBar.open(toUserMessage(err, 'Bulk delete failed. Please try again.'), 'Dismiss', {
        duration: 4000,
      });
    }
  }

  /**
   * Bulk rename hook — wired through {@link BulkActionsBarComponent} so
   * the prefix menu (Add prefix / Remove prefix) routes through here. The
   * actual prefix text is collected via `window.prompt` to avoid yet
   * another dialog; UX can iterate to a dedicated prefix dialog later.
   */
  protected runBulkRename(mode: 'add' | 'remove'): void {
    const projectIdNum = readProjectId(this.projectId());
    const taskIdNum = readTaskId(this.taskId());
    if (projectIdNum === null || taskIdNum === null) {
      return;
    }
    const ids = [...this.selection()];
    if (ids.length === 0) {
      return;
    }
    const promptText = mode === 'add' ? 'Prefix to add:' : 'Prefix to remove:';
    const prefix = window.prompt(promptText);
    if (prefix === null || prefix.trim() === '') {
      return;
    }
    void this.performBulkRename(projectIdNum, taskIdNum, ids, prefix.trim(), mode);
  }

  private async performBulkRename(
    projectIdNum: number,
    taskIdNum: number,
    ids: readonly number[],
    prefix: string,
    mode: 'add' | 'remove',
  ): Promise<void> {
    try {
      const result: BulkOperationResult = await firstValueFrom(
        this.writeApi.bulkRenameBoards(ids, prefix, mode),
      );
      for (const item of result.results) {
        if (item.status === 200) {
          // The server returns the new resource shape inside `error` only
          // on failure; on success it returns just `{ id, status }`. To
          // avoid an extra fetch we just refresh the list cache.
          void item;
        }
      }
      this.fetch(projectIdNum, taskIdNum);
      this.selection.set(new Set());
      this.snackBar.open(
        `${result.summary.ok} renamed, ${result.summary.failed} failed`,
        'Dismiss',
        { duration: 3000 },
      );
    } catch (err) {
      this.snackBar.open(toUserMessage(err, 'Bulk rename failed. Please try again.'), 'Dismiss', {
        duration: 4000,
      });
    }
  }

  /**
   * Extract the user-facing message from a typed `ApiError`. Falls back to
   * the supplied default if the error is not in `ApiError` shape.
   */
  private conflictMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message: unknown }).message;
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
    return 'This board has columns or cards. Empty it before deleting.';
  }

  /** Public for tests — exposes the boards computed so render tests can assert. */
  get _boards() {
    return this.boards;
  }

  /** Public for tests — exposes the selection signal. */
  get _selection() {
    return this.selection;
  }
}

function readProjectId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * S2: parse the `:taskId` route segment. Same shape as
 * {@link readProjectId} — kept as a named helper so the call sites
 * read as `taskId = readTaskId(this.taskId())` and an obvious null
 * check follows.
 */
function readTaskId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toUserMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'kind' in err) {
    return ErrorNormalizer.toUserMessage(err as ApiError);
  }
  return fallback;
}
