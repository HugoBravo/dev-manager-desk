import { Component, ElementRef, OnInit, computed, inject, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ErrorNormalizer } from '../../../../core/errors/error-normalizer';
import type { ApiError } from '../../../../core/errors/api-error';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';
import type { KanbanCard } from '../../models';
import {
  BoardConflictDialog,
  type BoardConflictDialogData,
  type BoardConflictDialogResult,
} from '../board-conflict-dialog/board-conflict-dialog';
import {
  CardEditorDialog,
  type CardEditorDialogData,
  type CardEditorDialogResult,
} from '../card-editor-dialog/card-editor-dialog';

/**
 * Data passed to {@link CardDetailDialog}.
 *
 * The dialog is a Material `mat-dialog` (locked decision — spec `kanban-write`
 * F6). It hosts the card preview, action toolbar (edit / archive / restore /
 * delete), and (in PR4) the comment thread + attachment list.
 *
 * `triggerElement` is the element that opened the dialog — the dialog returns
 * focus to it on close (WCAG AA focus management).
 */
export interface CardDetailDialogData {
  readonly card: KanbanCard;
  readonly projectId: number;
  readonly boardId: number;
  readonly columnId: number;
  readonly triggerElement?: HTMLElement;
}

/**
 * Result returned by {@link CardDetailDialog}. `action` is what the user did
 * (or `'closed'` if the dialog was dismissed without taking an action).
 */
export interface CardDetailDialogResult {
  readonly action:
    | 'closed'
    | 'edited'
    | 'archived'
    | 'restored'
    | 'deleted';
  readonly card?: KanbanCard;
}

/**
 * Material dialog showing a card preview + action toolbar.
 *
 * Behavior:
 * - **Edit**: opens {@link CardEditorDialog} in edit mode. On save, refreshes
 *   the local card and signals the new resource.
 * - **Archive / Restore**: calls the write API, updates the store.
 * - **Delete**: calls the write API. On 409 (`column_has_contents` if the
 *   API ever starts enforcing it on cards), opens
 *   {@link BoardConflictDialog}. On 204, signals deletion and closes.
 *
 * A11y:
 * - Focus moves to the `h2` title on open.
 * - Material default focus trap.
 * - Returns focus to the trigger element on close.
 */
