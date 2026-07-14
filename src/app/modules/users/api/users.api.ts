import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { API_CONFIG } from '../../../core/config/api-config';
import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import type { ApiError } from '../../../core/errors/api-error';

import type { CreateUserPayload, UpdateUserPayload, User } from '../models/user.model';

export class UsersHttpError extends Error {
  readonly apiError: ApiError;
  constructor(apiError: ApiError) {
    super(apiError.message);
    this.apiError = apiError;
  }
}

/**
 * Thin HttpClient wrapper around the global user-administration endpoints
 * (`/api/v1/users`). Returns Promises; signal-backed state lives in
 * {@link UsersStore}. Errors throw {@link UsersHttpError} so the 422
 * field-error surface and 403 `is_admin`-gated discriminator work the
 * same as the secrets/kanban APIs.
 */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  /** `GET /api/v1/users` — admin-gated paginated list. */
  async list(page = 1): Promise<readonly User[]> {
    const url = this.baseUrl();
    const params = page > 1 ? new HttpParams().set('page', String(page)) : new HttpParams();
    try {
      const raw = await this.http.get<unknown>(url, { params }).toPromise();
      return unwrapLaravelItems<User>(raw);
    } catch (err) {
      throw toUsersHttpError(err);
    }
  }

  /** `GET /api/v1/users/{user}` — admins any user; non-admins self only. */
  async get(userId: number): Promise<User> {
    try {
      const raw = await this.http.get<unknown>(`${this.baseUrl()}/${userId}`).toPromise();
      return unwrapLaravelItem<User>(raw);
    } catch (err) {
      throw toUsersHttpError(err);
    }
  }

  /** `POST /api/v1/users` — admin-gated create. Returns 201. */
  async create(payload: CreateUserPayload): Promise<User> {
    const body = {
      name: payload.name,
      email: payload.email,
      password: payload.password,
      is_admin: payload.is_admin ?? false,
    };
    try {
      const raw = await this.http.post<unknown>(this.baseUrl(), body).toPromise();
      return unwrapLaravelItem<User>(raw);
    } catch (err) {
      throw toUsersHttpError(err);
    }
  }

  /** `PATCH /api/v1/users/{user}` — admins anyone; non-admins self only with `name`/`password`. */
  async update(userId: number, payload: UpdateUserPayload): Promise<User> {
    const body: Record<string, string | boolean> = {};
    if (payload.name !== undefined) {
      body['name'] = payload.name;
    }
    if (payload.email !== undefined) {
      body['email'] = payload.email;
    }
    if (payload.password !== undefined) {
      body['password'] = payload.password;
    }
    if (payload.is_admin !== undefined) {
      body['is_admin'] = payload.is_admin;
    }
    try {
      const raw = await this.http.patch<unknown>(`${this.baseUrl()}/${userId}`, body).toPromise();
      return unwrapLaravelItem<User>(raw);
    } catch (err) {
      throw toUsersHttpError(err);
    }
  }

  /** `DELETE /api/v1/users/{user}` — admin only. Returns 204. Soft-delete + token revoke. */
  async delete(userId: number): Promise<void> {
    try {
      await this.http.delete<void>(`${this.baseUrl()}/${userId}`).toPromise();
    } catch (err) {
      throw toUsersHttpError(err);
    }
  }

  private baseUrl(): string {
    return `${this.apiConfig.apiBaseUrl}/v1/users`;
  }
}

function toUsersHttpError(err: unknown): UsersHttpError {
  if (err instanceof HttpErrorResponse) {
    const apiError = ErrorNormalizer.fromHttpErrorResponse(err, {
      url: err.url ?? undefined,
    });
    return new UsersHttpError(apiError);
  }
  return new UsersHttpError({
    kind: 'network',
    status: 0,
    message: 'No se pudo conectar con el servidor. Verificá tu conexión.',
  });
}

/**
 * Unwrap Laravel paginator per-resource envelopes into a flat array.
 * `GET /api/v1/users` returns `{ data: [{ data: User }], meta, links }`.
 */
function unwrapLaravelItems<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => unwrapLaravelItem<T>(item));
  }
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const data = (raw as { data: unknown }).data;
    if (Array.isArray(data)) {
      return data.map((item) => unwrapLaravelItem<T>(item));
    }
  }
  return [];
}

function unwrapLaravelItem<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}
