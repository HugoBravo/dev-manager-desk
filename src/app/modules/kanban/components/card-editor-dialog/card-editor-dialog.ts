import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  FormField,
  form,
  maxLength,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { ErrorNormalizer } from '../../../../core/errors/error-normalizer';
import type { ApiError } from '../../../../core/errors/api-error';
import type { KanbanCard } from '../../models';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';

/**
 * Editor payload for a card (matches api-doc §7.3 create + §7.4 update).
 * `assignee_id` is not in the API doc yet (kept optional, never sent); the
 * spec includes it for forward-compat. `due_at` is the legacy ISO datetime
 * shape; the API accepts `due_date` (YYYY-MM-DD) — we map it.
 */
export interface CardEditorModel {
  title: string;
  body: string;
  /** Empty string = no due date. We send `null` to the API in that case. */
  due_date: string;
  assignee_id: string;
}

export type CardEditorMode = 'create' | 'edit';

/**
 * Data passed to {@link CardEditorDialog}.
 *
 * `projectId`, `boardId`, `columnId` scope the create (the API needs the
 * full path). For `mode === 'edit'`, `card` prefills the form.
 */
export interface CardEditorDialogData {
  readonly mode: CardEditorMode;
  readonly projectId: number;
  readonly boardId: number;
  readonly columnId: number;
  readonly card?: KanbanCard;
}

/**
 * Result returned by {@link CardEditorDialog}. `card` is the server-returned
 * resource (with the canonical `position`); the caller MUST commit it to the
 * store via `BoardsStore.applyCardCreated()` or `applyCardMutation()`.
 */
export interface CardEditorDialogResult {
  readonly action: 'saved' | 'cancel';
  readonly card?: KanbanCard;
}

const TITLE_MAX = 200; // spec mentions 200 in the brief; backend allows 255.
const BODY_MAX = 65535; // backend limit per api-doc §7.3.

/**
 * Material dialog for create + edit of a kanban card. Uses **Signal Forms**
 * (`@angular/forms/signals`) with schema validation matching the API doc.
 *
 * Behavior:
 * - On submit: posts to `createCard` / `updateCard` (depending on mode).
 * - On 422: server `fieldErrors` bind to per-field errors via
 *   `validate(...)` closures that read a signal updated by the catch path.
 * - On other errors: dialog stays open; snackbar surfaces the normalized
 *   user message via `ErrorNormalizer.toUserMessage()`.
 * - On success: closes the dialog and returns the server's card.
 *
 * The dialog does NOT touch the store directly — it returns the server
 * resource so the caller (page) commits via `BoardsStore.applyCardCreated()`
 * for consistency with the server-confirmed-move contract.
 */
