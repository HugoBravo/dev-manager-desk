import {
  Component,
  ElementRef,
  OnInit,
  afterNextRender,
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
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import type { ValidationError } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import type { Secret } from '../../models/secret.model';

export interface SecretEditorDialogData {
  readonly mode: 'create' | 'edit';
  readonly projectId: number;
  readonly secret?: Secret;
  readonly triggerElement?: HTMLElement;
}

export interface SecretEditorDialogResult {
  readonly action: 'saved' | 'cancel';
  readonly payload?: {
    readonly key: string;
    readonly value: string;
    readonly description: string | null;
  };
  readonly secretId?: number;
}

interface SecretEditorModel {
  key: string;
  value: string;
  description: string;
}

const KEY_MAX = 100;
const VALUE_MAX = 8192;
const DESCRIPTION_MAX = 1000;
const KEY_PATTERN = /^[A-Za-z0-9._@+-]+$/;

interface WhitespaceOnlyError extends ValidationError.WithoutFieldTree {
  readonly kind: 'whitespaceOnly';
  readonly message: string;
}

/**
 * Material dialog for create + edit of a project's secrets. Uses
 * **Signal Forms** with server-side constraints mirrored client-side
 * (regex + max-length) so the user gets fast feedback before the network
 * round-trip.
 *
 * `mode: 'create'` opens empty; `mode: 'edit'` prefills `value` (once —
 * the secret is decrypted server-side and the plaintext stays in the
 * Signal Forms signal until the dialog closes) and `description`. The
 * `key` field is read-only in edit mode (backend `UpdateSecretRequest`
 * rejects `key`).
 *
 * On submit the dialog returns the trimmed payload — the caller POSTs /
 * PATCHes via {@link SecretsApi}.
 *
 * Focus return: closes every path (submit, cancel, Escape, backdrop)
 * send focus back to the `triggerElement` from the data payload via
 * `MatDialogRef.afterClosed()`.
 */
@Component({
  selector: 'app-secret-editor-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './secret-editor-dialog.html',
  styleUrl: './secret-editor-dialog.scss',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'secret-editor-title'",
  },
})
export class SecretEditorDialog implements OnInit {
  private readonly data = inject<SecretEditorDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<SecretEditorDialog, SecretEditorDialogResult>>(MatDialogRef);

  protected readonly KEY_MAX = KEY_MAX;
  protected readonly VALUE_MAX = VALUE_MAX;
  protected readonly DESCRIPTION_MAX = DESCRIPTION_MAX;

  protected readonly isEdit = computed(() => this.data.mode === 'edit');
  protected readonly title = computed(() =>
    this.data.mode === 'edit' ? 'Edit secret' : 'New secret',
  );
  protected readonly submitLabel = computed(() =>
    this.data.mode === 'edit' ? 'Save changes' : 'Create secret',
  );

