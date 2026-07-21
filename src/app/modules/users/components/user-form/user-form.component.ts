import { AbstractControl } from '@angular/forms';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface UserFormValue {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly is_admin: boolean;
}

export interface UserFormErrors {
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
  readonly is_admin?: string;
  readonly _form?: string;
}

/**
 * Reactive user-administration form. Built on `ReactiveFormsModule`
 * (never `FormsModule`) so Material's `<mat-error>` and
 * `ErrorStateMatcher` behave as the framework expects.
 *
 * Validation flow:
 * - Client validators (`required` / `email` / `minLength(8)`) run on every
 *   change but visibility is gated by Material's default matcher:
 *   `!!(control.invalid && (control.dirty || control.touched || form.submitted))`.
 *   That's what produces the "show on blur" UX — no custom matcher needed.
 * - Server errors from the `errors()` input (driven by the parent page
 *   after a 4xx) are rendered through a parallel `@else if` branch and
 *   are NOT merged into the FormControl's `errors` object — otherwise the
 *   next validator pass would clobber them.
 *
 * A11y: every control has an explicit `<label>`; `aria-invalid` and
 * `aria-describedby` are bound from the same predicate the `<mat-error>`
 * uses, so screen readers and Material stay in sync.
 */
@Component({
  selector: 'app-user-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.scss',
})
export class UserFormComponent {
  readonly initialValue = input<UserFormValue>({
    name: '',
    email: '',
    password: '',
    is_admin: false,
  });

  readonly errors = input<UserFormErrors>({});
  readonly isAdmin = input<boolean>(false);
  readonly isSelf = input<boolean>(false);
  readonly submitting = input<boolean>(false);

  readonly submitted = output<UserFormValue>();

  private readonly fb = inject(NonNullableFormBuilder);

  readonly formGroup = this.fb.group({
    name: this.fb.control('', [Validators.required]),
    email: this.fb.control('', [Validators.email]),
    password: this.fb.control(''),
    is_admin: this.fb.control(false),
  });

  readonly nameId = 'user-form-name';
  readonly emailId = 'user-form-email';
  readonly passwordId = 'user-form-password';
  readonly isAdminId = 'user-form-is-admin';
  readonly nameErrorId = 'user-form-name-error';
  readonly emailErrorId = 'user-form-email-error';
  readonly passwordErrorId = 'user-form-password-error';
  readonly isAdminErrorId = 'user-form-is-admin-error';
  readonly formErrorId = 'user-form-form-error';

  readonly canEditEmail = computed(() => this.isAdmin());
  readonly canEditIsAdmin = computed(() => this.isAdmin());
  readonly requirePassword = computed(() => !this.isSelf());

  constructor() {
    // Validator set depends on context: admins can edit email + must set a
    // strong password; self-edits leave email alone and make password optional.
    effect(() => {
      if (this.isAdmin()) {
        this.formGroup.controls.email.setValidators([
          Validators.required,
          Validators.email,
        ]);
      } else {
        this.formGroup.controls.email.clearValidators();
      }
      this.formGroup.controls.email.updateValueAndValidity({ emitEvent: false });

      if (this.isSelf()) {
        this.formGroup.controls.password.setValidators([Validators.minLength(8)]);
      } else {
        this.formGroup.controls.password.setValidators([
          Validators.required,
          Validators.minLength(8),
        ]);
      }
      this.formGroup.controls.password.updateValueAndValidity({ emitEvent: false });
    });

    // Reset the draft whenever the parent swaps the initial value
    // (load, route change, or a successful update).
    effect(() => {
      const initial = this.initialValue();
      this.formGroup.reset({
        name: initial.name,
        email: initial.email,
        password: '',
        is_admin: initial.is_admin,
      });
    });
  }

  /**
   * Matchers that flip the form field into error state. Two triggers:
   * 1. Client-validator failure once the field is dirty/touched (the
   *    baseline UX that produces "show on blur").
   * 2. A server-side error on the matching key — because a 4xx means we
   *    already attempted submit and the user should see the feedback
   *    even if they never touched the field.
   */
  protected readonly _nameErrorMatcher: ErrorStateMatcher = {
    isErrorState: () =>
      hasError(this.formGroup.controls.name) || !!this.errors().name,
  };
  protected readonly _emailErrorMatcher: ErrorStateMatcher = {
    isErrorState: () =>
      hasError(this.formGroup.controls.email) || !!this.errors().email,
  };
  protected readonly _passwordErrorMatcher: ErrorStateMatcher = {
    isErrorState: () =>
      hasError(this.formGroup.controls.password) || !!this.errors().password,
  };

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.formGroup.invalid) {
      this.formGroup.markAllAsTouched();
      return;
    }
    const raw = this.formGroup.getRawValue();
    this.submitted.emit({
      name: raw.name.trim(),
      email: raw.email.trim(),
      password: raw.password,
      is_admin: raw.is_admin,
    });
  }
}

/**
 * Baseline "should this field be in error state right now?" predicate.
 * Mirrors Material's default matcher (invalid AND dirty/touched) so we
 * can extend it with server-error triggers in one place.
 */
function hasError(control: AbstractControl): boolean {
  return !!(control.invalid && (control.touched || control.dirty));
}