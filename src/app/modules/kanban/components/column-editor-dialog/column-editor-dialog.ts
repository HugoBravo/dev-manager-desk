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
import {
  FormField,
  form,
  maxLength,
  required,
  submit,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Data passed to {@link ColumnEditorDialog}.
 *
 * Two modes:
 * - `create` — opens empty for a new column. `initialName` is ignored.
 * - `rename` — opens prefilled with the existing column name.
 *
 * `triggerElement` is the element that opened the dialog; focus is
 * returned to it on close (WCAG AA focus management), matching the
 * `LabelManagerDialog` pattern.
 */
export interface ColumnEditorDialogData {
  readonly mode: 'create' | 'rename';
  readonly initialName?: string;
  readonly triggerElement?: HTMLElement;
}

/**
 * Result returned by {@link ColumnEditorDialog}.
 *
 * `action` is `'saved'` or `'cancel'`. On `'saved'`, `name` carries
 * the trimmed user input (the caller POSTs/PATCHes with this exact
 * value).
 */
export interface ColumnEditorDialogResult {
  readonly action: 'saved' | 'cancel';
  readonly name?: string;
}

interface ColumnEditorModel {
  name: string;
}

const NAME_MAX = 100; // matches backend `min:1|max:100` rule.

/**
 * Material dialog used by `BoardDetailPage` to create or rename a
 * column. Uses **Signal Forms** with server-side constraints mirrored
 * client-side.
 *
 * On submit:
 * - Trims the name; rejects empty (after trim) — server would 422.
 * - Closes the dialog with `{ action: 'saved', name: trimmedName }`.
 *
 * On cancel / Escape: closes with `{ action: 'cancel' }`.
 *
 * Validation matches the backend (`min:1|max:100`). The wizard is
 * deliberately minimal — a single text field — because every column
 * shares the same input shape.
 */
@Component({
  selector: 'app-column-editor-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './column-editor-dialog.html',
  styleUrl: './column-editor-dialog.scss',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'column-editor-title'",
  },
})
export class ColumnEditorDialog implements OnInit {
  private readonly data = inject<ColumnEditorDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<ColumnEditorDialog, ColumnEditorDialogResult>>(MatDialogRef);

  protected readonly NAME_MAX = NAME_MAX;
  protected readonly title = computed(() =>
    this.data.mode === 'create' ? 'New column' : 'Rename column',
  );

  protected readonly columnForm = form(
    signal<ColumnEditorModel>({ name: this.data.initialName ?? '' }),
    (schemaPath) => {
      required(schemaPath.name, { message: 'Name is required.' });
      maxLength(schemaPath.name, NAME_MAX, {
        message: `Name must be ${NAME_MAX} characters or fewer.`,
      });
    },
  );

  private readonly titleRef = viewChild<ElementRef<HTMLElement>>('titleRef');
  private readonly nameInputRef = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    // Track the form's signal value so the OnPush change detection
    // re-runs when fields mutate (Signal Forms uses signals internally).
    // No-op body — the effect exists to declare the dependency.
    effect(() => {
      void this.columnForm().value();
    });
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
    const submitted = await submit(this.columnForm, async () => {
      const trimmed = this.columnForm().value().name.trim();
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
