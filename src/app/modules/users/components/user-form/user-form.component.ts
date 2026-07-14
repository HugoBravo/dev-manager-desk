import { Component, computed, effect, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
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
 * Presentational Signal Form for the user-administration capability.
 * Owns its own draft state via signals; the page wires `errors()` and
 * acts on the `submitted` event.
 *
 * A11y: every `<input>`/`<mat-checkbox>` has an explicit `<label>`,
 * error messages are linked via `aria-describedby`, and the form has a
 * caption / heading hierarchy so screen readers announce context.
 */
@Component({
  selector: 'app-user-form',
  imports: [MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule],
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

  protected readonly _name = signal<string>('');
  protected readonly _email = signal<string>('');
  protected readonly _password = signal<string>('');
  protected readonly _isAdmin = signal<boolean>(false);

  readonly nameErrorId = computed(() => 'user-form-name-error');
  readonly emailErrorId = computed(() => 'user-form-email-error');
  readonly passwordErrorId = computed(() => 'user-form-password-error');
  readonly isAdminErrorId = computed(() => 'user-form-is-admin-error');
  readonly formErrorId = computed(() => 'user-form-form-error');

  readonly canEditEmail = computed(() => this.isAdmin());
  readonly canEditIsAdmin = computed(() => this.isAdmin());
  readonly requirePassword = computed(() => !this.isSelf());

  constructor() {
    // Reset the draft when the page swaps the initial value (load, route change).
    effect(() => {
      const initial = this.initialValue();
      this._name.set(initial.name);
      this._email.set(initial.email);
      this._password.set(initial.password);
      this._isAdmin.set(initial.is_admin);
    });
  }

  readonly nameId = 'user-form-name';
  readonly emailId = 'user-form-email';
  readonly passwordId = 'user-form-password';
  readonly isAdminId = 'user-form-is-admin';

  onNameInput(value: string): void {
    this._name.set(value);
  }

  onEmailInput(value: string): void {
    this._email.set(value);
  }

  onPasswordInput(value: string): void {
    this._password.set(value);
  }

  onIsAdminChange(change: MatCheckboxChange): void {
    this._isAdmin.set(change.checked);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.submitted.emit({
      name: this._name().trim(),
      email: this._email().trim(),
      password: this._password(),
      is_admin: this._isAdmin(),
    });
  }
}
