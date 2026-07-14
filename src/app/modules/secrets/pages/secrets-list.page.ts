import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import { ProjectService } from '../../../core/projects/project.service';
import type { ApiError } from '../../../core/errors/api-error';

import { SecretsApi } from '../api/secrets.api';
import {
  SecretEditorDialog,
  type SecretEditorDialogData,
  type SecretEditorDialogResult,
} from '../components/secret-editor-dialog/secret-editor-dialog';
import {
  SecretDeleteDialog,
  type SecretDeleteDialogData,
  type SecretDeleteDialogResult,
} from '../components/secret-delete-dialog/secret-delete-dialog';
import { SecretCard } from '../components/secret-card/secret-card';
import type { CreateSecretPayload, Secret, UpdateSecretPayload } from '../models/secret.model';
import { SecretsStore } from '../stores/secrets.store';

/**
 * Project-scoped secrets list page. Renders 4 states (loading / empty /
 * error / list) consistent with the kanban `BoardsListPage` pattern.
 *
 * Lifecycle:
 * - On `:projectId` route param change (or initial arrival), the page
 *   resets the store and fetches the first page of secrets via
 *   {@link SecretsApi.list}.
 * - On create / update / delete, the server response is committed to
 *   the store via `applyCreated` / `applyUpdated` / `applyRemoved` so
 *   the UI reflects the canonical record without a refetch.
 *
 * Errors funnel through `ErrorNormalizer.toUserMessage`. The page never
 * holds the plaintext `value` in memory beyond what the user has
 * explicitly revealed via `SecretCard`'s toggle — the store never logs
 * or persists the value either.
 */
@Component({
  selector: 'app-secrets-list-page',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule, SecretCard],
  templateUrl: './secrets-list.page.html',
  styleUrl: './secrets-list.page.scss',
  host: {
    '[attr.aria-busy]': 'isBusy()',
    '[attr.aria-live]': '"polite"',
  },
})
export class SecretsListPage {
  private readonly secretsApi = inject(SecretsApi);
  private readonly store = inject(SecretsStore);
  private readonly projectService = inject(ProjectService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly projectId = input.required<string>();

  protected readonly secrets = computed(() => this.store.secrets());
  protected readonly loading = computed(() => this.store.isListLoading());
  protected readonly error = this.store.error;
  protected readonly isBusy = this.loading;

  protected readonly current = this.projectService.current;

  protected readonly statusMessage = computed(() => {
    if (this.loading()) {
      return 'Loading secrets';
    }
    const err = this.error();
    if (err) {
      return ErrorNormalizer.toUserMessage(err);
    }
    return '';
  });

  protected readonly isSubmitting = signal(false);

  private readonly lastFetchedProjectId = signal<number | null>(null);

  constructor() {
    effect(() => {
      const raw = this.projectId();
      const projectId = readProjectId(raw);
      if (projectId === null) {
        return;
      }
      // Skip duplicate fetches when the URL param hasn't changed
      // (e.g. on second change-detection cycle after the first effect
      // run already kicked off the HTTP). Comparing to a local
      // `lastFetchedProjectId` signal avoids the loop where resetting
      // `_projectId` in the store would re-trigger this effect.
      if (this.lastFetchedProjectId() === projectId) {
        return;
      }
      this.lastFetchedProjectId.set(projectId);
      this.store.reset();
      this.fetch(projectId);
    });
  }

  protected retry(): void {
    const projectId = readProjectId(this.projectId());
    if (projectId === null) {
      return;
    }
    this.lastFetchedProjectId.set(null);
    this.fetch(projectId);
  }

  private fetch(projectId: number): void {
    this.store.cache.setLoading('list');
    this.store.cache.setError(null);
    this.store.cache.setProjectId(projectId);
    this.secretsApi
      .list(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (secrets) => {
          this.store.cache.set(secrets);
          this.store.cache.setLoading('idle');
        },
        error: (err: unknown) => {
          this.store.cache.setLoading('idle');
          this.store.cache.setError(toApiError(err));
        },
      });
  }

