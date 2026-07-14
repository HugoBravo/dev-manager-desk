import { Component, ElementRef, afterNextRender, computed, inject, viewChild } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import type { ValidationError } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { signal } from '@angular/core';

export interface SecretDeleteDialogData {
  readonly secretKey: string;
  readonly triggerElement?: HTMLElement;
}

export interface SecretDeleteDialogResult {
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
 * Destructive confirm dialog for secret deletion. The user must type the
 * secret's key EXACTLY (case-sensitive, trimmed equality) before the
 * Delete button enables. Same UX as the project delete confirmation,
 * scoped to a single secret.
 *
 * A11y: focus jumps to the destructive button (archive pattern from
 * `ConfirmDialog`) once Material finishes the open animation so keyboard
 * users land on the right control.
 */
@Component({
  selector: 'app-secret-delete-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './secret-delete-dialog.html',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
  },
})
export class SecretDeleteDialog {
  protected readonly data = inject<SecretDeleteDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<SecretDeleteDialog, SecretDeleteDialogResult>>(MatDialogRef);

  protected readonly cancelButtonRef = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  protected readonly confirmButtonRef = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  protected readonly confirmationInputRef =
    viewChild<ElementRef<HTMLInputElement>>('confirmationInput');

  protected readonly expectedKey = computed(() => this.data.secretKey);

  protected readonly confirmLabel = 'Delete secret';

  protected readonly confirmForm = form<ConfirmFormModel>(
    signal<ConfirmFormModel>({ confirmation: '' }),
    (schemaPath) => {
      required(schemaPath.confirmation, {
        message: 'Type the secret key to confirm.',
      });
      validate(schemaPath.confirmation, (ctx) => {
        const value = ctx.value();
        if (typeof value !== 'string') {
          return null;
        }
        const expected = this.expectedKey();
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

  protected readonly canConfirm = computed(() => this.confirmForm().valid());

  constructor() {
    afterNextRender(() => {
      queueMicrotask(() => {
        const target =
          this.confirmationInputRef()?.nativeElement ?? this.confirmButtonRef()?.nativeElement;
        if (target && document.contains(target)) {
          target.focus();
        }
      });
    });
  }

  protected async onConfirm(event: Event): Promise<void> {
    event.preventDefault();
    const submitted = await submit(this.confirmForm, async () => {
      this.ref.close({ confirmed: true });
      return;
    });
    void submitted;
  }

  protected cancel(): void {
    this.ref.close({ confirmed: false });
  }
}
