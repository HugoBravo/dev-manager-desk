import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import type { ApiError } from '../../../core/errors/api-error';
import { ProjectService } from '../../../core/projects/project.service';
import type { Board } from '../models';
import { KanbanWriteApi } from '../api/kanban-write.api';
import { BoardsStore } from '../stores/boards.store';

/**
 * Boards trash page (api-doc §16 trash). Lists soft-deleted boards for
 * a project, newest-deleted first, with a per-row **Restore** action
 * that POSTs `/boards/{id}/restore` and updates both the trash signal
 * and the active boards signal so a redirect back to the list view
 * shows the restored board in the right position.
 *
 * Pure presentation over {@link BoardsStore}: the page reads
 * `store.trash()` for the rendered list and `store.trashLoading()` for
 * the skeleton; mutations route through {@link KanbanWriteApi} and
 * commit through the store's `apply*` helpers. The trash signal and
 * the active boards signal are two independent stores (D7) — never
 * mix them in a single filter.
 *
 * States (consistent with `BoardsListPage`):
 * - **loading**: spinner + polite aria-live
 * - **empty**: centered "Trash is empty" hint
 * - **error**: alert + Retry
 */
@Component({
  selector: 'app-board-trash-page',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './board-trash.page.html',
  styleUrl: './board-trash.page.scss',
  host: {
    '[attr.aria-busy]': 'isBusy()',
    '[attr.aria-live]': '"polite"',
  },
})
export class BoardTrashPage {
  private readonly writeApi = inject(KanbanWriteApi);
  private readonly store = inject(BoardsStore);
  private readonly projectService = inject(ProjectService);
  private readonly snackBar = inject(MatSnackBar);

  /** Bound from the route via `withComponentInputBinding()` */
  readonly projectId = input.required<string>();

  protected readonly trash = computed(() => this.store.trash());
  protected readonly loading = computed(() => this.store.trashLoading());
  protected readonly error = computed(() => this.store.error());
  protected readonly isBusy = computed(() => this.loading());
  protected readonly current = this.projectService.current;
  protected readonly statusMessage = computed(() => {
    if (this.loading()) {
      return 'Loading trash';
    }
    const err = this.error();
    if (err) {
      return ErrorNormalizer.toUserMessage(err);
    }
    return '';
  });
  /** Page-local guard so the per-row restore handler can ignore in-flight clicks. */
  private readonly restoringIds = signal<ReadonlySet<number>>(new Set());

  protected readonly isRestoring = (boardId: number): boolean => this.restoringIds().has(boardId);

  /** Trigger a retry of the trash fetch after an error / empty load. */
  protected readonly reloadTrigger = signal(0);

  constructor() {
    effect(() => {
      const raw = this.projectId();
      const projectId = parseId(raw);
      // depend on reloadTrigger so Retry re-runs the load
      this.reloadTrigger();
      if (projectId === null) {
        return;
      }
      void this.store.loadTrash(projectId);
    });
  }

  protected retry(): void {
    this.reloadTrigger.update((n) => n + 1);
  }

  /**
   * Restore a single trashed board. POSTs `/boards/{id}/restore`,
   * commits the server-returned resource to the active boards cache
   * via {@link BoardsStore.applyBoardRestored}, removes it from the
   * local `trash` view, and fires a snackbar. Concurrent clicks on
   * the same row are guarded via the page-local `restoringIds` set.
   */
  protected async restoreBoard(board: Board, triggerElement: HTMLElement): Promise<void> {
    const projectId = parseId(this.projectId());
    if (projectId === null) {
      return;
    }
    if (this.restoringIds().has(board.id)) {
      return;
    }
    this.markRestoring(board.id, true);
    try {
      const restored = await firstValueFrom(this.writeApi.restoreBoard(projectId, this.store.taskId, board.id));
      this.store.applyBoardRestored(restored);
      // Drop the row from the trash view. The store's trash signal
      // is the source of truth for the rendered list — removing it
      // here keeps the page synchronous with the active boards
      // signal so a navigation back to BoardsListPage shows the
      // restored board.
      this.removeFromTrashView(board.id);
      this.snackBar.open(`Restored "${restored.name}"`, 'Dismiss', { duration: 2000 });
      triggerElement.focus();
    } catch (err) {
      const apiError = (
        err && typeof err === 'object' && 'kind' in err ? err : null
      ) as ApiError | null;
      this.snackBar.open(
        apiError ? ErrorNormalizer.toUserMessage(apiError) : 'Could not restore the board.',
        'Dismiss',
        { duration: 4000 },
      );
    } finally {
      this.markRestoring(board.id, false);
    }
  }

  /**
   * Internal — project the trash signal to a new value with the
   * given id removed. Delegates to {@link BoardsStore.applyTrashBoardRemoved}
   * so the store remains the single source of truth for the trash
   * cache.
   */
  private removeFromTrashView(boardId: number): void {
    this.store.applyTrashBoardRemoved(boardId);
  }

  private markRestoring(boardId: number, busy: boolean): void {
    const next = new Set(this.restoringIds());
    if (busy) {
      next.add(boardId);
    } else {
      next.delete(boardId);
    }
    this.restoringIds.set(next);
  }
}

function parseId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