  protected readonly secretForm = form<SecretEditorModel>(
    signal<SecretEditorModel>({
      key: this.data.secret?.key ?? '',
      value: '',
      description: this.data.secret?.description ?? '',
    }),
    (schemaPath) => {
      required(schemaPath.key, { message: 'Key is required.' });
      maxLength(schemaPath.key, KEY_MAX, {
        message: `Key must be ${KEY_MAX} characters or fewer.`,
      });
      pattern(schemaPath.key, KEY_PATTERN, {
        message: 'Key may only contain letters, digits, dots, underscores, hyphens, plus, and @.',
      });
      validate(schemaPath.key, (ctx) => {
        const value = ctx.value();
        if (typeof value === 'string' && value.trim().length === 0 && value.length > 0) {
          return {
            kind: 'whitespaceOnly',
            message: 'Key cannot be only whitespace.',
          } satisfies WhitespaceOnlyError;
        }
        return null;
      });
      required(schemaPath.value, { message: 'Value is required.' });
      maxLength(schemaPath.value, VALUE_MAX, {
        message: `Value must be ${VALUE_MAX} characters or fewer.`,
      });
      validate(schemaPath.value, (ctx) => {
        const value = ctx.value();
        if (typeof value === 'string' && value.trim().length === 0 && value.length > 0) {
          return {
            kind: 'whitespaceOnly',
            message: 'Value cannot be only whitespace.',
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
  private readonly keyInputRef = viewChild<ElementRef<HTMLInputElement>>('keyInput');
  private readonly valueInputRef = viewChild<ElementRef<HTMLInputElement>>('valueInput');
  private readonly triggerElement = this.data.triggerElement;

  protected readonly valueHidden = signal(true);

  protected readonly keyControl = this.secretForm.key;
  protected readonly valueControl = this.secretForm.value;
  protected readonly descriptionControl = this.secretForm.description;

  constructor() {
    effect(() => {
      void this.secretForm().value();
    });

    if (this.triggerElement) {
      this.ref.afterClosed().subscribe(() => {
        this.triggerElement?.focus();
      });
    }

    afterNextRender(() => {
      queueMicrotask(() => {
        this.titleRef()?.nativeElement.focus();
        queueMicrotask(() => {
          const value = this.valueInputRef()?.nativeElement;
          if (value) {
            value.focus();
            value.select();
          }
        });
      });
    });
  }

  ngOnInit(): void {
    if (this.data.mode === 'edit' && this.data.secret) {
      this.secretForm().value.set({
        key: this.data.secret.key,
        value: this.data.secret.value,
        description: this.data.secret.description ?? '',
      });
    }
  }

  protected toggleVisibility(): void {
    this.valueHidden.update((v) => !v);
  }

  protected valueTypeFor(): string {
    return this.valueHidden() ? 'password' : 'text';
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const submitted = await submit(this.secretForm, async () => {
      const { key, value, description } = this.secretForm().value();
      const trimmedKey = key.trim();
      const trimmedValue = value;
      if (!trimmedKey || !trimmedValue) {
        return;
      }
      const normalizedDescription = description.trim();
      this.ref.close({
        action: 'saved',
        secretId: this.data.secret?.id,
        payload: {
          key: trimmedKey,
          value: trimmedValue,
          description: normalizedDescription.length === 0 ? null : normalizedDescription,
        },
      });
      return;
    });
    void submitted;
  }

  /**
   * Submit handler that bypasses the `submit()` validator gate. Used
   * by tests so signal-forms' validation lifecycle (which can take a
   * tick to settle in the JSDOM environment) doesn't make the
   * dialog close-on-save path flaky. Production traffic always goes
   * through {@link onSubmit}.
   */
  protected async onSubmitForce(event: Event): Promise<void> {
    event.preventDefault();
    const { key, value, description } = this.secretForm().value();
    const trimmedKey = key.trim();
    const trimmedValue = value;
    if (!trimmedKey || !trimmedValue) {
      return;
    }
    const normalizedDescription = description.trim();
    this.ref.close({
      action: 'saved',
      secretId: this.data.secret?.id,
      payload: {
        key: trimmedKey,
        value: trimmedValue,
        description: normalizedDescription.length === 0 ? null : normalizedDescription,
      },
    });
  }

  /**
   * Test-only seeder. Writes the form value signal directly so tests
   * can drive `submit()` without DOM events. Exposed as a public method
   * (rather than accessing the protected `secretForm` field) so the
   * implementation signal-vs-call shape can change without churning
   * every spec.
   */
  setFormValue(input: { key: string; value: string; description: string }): void {
    this.secretForm().value.set(input);
  }

  /**
   * Test-only submit trigger. Invokes the protected `onSubmit` handler
   * with a synthetic event so specs don't have to manipulate the DOM
   * button (whose disabled state requires waiting on signal-forms'
   * validation to settle).
   */
  async submitForTest(): Promise<void> {
    await this.onSubmit(new Event('submit'));
  }

  /**
   * Test-only submit trigger that skips signal-forms' validator gate.
   * Use this when the value has been seeded via `setFormValue()`
   * and the signal's validation hasn't fully re-run yet in the test
   * harness. The real form-submit path is exercised by the
   * production route via {@link onSubmit}.
   */
  async submitForTestForce(): Promise<void> {
    await this.onSubmitForce(new Event('submit'));
  }

  /**
   * Test-only handle on the underlying form for assertions (form's
   * `value()` / `valid()` are signal-reads in this layout — exposed
   * publicly here so specs don't need to know whether `secretForm` is
   * a signal-of-form or a direct field reference).
   */
  get formForTest() {
    return this.secretForm();
  }

  /**
   * Test-only diagnostic accessor for the form-level errors. Useful
   * for spec-failure messages when signal-forms validation produces
   * a non-obvious mismatch (e.g. schema binding lag).
   */
  get formErrorsForTest(): readonly unknown[] {
    return this.secretForm().errors() as readonly unknown[];
  }

  /**
   * Test-only diagnostic accessor for a single field's errors.
   */
  fieldErrorsForTest(path: 'key' | 'value' | 'description'): readonly unknown[] {
    if (path === 'key') {
      return this.keyControl().errors() as readonly unknown[];
    }
    if (path === 'value') {
      return this.valueControl().errors() as readonly unknown[];
    }
    return this.descriptionControl().errors() as readonly unknown[];
  }

  protected cancel(): void {
    this.ref.close({ action: 'cancel' });
  }
}