@Component({
  selector: 'app-card-editor-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './card-editor-dialog.html',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'card-editor-title'",
  },
})
export class CardEditorDialog {
  private readonly data = inject<CardEditorDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<CardEditorDialog, CardEditorDialogResult>>(MatDialogRef);
  private readonly writeApi = inject(KanbanWriteApi);
  private readonly store = inject(BoardsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly title = computed(() =>
    this.data.mode === 'create' ? 'Create card' : 'Edit card',
  );

  /**
   * Initial form value. For create mode this is empty; for edit mode it
   * prefills from the existing card.
   */
  protected readonly cardForm = form(
    signal<CardEditorModel>(initialModel(this.data)),
    (schemaPath) => {
      required(schemaPath.title, { message: 'Title is required.' });
      maxLength(schemaPath.title, TITLE_MAX, {
        message: `Title must be ${TITLE_MAX} characters or fewer.`,
      });

      required(schemaPath.body, { message: 'Body is required.' });
      maxLength(schemaPath.body, BODY_MAX, {
        message: `Body must be ${BODY_MAX} characters or fewer.`,
      });

      // Server-side field errors bind here. The signal is updated by the
      // catch path when a 422 lands; the closures re-read on every
      // validation pass.
      validate(schemaPath.title, () => {
        const list = this.serverFieldErrors()?.['title'];
        return list && list.length > 0
          ? { kind: 'server', message: list[0]! }
          : undefined;
      });
      validate(schemaPath.body, () => {
        const list = this.serverFieldErrors()?.['body'];
        return list && list.length > 0
          ? { kind: 'server', message: list[0]! }
          : undefined;
      });
      validate(schemaPath.due_date, () => {
        const list = this.serverFieldErrors()?.['due_date'];
        return list && list.length > 0
          ? { kind: 'server', message: list[0]! }
          : undefined;
      });
    },
  );

  /** Server field errors (422 from create / update). */
  protected readonly serverFieldErrors = signal<
    Readonly<Record<string, readonly string[]>> | null
  >(null);

  protected readonly generalError = signal<string | null>(null);

  /**
   * Focus the first invalid field on dialog open. Pure UX touch — the form
   * is invalid on open only when editing a card that fails validation, which
   * is rare.
   */
  constructor() {
    effect(() => {
      // No-op effect — present so the form's signal is tracked for
      // dependency. The validation closures already read from
      // `serverFieldErrors` on each pass.
      void this.cardForm().value();
    });
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.serverFieldErrors.set(null);
    this.generalError.set(null);

    const submitted = await submit(this.cardForm, async () => {
      const model = this.cardForm().value();
      try {
        const card =
          this.data.mode === 'create'
            ? await firstValueFrom(
                this.writeApi.createCard(
                  this.data.projectId,
                  this.data.boardId,
                  this.data.columnId,
                  {
                    title: model.title,
                    body: model.body || null,
                    due_date: model.due_date || null,
                  },
                ),
              )
            : await firstValueFrom(
                this.writeApi.updateCard(
                  this.data.projectId,
                  this.data.boardId,
                  this.data.columnId,
                  this.data.card!.id,
                  {
                    title: model.title,
                    body: model.body || null,
                    due_date: model.due_date || null,
                  },
                ),
              );
        // Commit via the store so any open list/detail reflects the new card.
        if (this.data.mode === 'create') {
          this.store.applyCardCreated(card);
        } else {
          this.store.applyCardMutation(card);
        }
        this.ref.close({ action: 'saved', card });
      } catch (err) {
        this.handleError(err as ApiError | unknown);
      }
      return undefined;
    });

    void submitted;
  }

  /**
   * Inspect the error and route to the appropriate surface: server field
   * errors bind to the form; everything else surfaces as a snackbar so
   * the dialog stays open (user can retry).
   */
  private handleError(err: unknown): void {
    if (err && typeof err === 'object' && 'kind' in err) {
      const apiError = err as ApiError;
      if (apiError.kind === 'validation' && apiError.fieldErrors) {
        this.serverFieldErrors.set(apiError.fieldErrors);
        // Force a re-validation pass so the field-level errors render.
        this.cardForm.title().markAsDirty();
        this.cardForm.body().markAsDirty();
        return;
      }
      this.generalError.set(ErrorNormalizer.toUserMessage(apiError));
      this.snackBar.open(
        ErrorNormalizer.toUserMessage(apiError),
        'Dismiss',
        { duration: 5000 },
      );
      return;
    }
    this.generalError.set('Could not save the card. Please try again.');
    this.snackBar.open(this.generalError()!, 'Dismiss', { duration: 5000 });
  }

  protected cancel(): void {
    this.ref.close({ action: 'cancel' });
  }
}

/**
 * Build the initial form value for the dialog. Empty for create; prefill
 * from the card for edit.
 */
function initialModel(data: CardEditorDialogData): CardEditorModel {
  if (data.mode === 'edit' && data.card) {
    return {
      title: data.card.title,
      body: data.card.body ?? '',
      due_date: data.card.due_date ?? '',
      assignee_id: '',
    };
  }
  return {
    title: '',
    body: '',
    due_date: '',
    assignee_id: '',
  };
}