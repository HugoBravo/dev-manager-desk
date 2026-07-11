import {
  Component,
  Injectable,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DATE_FORMATS,
  MAT_NATIVE_DATE_FORMATS,
  NativeDateAdapter,
} from '@angular/material/core';
import { DateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

/**
 * dd/MM/yyyy display format used by the picker UI. The picker's `parse`
 * direction reads ISO from the form model; the `display` direction renders
 * the user-visible text.
 */
const DD_MM_YYYY_INPUT = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;

/**
 * `MAT_DATE_FORMATS` that override only the user-visible `dateInput`. The
 * `parse.dateInput` is set to the same display object so the input mask
 * produces a value `parse()` can round-trip.
 */
const DD_MM_YYYY_DATE_FORMATS = {
  ...MAT_NATIVE_DATE_FORMATS,
  parse: {
    dateInput: DD_MM_YYYY_INPUT,
  },
  display: {
    ...MAT_NATIVE_DATE_FORMATS.display,
    dateInput: DD_MM_YYYY_INPUT,
  },
};

/**
 * `NativeDateAdapter` already handles ISO `YYYY-MM-DD` parsing internally
 * (the native `<input type="date">` mask produces it). But Angular Material
 * treats the form model as a `Date` object, so binding via `[formField]`
 * stores `Sat Jan 01 2026 ...` instead of `2026-01-01`. To keep the model
 * as the ISO string the backend expects, we register a `DateAdapter` whose
 * `getModel` / `setModel` (and the `format` direction that flows into the
 * form) round-trip through ISO `YYYY-MM-DD`.
 *
 * Note: `NativeDateAdapter` does not expose `getModel`/`setModel` in the
 * public API, but `format(date, DD_MM_YYYY_INPUT)` is called by the
 * `MatDatepickerInput` when writing into the bound value. By returning the
 * ISO string from `format()`, the value written to the form field IS the
 * ISO string the backend wants.
 */
@Injectable()
class IsoDateAdapter extends NativeDateAdapter {
  override format(date: Date, displayFormat: object): string {
    if (displayFormat === DD_MM_YYYY_INPUT) {
      return toIso(date);
    }
    return super.format(date, displayFormat);
  }
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

import { ErrorNormalizer } from '../../../../core/errors/error-normalizer';
import type { ApiError } from '../../../../core/errors/api-error';
import type { KanbanCard } from '../../models';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';
import { LabelsStore } from '../../stores/labels.store';
import { CardLabelsPicker } from '../card-labels-picker/card-labels-picker';

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
    CardLabelsPicker,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  providers: [
    { provide: DateAdapter, useClass: IsoDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: DD_MM_YYYY_DATE_FORMATS },
  ],
  templateUrl: './card-editor-dialog.html',
  styleUrl: './card-editor-dialog.scss',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'card-editor-title'",
  },
})
export class CardEditorDialog implements OnInit {
  // `protected` so the template can bind `data.card!` (the edit-mode inline
  // label picker needs the prefilled card). Other fields stay `private`.
  protected readonly data = inject<CardEditorDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<CardEditorDialog, CardEditorDialogResult>>(MatDialogRef);
  private readonly writeApi = inject(KanbanWriteApi);
  private readonly store = inject(BoardsStore);
  private readonly labelsStore = inject(LabelsStore);
  private readonly snackBar = inject(MatSnackBar);

  /**
   * Reference to the inline picker in edit mode. The picker needs the
   * full project/board/column chain to issue the labels-sync PUT, and
   * {@link CardLabelsPicker.setChain} is the documented hand-off for that
   * context. We call it once the view is ready; the picker is only
   * present when `data.mode === 'edit'` so the viewChild is undefined in
   * create mode and `setChain` is skipped.
   */
  private readonly pickerRef = viewChild<CardLabelsPicker>('labelsPicker');
  protected readonly userLabels = computed(() => this.labelsStore.labels());
  protected readonly isEdit = computed(() => this.data.mode === 'edit');

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
        return list && list.length > 0 ? { kind: 'server', message: list[0]! } : undefined;
      });
      validate(schemaPath.body, () => {
        const list = this.serverFieldErrors()?.['body'];
        return list && list.length > 0 ? { kind: 'server', message: list[0]! } : undefined;
      });
      validate(schemaPath.due_date, () => {
        const list = this.serverFieldErrors()?.['due_date'];
        return list && list.length > 0 ? { kind: 'server', message: list[0]! } : undefined;
      });
    },
  );

  /** Server field errors (422 from create / update). */
  protected readonly serverFieldErrors = signal<Readonly<Record<string, readonly string[]>> | null>(
    null,
  );

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

  ngOnInit(): void {
    // Ensure the user's label library is loaded so the picker chips render
    // immediately on edit-mode open. `ensureLoaded()` is idempotent — it
    // short-circuits if the cache was already populated. In create mode
    // the picker is hidden (see template), but the load is harmless and
    // keeps the data ready for the next dialog open.
    void this.labelsStore.ensureLoaded().then(() => {
      // Wire the picker's chain context AFTER labels are loaded so the
      // picker's first effect reads the right card. Mirrors the
      // `CardDetailDialog` pattern (no race between load and mount).
      // No-op in create mode (picker is hidden).
      if (this.data.mode !== 'edit') {
        return;
      }
      const picker = this.pickerRef();
      if (picker) {
        picker.setChain(this.data.projectId, this.data.boardId, this.data.columnId);
      }
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
      this.snackBar.open(ErrorNormalizer.toUserMessage(apiError), 'Dismiss', { duration: 5000 });
      return;
    }
    this.generalError.set('Could not save the card. Please try again.');
    this.snackBar.open(this.generalError()!, 'Dismiss', { duration: 5000 });
  }

  protected cancel(): void {
    this.ref.close({ action: 'cancel' });
  }

  /**
   * Commit the server-returned card to the store after a successful
   * labels sync. The picker emits the canonical card (with the synced
   * label set); `BoardsStore.applyCardMutation` handles the
   * cross-column detection (a sync never changes column, so this is
   * effectively a within-column update).
   *
   * Mirrors `CardDetailDialog.onLabelsChanged` — same hook, same
   * behavior. Without this binding the picker would silently succeed
   * but the board would never reflect the new labels.
   */
  protected onLabelsChanged(card: KanbanCard): void {
    this.store.applyCardMutation(card);
  }

  /**
   * The picker already surfaces a snackbar with the typed error; this
   * hook exists so the dialog can react to other side effects. It MUST
   * stay a no-op for the snackbar to avoid double-firing the user
   * message.
   */
  protected onLabelsSyncError(_err: ApiError): void {
    // Intentionally empty — the picker already opened the snackbar.
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