  protected openCreateDialog(triggerElement: HTMLElement): void {
    const projectId = readProjectId(this.projectId());
    if (projectId === null || this.isSubmitting()) {
      return;
    }
    const data: SecretEditorDialogData = {
      mode: 'create',
      projectId,
      triggerElement,
    };
    const ref = this.dialog.open<
      SecretEditorDialog,
      SecretEditorDialogData,
      SecretEditorDialogResult
    >(SecretEditorDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result || result.action !== 'saved' || !result.payload) {
        return;
      }
      void this.createSecret(projectId, result.payload);
    });
  }

  protected openEditDialog(secret: Secret, triggerElement: HTMLElement): void {
    const projectId = readProjectId(this.projectId());
    if (projectId === null || this.isSubmitting()) {
      return;
    }
    const data: SecretEditorDialogData = {
      mode: 'edit',
      projectId,
      secret,
      triggerElement,
    };
    const ref = this.dialog.open<
      SecretEditorDialog,
      SecretEditorDialogData,
      SecretEditorDialogResult
    >(SecretEditorDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result || result.action !== 'saved' || !result.payload) {
        return;
      }
      const { value, description } = result.payload;
      const patch: UpdateSecretPayload = {
        value,
        description,
      };
      void this.updateSecret(projectId, secret.id, patch);
    });
  }

  protected openDeleteDialog(secret: Secret): void {
    const projectId = readProjectId(this.projectId());
    if (projectId === null || this.isSubmitting()) {
      return;
    }
    const data: SecretDeleteDialogData = { secretKey: secret.key };
    const ref = this.dialog.open<
      SecretDeleteDialog,
      SecretDeleteDialogData,
      SecretDeleteDialogResult
    >(SecretDeleteDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result?.confirmed) {
        return;
      }
      void this.deleteSecret(projectId, secret.id, secret.key);
    });
  }

  private async createSecret(projectId: number, payload: CreateSecretPayload): Promise<void> {
    this.isSubmitting.set(true);
    try {
      const created = await firstValueFrom(this.secretsApi.create(projectId, payload));
      this.store.applyCreated(projectId, created);
      this.snackBar.open(`Secret "${created.key}" created`, 'Dismiss', {
        duration: 2500,
      });
    } catch (err) {
      const apiError = toApiError(err);
      this.snackBar.open(ErrorNormalizer.toUserMessage(apiError), 'Dismiss', {
        duration: 4000,
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private async updateSecret(
    projectId: number,
    secretId: number,
    payload: UpdateSecretPayload,
  ): Promise<void> {
    this.isSubmitting.set(true);
    try {
      const updated = await firstValueFrom(this.secretsApi.update(projectId, secretId, payload));
      this.store.applyUpdated(projectId, updated);
      this.snackBar.open(`Secret "${updated.key}" updated`, 'Dismiss', {
        duration: 2500,
      });
    } catch (err) {
      const apiError = toApiError(err);
      this.snackBar.open(ErrorNormalizer.toUserMessage(apiError), 'Dismiss', {
        duration: 4000,
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private async deleteSecret(projectId: number, secretId: number, key: string): Promise<void> {
    this.isSubmitting.set(true);
    try {
      await firstValueFrom(this.secretsApi.delete(projectId, secretId));
      this.store.applyRemoved(projectId, secretId);
      this.snackBar.open(`Secret "${key}" deleted`, 'Dismiss', {
        duration: 2500,
      });
    } catch (err) {
      const apiError = toApiError(err);
      this.snackBar.open(ErrorNormalizer.toUserMessage(apiError), 'Dismiss', {
        duration: 4000,
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected onCardEdit(secret: Secret): void {
    this.openEditDialog(secret, this.dialogTrigger(secret.id, 'edit'));
  }

  protected onCardDelete(secret: Secret): void {
    this.openDeleteDialog(secret);
  }

  private dialogTrigger(_secretId: number, _kind: 'edit' | 'delete'): HTMLElement {
    const target = document.activeElement;
    if (target instanceof HTMLElement) {
      return target;
    }
    return document.body;
  }
}

function readProjectId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'kind' in err) {
    return err as ApiError;
  }
  if (err && typeof err === 'object' && 'status' in err) {
    return ErrorNormalizer.fromHttpErrorResponse(err as never);
  }
  return {
    kind: 'network',
    status: 0,
    message: 'Could not reach the server. Check your connection and try again.',
  };
}
