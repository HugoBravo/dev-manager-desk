import { Component, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import { AuthService } from '../../../core/auth/auth.service';

import { UsersApi, UsersHttpError } from '../api/users.api';
import type { User } from '../models/user.model';
import { UsersStore } from '../stores/users.store';
import {
  UserDeleteDialog,
  type UserDeleteDialogData,
  type UserDeleteDialogResult,
} from '../components/user-delete-dialog/user-delete-dialog';

/**
 * Admin user-administration list page. Renders 4 states (loading / empty
 * / error / list) consistent with the kanban / secrets list pages.
 *
 * The list is admin-only; non-admins are redirected to /modules/kanban
 * by {@link adminUserGuard}. The "+ New user" button stays client-side
 * hidden (not just disabled) so the page is meaningful for self-edit
 * scenarios where the user navigates here without admin rights.
 */
@Component({
  selector: 'app-users-list-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
  templateUrl: './users-list.page.html',
  styleUrl: './users-list.page.scss',
  host: {
    '[attr.aria-busy]': 'isBusy()',
    '[attr.aria-live]': '"polite"',
  },
})
export class UsersListPage {
  private readonly usersApi = inject(UsersApi);
  private readonly store = inject(UsersStore);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly users = computed<readonly User[]>(() => this.store.users());
  protected readonly loading = computed(() => this.store.isListLoading());
  protected readonly error = this.store.error;
  protected readonly isBusy = this.loading;
  protected readonly isAdmin = computed(() => this.auth.user()?.is_admin === true);

  protected readonly isEmpty = computed(() => !this.loading() && this.store.users().length === 0);

  protected readonly statusMessage = computed(() => {
    if (this.loading()) {
      return 'Loading users';
    }
    const err = this.error();
    if (err) {
      return ErrorNormalizer.toUserMessage(err);
    }
    return '';
  });

  protected readonly displayedColumns = ['name', 'email', 'is_admin', 'actions'];

  /** Tracked previous active user id; drives refetch on login switch. */
  private readonly _activeUserId = signal<string | number | null>(null);

  constructor() {
    effect(() => {
      const current = this.auth.user();
      const idKey = current?.id ?? null;
      const previous = this._activeUserId();
      this._activeUserId.set(idKey);
      if (previous !== idKey) {
        void this.fetch();
      }
    });
  }

  private async fetch(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      return;
    }
    this.store.cache.setLoading('list');
    try {
      const list = await this.usersApi.list();
      this.store.cache.set(list);
      this.store.cache.setError(null);
    } catch (err) {
      this.store.cache.setError(toApiError(err));
    } finally {
      this.store.cache.setLoading('idle');
    }
  }

  protected onRowSelect(user: User): void {
    void this.router.navigate(['/modules/users', String(user.id)]);
  }

  protected onRowKeydown(event: KeyboardEvent, user: User): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onRowSelect(user);
    }
  }

  protected onCreate(): void {
    void this.router.navigate(['/modules/users', 'new']);
  }

  protected async onDelete(user: User, event: Event): Promise<void> {
    event.stopPropagation();
    const data: UserDeleteDialogData = { userName: user.name, userEmail: user.email };
    const ref = this.dialog.open<UserDeleteDialog, UserDeleteDialogData, UserDeleteDialogResult>(
      UserDeleteDialog,
      { data },
    );
    const result = await firstValueFrom(ref.afterClosed());
    if (result !== 'confirm') {
      return;
    }
    const ok = await this.store.delete(user.id);
    if (ok) {
      this.snackBar.open(`Deleted user ${user.email}`, 'Dismiss', { duration: 3000 });
    }
  }
}

function toApiError(err: unknown) {
  if (err instanceof UsersHttpError) {
    return err.apiError;
  }
  return ErrorNormalizer.fromHttpErrorResponse(err as never, {
    url: (err as { url?: string } | null | undefined)?.url,
  });
}
