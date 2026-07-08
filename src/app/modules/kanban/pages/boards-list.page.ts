import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import { ProjectService } from '../../../core/projects/project.service';
import { KanbanApi } from '../api/kanban.api';
import { requireProjectId } from '../guards/project-required.guard';
import type { ApiError } from '../../../core/errors/api-error';
import { BoardsStore } from '../stores/boards.store';

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
 * - **empty**: centered "No boards yet" card
 * - **error**: `role="alert"` + the normalizer's user message + Retry button
 */
@Component({
  selector: 'app-boards-list-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
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
  private readonly store = inject(BoardsStore);
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the route via `withComponentInputBinding()` */
  readonly projectId = input.required<string>();

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

  constructor() {
    effect(() => {
      const raw = this.projectId();
      const projectId = readProjectId(raw);
      if (projectId === null) {
        this.loading.set(false);
        return;
      }
      this.fetch(projectId);
    });
  }

  protected retry(): void {
    const raw = readProjectId(this.projectId());
    if (raw === null) {
      return;
    }
    this.fetch(raw);
  }

  private fetch(projectId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .listBoards(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.store.boardsCache.set(page.data);
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
    const raw = readProjectId(this.projectId());
    const projectId = raw === null ? requireProjectId(raw) : raw;
    void this.router.navigate([
      '/modules/kanban/projects',
      projectId,
      'boards',
      boardId,
    ]);
  }

  /** Public for tests — exposes the boards computed so render tests can assert. */
  get _boards() {
    return this.boards;
  }
}

function readProjectId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}