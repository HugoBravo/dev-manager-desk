import {
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import type { ValidationError } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Data passed to {@link BoardEditorDialog}.
 *
 * Two modes:
 * - `create` — opens empty for a new board. `initialName` is ignored and
 *   `projectId` + `taskId` are required (the caller POSTs to the
 *   task-scoped kanban collection).
 * - `rename` — opens prefilled with the existing board name. `boardId`
 *   carries the target id and `projectId` + `taskId` scope the PATCH
 *   endpoint.
 *
 * S4: `taskId` is REQUIRED on the wire shape so the editor stays
 * self-contained when the dialog is opened from a page that doesn't
 * bind `BoardsStore.taskId` (e.g. a "promote task" flow from the tasks
 * module). The owning page forwards the same value it threads into the
 * URL chain.
 *
 * `triggerElement` is the element that opened the dialog; focus is
 * restored to it on close (WCAG AA focus management). The dialog does
 * the restoration itself via `MatDialogRef.beforeClosed()` so every
 * caller (whether they remember to await `afterClosed()` or not)
 * gets the focus return for free.
 */
export interface BoardEditorDialogData {
  readonly mode: 'create' | 'rename';
  readonly projectId?: number;
  readonly taskId: number;
  readonly boardId?: number;
  readonly initialName?: string;
  readonly triggerElement?: HTMLElement;
}

/**
 * Result returned by {@link BoardEditorDialog}.
 *
 * `action` is `'saved'` or `'cancel'`. On `'saved'`, `name` carries
 * the trimmed user input (the caller POSTs/PATCHes with this exact
 * value).
 */
export interface BoardEditorDialogResult {
  readonly action: 'saved' | 'cancel';
  readonly name?: string;
}

interface BoardEditorModel {
  name: string;
}

const NAME_MAX = 100; // matches backend `min:1|max:100` rule.

/**
 * Custom error kind for whitespace-only input. `required` accepts
 * non-empty strings even when they consist solely of spaces, so the
 * dialog adds an explicit check to keep the form invalid until the
 * user types real content (matching the server's `min:1` after trim).
 */
interface WhitespaceOnlyError extends ValidationError.WithoutFieldTree {
  readonly kind: 'whitespaceOnly';
  readonly message: string;
}

/**
 * Material dialog used by `BoardsListPage` (create) and `BoardDetailPage`
 * (rename) to create or rename a board. Uses **Signal Forms** with
 * server-side constraints mirrored client-side.
 *
 * On submit:
 * - Trims the name; rejects empty (after trim) — server would 422.
 * - Closes the dialog with `{ action: 'saved', name: trimmedName }`.
 *
 * On cancel / Escape: closes with `{ action: 'cancel' }`.
 *
 * On close (every close path — submit, cancel, Escape, backdrop click),
 * the dialog restores focus to the `triggerElement` from its data
 * payload via {@link MatDialogRef.beforeClosed} so the page that opened
 * it does not need to wire an `afterClosed()` focus hook of its own.
 */
@Component({
  selector: 'app-board-editor-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './board-editor-dialog.html',
  styleUrl: './board-editor-dialog.scss',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'board-editor-title'",
  },
})
export class BoardEditorDialog implements OnInit {
  private readonly data = inject<BoardEditorDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<BoardEditorDialog, BoardEditorDialogResult>>(MatDialogRef);

  protected readonly NAME_MAX = NAME_MAX;
  protected readonly title = computed(() =>
    this.data.mode === 'create' ? 'New board' : 'Rename board',
  );

  protected readonly boardForm = form(
    signal<BoardEditorModel>({ name: this.data.initialName ?? '' }),
    (schemaPath) => {
      required(schemaPath.name, { message: 'Name is required.' });
      maxLength(schemaPath.name, NAME_MAX, {
        message: `Name must be ${NAME_MAX} characters or fewer.`,
      });
      validate(schemaPath.name, (ctx) => {
        // `value` is typed as `unknown` from the validator signature;
        // narrow to string before calling `.trim()` / `.length`.
        const value = ctx.value();
        if (typeof value === 'string' && value.trim().length === 0 && value.length > 0) {
          return {
            kind: 'whitespaceOnly',
            message: 'Name cannot be only whitespace.',
          } satisfies WhitespaceOnlyError;
        }
        return null;
      });
    },
  );

  private readonly titleRef = viewChild<ElementRef<HTMLElement>>('titleRef');
  private readonly nameInputRef = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly triggerElement = this.data.triggerElement;

  constructor() {
    // Track the form's signal value so the OnPush change detection
    // re-runs when fields mutate (Signal Forms uses signals internally).
    // No-op body — the effect exists to declare the dependency.
    effect(() => {
      void this.boardForm().value();
    });

    // WCAG AA focus return: when the dialog is closed (every close
    // path — submit, cancel, Escape, backdrop click), restore focus
    // to the element that opened it. We subscribe to `afterClosed` so
    // the focus call runs after Angular has fully torn down the dialog
    // (which puts `body` back as the active element). Doing it inside
    // the dialog guarantees focus return even when the caller forgets
    // to wire its own `afterClosed()` hook.
    if (this.triggerElement) {
      this.ref.afterClosed().subscribe(() => {
        this.triggerElement?.focus();
      });
    }
  }

  ngOnInit(): void {
    // Focus management: move focus to the h2 first (Material default
    // focus trap is on the dialog container), then to the input on the
    // next microtask so the browser's focus ring renders correctly.
    queueMicrotask(() => {
      this.titleRef()?.nativeElement.focus();
      queueMicrotask(() => {
        this.nameInputRef()?.nativeElement.focus();
      });
    });
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const submitted = await submit(this.boardForm, async () => {
      const trimmed = this.boardForm().value().name.trim();
      if (!trimmed) {
        // Local guard: empty after trim fails the `required` check
        // anyway, but submitting stays a no-op so the dialog doesn't
        // close with an invalid payload.
        return;
      }
      this.ref.close({ action: 'saved', name: trimmed });
      // `submit` expects an async action; close() above throws a dialog
      // sentinel and the function never reaches the return below in
      // practice. The return satisfies the signature.
      return;
    });
    void submitted;
  }

  protected cancel(): void {
    this.ref.close({ action: 'cancel' });
  }
}