@Component({
  selector: 'app-card-detail-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2
      #titleRef
      mat-dialog-title
      id="card-detail-title"
      tabindex="-1"
    >
      {{ card().title }}
      @if (card().archived_at) {
        <span class="archived-chip">(archived)</span>
      }
    </h2>
    <mat-dialog-content [attr.aria-describedby]="'card-detail-body'">
      <p id="card-detail-body" class="card-body">{{ bodyText() }}</p>
      @if (card().due_date) {
        <p class="card-due">Due: {{ card().due_date }}</p>
      }
      <p class="placeholder">
        <em>Comments and attachments are coming in PR4.</em>
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button
        mat-button
        type="button"
        (click)="edit()"
        aria-label="Edit card"
      >
        <mat-icon aria-hidden="true">edit</mat-icon>
        Edit
      </button>
      @if (card().archived_at) {
        <button
          mat-button
          type="button"
          (click)="restore()"
          aria-label="Restore card"
        >
          <mat-icon aria-hidden="true">unarchive</mat-icon>
          Restore
        </button>
      } @else {
        <button
          mat-button
          type="button"
          (click)="archive()"
          aria-label="Archive card"
        >
          <mat-icon aria-hidden="true">archive</mat-icon>
          Archive
        </button>
      }
      <button
        mat-button
        color="warn"
        type="button"
        (click)="delete()"
        aria-label="Delete card"
      >
        <mat-icon aria-hidden="true">delete</mat-icon>
        Delete
      </button>
    </mat-dialog-actions>
  `,
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'card-detail-title'",
  },
})
export class CardDetailDialog implements OnInit {
  private readonly data = inject<CardDetailDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<CardDetailDialog, CardDetailDialogResult>>(MatDialogRef);
  private readonly writeApi = inject(KanbanWriteApi);
  private readonly store = inject(BoardsStore);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  private readonly titleRef =
    viewChild<ElementRef<HTMLElement>>('titleRef');

  /**
   * Local copy of the card; mutated on edit/archive/restore. The store
   * updates happen in parallel so other pages see the new resource.
   */
  protected readonly card = computed(() => this.store.currentBoard()
    ? findCardInBoard(this.store.currentBoard()!, this.data.card.id) ?? this.data.card
    : this.data.card);
  protected readonly bodyText = computed(() => this.card().body ?? '(no body)');

  ngOnInit(): void {
    // Focus the title on open — Material's default focus trap is on the
    // dialog container, so we explicitly move focus to the canonical
    // landmark (the h2) so screen-reader users land at the start of the
    // content.
    queueMicrotask(() => {
      this.titleRef()?.nativeElement.focus();
    });
    // Ensure the store knows about the card even if it wasn't loaded
    // before. Idempotent.
    this.store.applyCardMutation(this.data.card);
  }

  protected async edit(): Promise<void> {
    const ref = this.dialog.open<
      CardEditorDialog,
      CardEditorDialogData,
      CardEditorDialogResult
    >(CardEditorDialog, {
      data: {
        mode: 'edit',
        projectId: this.data.projectId,
        boardId: this.data.boardId,
        columnId: this.data.columnId,
        card: this.card(),
      },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (result?.action === 'saved' && result.card) {
      this.ref.close({ action: 'edited', card: result.card });
      return;
    }
  }

  protected async archive(): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.writeApi.archiveCard(
          this.data.projectId,
          this.data.boardId,
          this.data.columnId,
          this.data.card.id,
        ),
      );
      this.store.applyCardMutation(updated);
      this.ref.close({ action: 'archived', card: updated });
    } catch (err) {
      this.surfaceError(err);
    }
  }

  protected async restore(): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.writeApi.restoreCard(
          this.data.projectId,
          this.data.boardId,
          this.data.columnId,
          this.data.card.id,
        ),
      );
      this.store.applyCardMutation(updated);
      this.ref.close({ action: 'restored', card: updated });
    } catch (err) {
      this.surfaceError(err);
    }
  }

  protected async delete(): Promise<void> {
    try {
      await firstValueFrom(
        this.writeApi.deleteCard(
          this.data.projectId,
          this.data.boardId,
          this.data.columnId,
          this.data.card.id,
        ),
      );
      this.store.applyCardRemoved(this.data.card.id);
      this.ref.close({ action: 'deleted' });
    } catch (err) {
      const apiError = err as ApiError | unknown;
      if (apiError && typeof apiError === 'object' && 'kind' in apiError) {
        const typed = apiError as ApiError;
        if (typed.kind === 'conflict') {
          this.openConflictDialog(typed);
          return;
        }
      }
      this.surfaceError(err);
    }
  }

  /**
   * Open the conflict dialog when the server returns a typed 409. Card
   * delete never returns `column_has_contents` per api-doc §10.3 (only
   * board / column delete can), but we keep the hook wired for forward-
   * compat — if the API contract ever changes, the dialog handles it.
   */
  private openConflictDialog(error: ApiError): void {
    const conflictData: BoardConflictDialogData = {
      entityType: 'column',
      entityName: `column ${this.data.columnId}`,
      navigateTarget: [
        '/modules/kanban/projects',
        String(this.data.projectId),
        'boards',
        String(this.data.boardId),
      ],
      message:
        error.kind === 'conflict' && error.code === 'column_has_contents'
          ? 'This column still has cards. Move or delete them first.'
          : error.kind === 'conflict' && error.code === 'board_has_contents'
            ? 'This board still has columns. Move or delete them first.'
            : 'This action conflicts with the current state.',
    };
    const ref = this.dialog.open<
      BoardConflictDialog,
      BoardConflictDialogData,
      BoardConflictDialogResult
    >(BoardConflictDialog, { data: conflictData });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (result?.action === 'open') {
        void this.router.navigate([...result.navigateTo]);
      }
    });
  }

  private surfaceError(err: unknown): void {
    const message =
      err && typeof err === 'object' && 'kind' in err
        ? ErrorNormalizer.toUserMessage(err as ApiError)
        : 'Could not perform the action. Please try again.';
    this.snackBar.open(message, 'Dismiss', { duration: 5000 });
  }
}

function findCardInBoard(
  detail: { cardsByColumnId: Readonly<Record<string, readonly KanbanCard[]>> },
  cardId: number,
): KanbanCard | null {
  for (const cards of Object.values(detail.cardsByColumnId)) {
    const found = cards.find((c) => c.id === cardId);
    if (found) {
      return found;
    }
  }
  return null;
}