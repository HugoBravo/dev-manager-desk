import { Service, computed, inject, signal } from '@angular/core';

import type { ApiError } from '../../../core/errors/api-error';
import type { CreateUserPayload, UpdateUserPayload, User } from '../models/user.model';
import { UsersApi, UsersHttpError } from '../api/users.api';

export type UsersStoreLoading = 'idle' | 'list';

/**
 * Signal-backed cache for the admin user-administration list. Lives at
 * feature scope (lazy-loaded with the route) — not provided in root —
 * so the cache lifecycle matches the route.
 *
 * The page wires HTTP via the public `cache` writer so it can hydrate
 * the cache after a list fetch without exposing the private signals.
 * Mutations are exposed as methods so the cross-page invalidation
 * contract stays in one place.
 */
@Service()
export class UsersStore {
  private readonly api = inject(UsersApi);

  private readonly _users = signal<readonly User[]>([]);
  private readonly _loading = signal<UsersStoreLoading>('idle');
  private readonly _error = signal<ApiError | null>(null);

  readonly users = this._users.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isListLoading = computed(() => this._loading() === 'list');
  readonly isEmpty = computed(() => this._users().length === 0);

  readonly cache = {
    set: (users: readonly User[]) => this._users.set(users),
    setLoading: (value: UsersStoreLoading) => this._loading.set(value),
    setError: (value: ApiError | null) => this._error.set(value),
  };

  async load(page = 1): Promise<readonly User[] | null> {
    this._loading.set('list');
    this._error.set(null);
    try {
      const list = await this.api.list(page);
      this._users.set(list);
      return list;
    } catch (err) {
      this._error.set(toApiError(err));
      return null;
    } finally {
      this._loading.set('idle');
    }
  }

  /**
   * Issue a create and append the server-returned row to the cache if
   * the call succeeds. Returns the row or `null` on error.
   */
  async create(payload: CreateUserPayload): Promise<User | null> {
    try {
      const created = await this.api.create(payload);
      const current = this._users();
      this._users.set([...current, created]);
      return created;
    } catch (err) {
      this._error.set(toApiError(err));
      return null;
    }
  }

  /**
   * Issue an update and replace the row in the cache with the server
   * response. Returns the updated row or `null` on error.
   */
  async update(userId: number, payload: UpdateUserPayload): Promise<User | null> {
    try {
      const updated = await this.api.update(userId, payload);
      const current = this._users();
      this._users.set(current.map((u) => (u.id === updated.id ? updated : u)));
      return updated;
    } catch (err) {
      this._error.set(toApiError(err));
      return null;
    }
  }

  /**
   * Issue a delete (admin-only) and remove the row from the cache on
   * success. Returns `true` on success, `false` on error.
   */
  async delete(userId: number): Promise<boolean> {
    try {
      await this.api.delete(userId);
      const current = this._users();
      this._users.set(current.filter((u) => u.id !== userId));
      return true;
    } catch (err) {
      this._error.set(toApiError(err));
      return false;
    }
  }
}

function toApiError(err: unknown): ApiError {
  if (err instanceof UsersHttpError) {
    return err.apiError;
  }
  if (err && typeof err === 'object' && 'kind' in err) {
    return err as ApiError;
  }
  return {
    kind: 'network',
    status: 0,
    message: 'No se pudo conectar con el servidor. Verificá tu conexión.',
  };
}
