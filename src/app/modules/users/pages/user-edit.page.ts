import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import { AuthService } from '../../../core/auth/auth.service';

import { UsersApi, UsersHttpError } from '../api/users.api';
import {
  UserFormComponent,
  type UserFormErrors,
  type UserFormValue,
} from '../components/user-form/user-form.component';
import type { CreateUserPayload, UpdateUserPayload, User } from '../models/user.model';
import { UsersStore } from '../stores/users.store';

/**
 * User edit page. Handles both create (when `:id === 'new'`) and update.
 * The form fields are conditional on the user's role vs target:
 * - Admins editing anyone see all fields.
 * - Non-admins editing SELF see only `name` + `password`.
 *
 * Defence in depth: the server rejects forbidden fields with 422 — the
 * page either sends the body the API accepts (admin) or omits them
 * (self). The form component itself enforces the same UI rule.
 */
@Component({
  selector: 'app-user-edit-page',
  imports: [MatButtonModule, MatCardModule, MatProgressSpinnerModule, UserFormComponent],
  templateUrl: './user-edit.page.html',
  styleUrl: './user-edit.page.scss',
  host: {
    '[attr.aria-busy]': 'isBusy()',
  },
})
export class UserEditPage {
  private readonly usersApi = inject(UsersApi);
  private readonly usersStore = inject(UsersStore);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  private readonly _userId = signal<number | 'new' | null>(null);
  private readonly _user = signal<User | null>(null);
  private readonly _errors = signal<UserFormErrors>({});
  private readonly _loading = signal(false);
  private readonly _submitting = signal(false);
  private readonly _loadError = signal<string | null>(null);

  protected readonly userId = computed(() => this._userId());
  protected readonly user = computed(() => this._user());
  protected readonly errors = computed(() => this._errors());
  protected readonly loading = computed(() => this._loading());
  protected readonly loadError = computed(() => this._loadError());
  protected readonly submitting = computed(() => this._submitting());
  protected readonly isBusy = computed(() => this.loading() || this.submitting());

  private readonly currentUser = computed(() => this.auth.user());
  protected readonly isAdmin = computed(() => this.currentUser()?.is_admin === true);
  protected readonly isSelf = computed(() => {
    const me = this.currentUser();
    const target = this._user();
    if (me === null || target === null) {
      return false;
    }
    return String(me.id) === String(target.id);
  });

  protected readonly isNew = computed(() => this._userId() === 'new');

  protected readonly initialValue = computed<UserFormValue>(() => {
    const target = this._user();
    return {
      name: target?.name ?? '',
      email: target?.email ?? '',
      password: '',
      is_admin: target?.is_admin ?? false,
    };
  });

  protected readonly titleId = 'user-edit-title';

  constructor() {
    effect(() => {
      const idParam = this.route.snapshot.paramMap.get('id');
      if (idParam === null) {
        void this.router.navigate(['/modules/users']);
        return;
      }
      if (idParam === 'new') {
        if (!this.isAdmin()) {
          void this.router.navigate(['/modules/kanban']);
          return;
        }
        this._userId.set('new');
        this._user.set(null);
        return;
      }
      const parsed = Number(idParam);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        this._loadError.set('Invalid user id.');
        return;
      }
      this._userId.set(parsed);
      void this.load(parsed);
    });
  }

  private async load(id: number): Promise<void> {
    this._loading.set(true);
    this._loadError.set(null);
    try {
      const user = await this.usersApi.get(id);
      this._user.set(user);
    } catch (err) {
      if (err instanceof UsersHttpError && err.apiError.kind === 'forbidden') {
        void this.router.navigate(['/modules/kanban']);
        return;
      }
      this._loadError.set(toApiErrorMessage(err));
    } finally {
      this._loading.set(false);
    }
  }

  protected async onSubmit(value: UserFormValue): Promise<void> {
    this._submitting.set(true);
    this._errors.set({});
    const id = this._userId();
    try {
      if (id === 'new') {
        const payload: CreateUserPayload = {
          name: value.name,
          email: value.email,
          password: value.password,
          is_admin: value.is_admin,
        };
        const created = await this.usersStore.create(payload);
        if (created === null) {
          this._errors.set(readFieldErrors(this.usersStore.error()));
          return;
        }
        this.snackBar.open(`Created user ${created.email}`, 'Dismiss', { duration: 3000 });
        void this.router.navigate(['/modules/users', String(created.id)]);
        return;
      }
      if (id === null) {
        this._errors.set({ _form: 'Missing target user id.' });
        return;
      }
      const payload: UpdateUserPayload = this.buildUpdatePayload(value);
      const targetId: number = id;
      const updated = await this.usersStore.update(targetId, payload);
      if (updated === null) {
        this._errors.set(readFieldErrors(this.usersStore.error()));
        return;
      }
      this._user.set(updated);
      this.snackBar.open('Saved', 'Dismiss', { duration: 2000 });
    } finally {
      this._submitting.set(false);
    }
  }

  private buildUpdatePayload(value: UserFormValue): UpdateUserPayload {
    if (this.isAdmin() && !this.isSelf) {
      return {
        name: value.name,
        email: value.email,
        is_admin: value.is_admin,
        ...(value.password !== '' ? { password: value.password } : {}),
      };
    }
    return {
      name: value.name,
      ...(value.password !== '' ? { password: value.password } : {}),
    };
  }

  /** Used by the template's "Cancel" link to navigate back to the list. */
  protected onCancel(): void {
    void this.router.navigate(['/modules/users']);
  }
}

function readFieldErrors(apiError: unknown): UserFormErrors {
  if (
    apiError &&
    typeof apiError === 'object' &&
    'fieldErrors' in apiError &&
    apiError.fieldErrors &&
    typeof apiError.fieldErrors === 'object'
  ) {
    const fieldErrors = apiError.fieldErrors as Record<string, readonly string[]>;
    return {
      name: firstMessage(fieldErrors['name']),
      email: firstMessage(fieldErrors['email']),
      password: firstMessage(fieldErrors['password']),
      is_admin: firstMessage(fieldErrors['is_admin']),
      _form: firstMessage(fieldErrors['user']),
    };
  }
  return {};
}

function firstMessage(list: readonly string[] | undefined): string | undefined {
  if (Array.isArray(list) && list.length > 0) {
    return list[0];
  }
  return undefined;
}

function toApiErrorMessage(err: unknown): string {
  if (err instanceof UsersHttpError) {
    return ErrorNormalizer.toUserMessage(err.apiError);
  }
  return 'No se pudo cargar el usuario.';
}
