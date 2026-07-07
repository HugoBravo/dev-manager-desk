import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { catchError, of, tap } from 'rxjs';

import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import type { ApiError } from '../../../core/errors/api-error';
import { ProjectService } from '../../../core/projects/project.service';
import { KanbanApi } from '../api/kanban.api';
import type { Board } from '../models';
import { requireProjectId } from '../guards/project-required.guard';

/**
 * Read-only boards list. Renders one Material `mat-card` per board with an
 * "Open" button that navigates to the detail page. No create / edit / delete
 * UI in PR2.
 *
 * States (spec `kanban-read` F7 + scenario 5):
 * - **loading**: `mat-progress-spinner` + `role="status" aria-live="polite"`
 * - **empty**: centered "No boards yet" card (no create button in PR2)
 * - **error**: `role="alert"` + the normalizer's user message + Retry button
 *
 * The route guard runs before this page activates, so `currentId()` is
 * guaranteed to match `:projectId` by the time we render. If the guard is
 * ever bypassed (test scaffolding, future refactor), `requireProjectId()`
 * produces a typed `notFound` we surface via the error state.
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
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the route via `withComponentInputBinding()` */
  readonly projectId = input.required<string>();

  protected readonly boards = signal<readonly Board[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly reloadTrigger = signal(0);

  protected readonly isBusy = computed(
    () => this.loading() || this._reloadBusy(),
  );
  private readonly _reloadBusy = signal(false);

  protected readonly current = this.projectService.current;
  protected readonly statusMessage = computed(() => {
    if (this.loading()) {
      return 'Loading boards';
    }
    if (this.error()) {
      return ErrorNormalizer.toUserMessage(this.error()!);
    }
    return '';
  });

  constructor() {
    // Re-fetch when the route param changes (lazy `projectId` binding)
    // or when the user clicks Retry (`reloadTrigger`).
    effect(() => {
      const raw = this.projectId();
      const _reload = this.reloadTrigger(); // dependency tracking
      const projectId = readProjectId(raw);
      if (projectId === null) {
        this.error.set(
          ErrorNormalizer.fromSynthetic(
            'notFound',
            'No active project. Pick one from the toolbar.',
          ),
        );
        this.loading.set(false);
        return;
      }

      this.loading.set(true);
      this.error.set(null);
      this._reloadBusy.set(true);

      this.api
        .listBoards(projectId)
        .pipe(
          tap((page) => {
            this.boards.set(page.data);
            this._reloadBusy.set(false);
            this.loading.set(false);
          }),
          catchError((err: unknown) => {
            this._reloadBusy.set(false);
            this.loading.set(false);
            if (err && typeof err === 'object' && 'kind' in err) {
              this.error.set(err as ApiError);
            } else {
              this.error.set(
                ErrorNormalizer.fromSynthetic('notFound', 'Could not load boards.'),
              );
            }
            return of(null);
          }),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe();
    });
  }

  protected retry(): void {
    this.reloadTrigger.update((n) => n + 1);
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

  /**
   * Public for tests — exposes the `boards` signal so render tests can assert
   * the loaded list without touching the Angular TestBed render dance.
   */
  get _boards(): typeof this.boards {
    return this.boards;
  }
}

function readProjectId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
