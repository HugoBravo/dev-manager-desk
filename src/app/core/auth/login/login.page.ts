import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormField,
  form,
  required,
  email,
  minLength,
  submit,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth.service';

interface LoginModel {
  email: string;
  password: string;
}

@Component({
  selector: 'app-login-page',
  imports: [
    FormField,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.page.html',
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 24px;
        box-sizing: border-box;
      }

      .login-shell {
        display: flex;
        width: 100%;
        max-width: 420px;
      }

      .login-card {
        width: 100%;
      }

      .login-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-top: 16px;
      }

      .login-error {
        margin: 0;
        color: var(--mat-sys-error);
        font: var(--mat-sys-body-medium);
      }

      .login-submit {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .login-submit mat-spinner {
        display: inline-block;
      }

      .login-hint {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
        text-align: center;
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loginModel = signal<LoginModel>({
    email: '',
    password: '',
  });

  /**
   * Server-side field errors. The validator closures below read this signal
   * so re-running validation picks up the latest server message. Cleared at
   * the start of each submit attempt.
   */
  private readonly serverFieldErrors = signal<
    Readonly<Record<string, readonly string[]>> | null
  >(null);

  protected readonly loginForm = form(this.loginModel, (schemaPath) => {
    required(schemaPath.email, { message: 'El email es obligatorio.' });
    email(schemaPath.email, { message: 'Introduce un email valido.' });
    validate(schemaPath.email, () => {
      const list = this.serverFieldErrors()?.['email'];
      return list && list.length > 0
        ? { kind: 'server', message: list[0]! }
        : undefined;
    });

    minLength(schemaPath.password, 6, {
      message: 'La contrasena debe tener al menos 6 caracteres.',
    });
    validate(schemaPath.password, () => {
      const list = this.serverFieldErrors()?.['password'];
      return list && list.length > 0
        ? { kind: 'server', message: list[0]! }
        : undefined;
    });
  });

  protected readonly errorMessage = signal<string | null>(null);

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.errorMessage.set(null);
    this.serverFieldErrors.set(null);

    const returnUrl =
      this.route.snapshot.queryParamMap.get('returnUrl') ?? '/modules';

    const submitted = await submit(this.loginForm, async () => {
      const credentials = this.loginForm().value();
      const result = await firstValueFrom(this.auth.login(credentials));

      if (!result.ok) {
        this.errorMessage.set(result.error);
        if (result.fieldErrors) {
          this.serverFieldErrors.set(result.fieldErrors);
          // Force a re-validation pass so the field-level errors render.
          this.loginForm.email().markAsDirty();
          this.loginForm.password().markAsDirty();
        }
        return undefined;
      }

      await this.router.navigateByUrl(returnUrl);
      return undefined;
    });

    if (!submitted) {
      this.focusFirstInvalid();
    }
  }

  protected focusFirstInvalid(): void {
    const emailField = this.loginForm.email();
    const passwordField = this.loginForm.password();
    if (emailField.invalid()) {
      emailField.focusBoundControl();
      return;
    }
    if (passwordField.invalid()) {
      passwordField.focusBoundControl();
    }
  }
}