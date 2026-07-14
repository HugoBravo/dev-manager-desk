import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ApiError } from '../../../core/errors/api-error';
import type { Secret } from '../models/secret.model';
import { secretsToApiError, SecretsApi } from '../api/secrets.api';

export type SecretsStoreLoading = 'idle' | 'list';

/**
 * Signal-backed cache for the project-scoped secrets list. Lives at feature
 * scope (lazy-loaded with the route) — not provided in root — so the cache
 * lifecycle matches the route. Stores one project's secrets at a time;
 * switching projects replaces the cache (a user cannot hold secrets from
 * two projects in the same view).
 *
 * The page wires HTTP via the public `cache` writer (mirrors
 * `BoardsStore.boardsCache`) so it can hydrate the cache after a list
 * fetch without exposing the private signals. Mutations commit through
 * the dedicated `apply*` methods so the cross-page invalidation contract
 * stays in one place.
 */
@Service()
export class SecretsStore {
  private readonly api = inject(SecretsApi);

  private readonly _secrets = signal<readonly Secret[]>([]);
  private readonly _loading = signal<SecretsStoreLoading>('idle');
  private readonly _error = signal<ApiError | null>(null);
  private readonly _projectId = signal<number | null>(null);

  readonly secrets = this._secrets.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly projectId = this._projectId.asReadonly();
  readonly isListLoading = computed(() => this._loading() === 'list');

  /**
   * Public writer for the secrets cache. Used by pages that issue
   * their own HTTP request (so the loading/error signal lifecycle
   * stays local to the page for testability) and want to commit the
   * result here.
   */
  readonly cache = {
    set: (secrets: readonly Secret[]) => this._secrets.set(secrets),
    setLoading: (value: SecretsStoreLoading) => this._loading.set(value),
    setError: (value: ApiError | null) => this._error.set(value),
    setProjectId: (id: number | null) => this._projectId.set(id),
  };

  /**
   * Fetch the secrets list for the given project and commit the result
   * to the cache + error signals. Returns `null` on failure so the
   * caller can render the error card without try/catch noise. The page
   * prefers the `cache` writer + manual HTTP so it controls the loading
   * signal lifecycle per its test harness; this helper remains for
   * symmetry with {@link BoardsStore.loadBoards} (single-shot fetches
   * without per-row state).
   */
  async load(projectId: number): Promise<readonly Secret[] | null> {
    this._loading.set('list');
    this._error.set(null);
    this._projectId.set(projectId);
    try {
      const list = await firstValueFrom(this.api.list(projectId));
      this._secrets.set(list);
      return list;
    } catch (err) {
      this._error.set(secretsToApiError(err));
      return null;
    } finally {
      this._loading.set('idle');
    }
  }

  /**
   * Append a server-returned secret to the current cache. No-op when
   * the store's project doesn't match — guards against races where a
   * slow POST resolves after the user has switched projects.
   */
  applyCreated(projectId: number, secret: Secret): void {
    if (this._projectId() !== projectId) {
      return;
    }
    const current = this._secrets();
    if (current.some((s) => s.id === secret.id)) {
      this.applyUpdated(projectId, secret);
      return;
    }
    this._secrets.set([...current, secret]);
  }

  /**
   * Replace a secret in the cache with the server-returned row. Used
   * after a successful PATCH (and as a safety net inside `applyCreated`).
   * No-op if the store doesn't own the same project or the id isn't in
   * the cache.
   */
  applyUpdated(projectId: number, secret: Secret): void {
    if (this._projectId() !== projectId) {
      return;
    }
    const current = this._secrets();
    let changed = false;
    const next = current.map((s) => {
      if (s.id !== secret.id) {
        return s;
      }
      changed = true;
      return secret;
    });
    if (!changed) {
      return;
    }
    this._secrets.set(next);
  }

  /**
   * Remove a secret from the cache. Idempotent — a missing id is a no-op.
   */
  applyRemoved(projectId: number, secretId: number): void {
    if (this._projectId() !== projectId) {
      return;
    }
    const before = this._secrets();
    const next = before.filter((s) => s.id !== secretId);
    if (next.length === before.length) {
      return;
    }
    this._secrets.set(next);
  }

  /**
   * Reset the secrets cache + loading flag. Keeps `error` intact so a
   * transient network error doesn't get masked by a project switch.
   * Leaves `_projectId` pointing at the previous project so callers
   * that read `projectId()` from the store (e.g. the page effect that
   * decides whether to fetch) can still reason about ownership.
   */
  reset(): void {
    this._secrets.set([]);
    this._loading.set('idle');
  }
}
