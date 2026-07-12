import {
  Component,
  ElementRef,
  OnInit,
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
 * Data passed to {@link ProjectEditorDialog}.
 *
 * `mode` is currently fixed at `'create'` for this change — the dialog
 * carries only the create-mode contract. Future work can extend the
 * union (e.g. `'rename'`) without breaking the call site because
 * `ProjectEditorDialogData` is a typed argument to `dialog.open()`.
 *
 * `triggerElement` is the element that opened the dialog; focus is
 * restored to it on close (WCAG AA focus management). The dialog does
 * the restoration itself via `MatDialogRef.afterClosed()` so the
 * caller (ProjectsPage) does not need to wire its own focus hook.
 */
export interface ProjectEditorDialogData {
  readonly mode: 'create';
  readonly triggerElement?: HTMLElement;
}

/**
 * Result returned by {@link ProjectEditorDialog}.
 *
 * `action` is `'saved'` or `'cancel'`. On `'saved'`, `project` carries
 * the trimmed user input — caller POSTs to `/v1/projects` with this
 * exact payload (description is already normalized to `null` when
 * empty after trim).
 */
export interface ProjectEditorDialogResult {
  readonly action: 'saved' | 'cancel';
  readonly project?: { readonly name: string; readonly description: string | null };
}

interface ProjectEditorModel {
  name: string;
  description: string;
}

const NAME_MAX = 100; // matches backend `min:1|max:100` rule.
const DESCRIPTION_MAX = 255; // matches backend `nullable|string|max:255` rule.

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
 * Material dialog used by `ProjectsPage` to create a new project. Uses
 * **Signal Forms** with server-side constraints mirrored client-side.
 *
 * On submit:
 * - Trims name + description; rejects empty (after trim) — server
 *   would 422.
 * - Normalizes an empty (after trim) description to `null` (matches
 *   backend `nullable|string`).
 * - Closes the dialog with `{ action: 'saved', project: { name, description } }`.
 *
 * On cancel / Escape: closes with `{ action: 'cancel' }`.
 *
 * On close (every close path — submit, cancel, Escape, backdrop click),
 * the dialog restores focus to the `triggerElement` from its data
 * payload via {@link MatDialogRef.afterClosed} so the page that opened
 * it does not need to wire an `afterClosed()` focus hook of its own.
 */
@Component({
  selector: 'app-project-editor-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './project-editor-dialog.html',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'project-editor-title'",
  },
})
export class ProjectEditorDialog implements OnInit {
  private readonly data = inject<ProjectEditorDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<ProjectEditorDialog, ProjectEditorDialogResult>>(MatDialogRef);

  protected readonly NAME_MAX = NAME_MAX;
  protected readonly DESCRIPTION_MAX = DESCRIPTION_MAX;
  protected readonly title = 'New project';

  protected readonly projectForm = form(
    signal<ProjectEditorModel>({ name: '', description: '' }),
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
      maxLength(schemaPath.description, DESCRIPTION_MAX, {
        message: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
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
      void this.projectForm().value();
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
    const submitted = await submit(this.projectForm, async () => {
      const { name, description } = this.projectForm().value();
      const trimmedName = name.trim();
      const trimmedDescription = description.trim();
      if (!trimmedName) {
        // Local guard: empty after trim fails the `required` check
        // anyway, but submitting stays a no-op so the dialog doesn't
        // close with an invalid payload.
        return;
      }
      const normalizedDescription = trimmedDescription.length === 0 ? null : trimmedDescription;
      this.ref.close({
        action: 'saved',
        project: { name: trimmedName, description: normalizedDescription },
      });
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