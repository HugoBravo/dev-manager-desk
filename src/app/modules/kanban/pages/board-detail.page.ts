import {
  Component,
  DestroyRef,
  ElementRef,
  AfterViewInit,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { catchError, of, tap } from 'rxjs';

import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import type { ApiError } from '../../../core/errors/api-error';
import { ProjectService } from '../../../core/projects/project.service';
import { KanbanApi } from '../api/kanban.api';
import type { BoardDetail } from '../models';

/**
 * Read-only board detail (spec `kanban-read` F6 + scenarios 6/7/8).
 *
 * Renders columns as Material `mat-card` containers, cards as truncated
 * bodies (NO markdown rendering in PR2; that arrives with PR4). No drag-drop
 * (PR3). No card click handler (the dialog lands in PR3).
 *
 * A11y:
 * - The first column receives focus on initial render via the `h1` host.
 * - Each column is a `role="region"` labelled by its `h2` heading.
 * - Cards are keyboard reachable (`tabindex="0"`) but Enter is a no-op in
 *   PR2 (wired in PR3).
 */
@Component({
  selector: 'app-board-detail-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './board-detail.page.html',
  styleUrl: './board-detail.page.scss',
  host: {
    '[attr.aria-busy]': 'isBusy()',
  },
})
export class BoardDetailPage implements AfterViewInit {
  private readonly api = inject(KanbanApi);
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the route via `withComponentInputBinding()` */
  readonly projectId = input.required<string>();
  /** Bound from the route via `withComponentInputBinding()` */
  readonly boardId = input.required<string>();

  protected readonly detail = signal<BoardDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly reloadTrigger = signal(0);

  protected readonly isBusy = computed(() => this.loading());
  protected readonly current = this.projectService.current;
  protected readonly statusMessage = computed(() => {
    if (this.loading()) {
      return 'Loading board';
    }
    if (this.error()) {
      return ErrorNormalizer.toUserMessage(this.error()!);
    }
    return '';
  });

  protected readonly columnHeadingId = (columnId: number): string =>
    `board-column-${columnId}`;

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
        this.error.set(
          ErrorNormalizer.fromSynthetic(
            'notFound',
            'Board or project is missing or invalid.',
          ),
        );
        this.loading.set(false);
        return;
      }

      this.loading.set(true);
      this.error.set(null);

      this.api
        .getBoardDetail(projectId, boardId)
        .pipe(
          tap((d) => {
            this.detail.set(d);
            this.loading.set(false);
          }),
          catchError((err: unknown) => {
            this.loading.set(false);
            if (err && typeof err === 'object' && 'kind' in err) {
              this.error.set(err as ApiError);
            } else {
              this.error.set(
                ErrorNormalizer.fromSynthetic(
                  'notFound',
                  'Could not load board.',
                ),
              );
            }
            return of(null);
          }),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe();
    });
  }

  ngAfterViewInit(): void {
    // Focus management per spec F7: focus the board title (h1) on route
    // activation so screen-reader users land at the canonical landmark.
    queueMicrotask(() => {
      const ref = this.titleRef();
      ref?.nativeElement.focus();
    });
  }

  protected retry(): void {
    this.reloadTrigger.update((n) => n + 1);
  }

  /**
   * Returns the cards for a column. Stays as a method (not computed) so the
   * template doesn't need to import the signal shape.
   */
  protected cardsFor(columnId: number): readonly { readonly id: number; readonly title: string; readonly body: string | null }[] {
    const raw = this.detail()?.cardsByColumnId[String(columnId)] ?? [];
    // Truncate the body to a 200-char plain-text preview. Markdown rendering
    // is PR4 (`MarkdownPipe`). The PR2 contract: NO `<h2>`, no links — text only.
    return raw.map((card) => ({
      id: card.id,
      title: card.title,
      body: truncatePlainText(card.body, 200),
    }));
  }

  /** Truncated body as plain text — used by the template directly. */
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
  // Plain-text collapse. Strip control characters / newlines for the PR2
  // preview; the markdown version lives in `MarkdownPipe` (PR4).
  const flattened = body.replace(/\s+/g, ' ').trim();
  if (flattened.length <= maxChars) {
    return flattened;
  }
  return flattened.slice(0, maxChars - 1).trimEnd() + '…';
}
