import {
  Component,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import type { ValidationError } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/**
 * Payload accepted by {@link ConfirmDialog}.
 *
 * `mode: 'archive'` — single-step confirm, no extra input.
 * `mode: 'delete'` — destructive confirm requiring the user to type the
 *   exact `projectName` before the destructive button enables.
 */
export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  readonly mode: 'archive' | 'delete';
  /** Overrides the default destructive action label for archive confirmations. */
  readonly confirmLabel?: string;
  /**
   * Required for `mode: 'delete'`; ignored in `mode: 'archive'`. The
   * user must type this string EXACTLY (trimmed equality) to enable the
   * destructive button.
   */
  readonly projectName?: string;
}

/**
 * Result returned by {@link ConfirmDialog}.
 *
 * `confirmed: true` — the user clicked the destructive action.
 * `confirmed: false` — the user cancelled via button, Escape, or backdrop.
 */
export interface ConfirmDialogResult {
  readonly confirmed: boolean;
}

interface ConfirmFormModel {
  confirmation: string;
}

interface MustMatchError extends ValidationError.WithoutFieldTree {
  readonly kind: 'mustMatch';
  readonly message: string;
}

/**
 * Generic destructive confirm dialog used by the projects page for both
 * archive and delete. The delete variant requires the user to type the
 * project name before the destructive button is enabled — this is the
 * "type-the-name" gate from REQ-4.
 *
 * Returns `{ confirmed: boolean }`. Cancel / Escape / backdrop close
 * with `confirmed: false`.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './confirm-dialog.html',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
  },
})
export class ConfirmDialog implements OnInit {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<ConfirmDialog, ConfirmDialogResult>>(MatDialogRef);

  protected readonly cancelButtonRef = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  protected readonly confirmButtonRef = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  protected readonly confirmationInputRef = viewChild<ElementRef<HTMLInputElement>>('confirmationInput');

  protected readonly requiresTypeTheName = computed(() => this.data.mode === 'delete');

  protected readonly expectedName = computed(() => this.data.projectName ?? '');

  protected readonly confirmLabel = computed(
    () =>
      this.data.confirmLabel ??
      (this.data.mode === 'delete' ? 'Delete project' : 'Archive project'),
  );

  protected readonly confirmForm = form<ConfirmFormModel>(
    signal<ConfirmFormModel>({ confirmation: '' }),
    (schemaPath) => {
      required(schemaPath.confirmation, {
        message: 'Type the project name to confirm.',
      });
      validate(schemaPath.confirmation, (ctx) => {
        const value = ctx.value();
        if (typeof value !== 'string') {
          return null;
        }
        const expected = this.expectedName();
        if (value !== expected) {
          return {
            kind: 'mustMatch',
            message: `Type "${expected}" exactly to confirm.`,
          } satisfies MustMatchError;
        }
        return null;
      });
    },
  );

  protected readonly canConfirm = computed(() => {
    if (this.requiresTypeTheName()) {
      return this.confirmForm().valid();
    }
    return true;
  });

  constructor() {
    // `afterNextRender` runs only in the browser; we use it to focus the
    // right control after Material finishes its dialog open animation.
    afterNextRender(() => {
      // Prefer focusing the confirmation input in delete mode so the user
      // can immediately type the name. Otherwise jump to the destructive
      // button (archive mode) — pressing Enter on it confirms. Guard
      // against teardown race in tests where the fixture is destroyed
      // before the microtask fires.
      queueMicrotask(() => {
        const target = this.requiresTypeTheName()
          ? this.confirmationInputRef()?.nativeElement
          : this.confirmButtonRef()?.nativeElement;
        if (target && document.contains(target)) {
          target.focus();
        }
      });
    });
  }

  ngOnInit(): void {
    // No-op; rendered defaults come from the form signal and dialog data.
    // Kept as a hook for future setup work.
  }

  protected async onConfirm(event: Event): Promise<void> {
    event.preventDefault();
    if (this.requiresTypeTheName()) {
      const submitted = await submit(this.confirmForm, async () => {
        this.ref.close({ confirmed: true });
        return;
      });
      void submitted;
      return;
    }
    this.ref.close({ confirmed: true });
  }

  protected cancel(): void {
    this.ref.close({ confirmed: false });
  }
}
