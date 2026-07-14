import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_CONFIG } from '../../../core/config/api-config';
import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import type { ApiError } from '../../../core/errors/api-error';

import { catchHttpError, unwrapLaravelItem, unwrapLaravelItems } from '../../kanban/api/kanban.api';
import type { CreateSecretPayload, Secret, UpdateSecretPayload } from '../models/secret.model';

/**
 * Thin HttpClient wrapper around the project-scoped secrets endpoints
 * (`/api/v1/projects/{project}/secrets`). Returns Observables;
 * signal-backed state lives in {@link SecretsStore}.
 *
 * Laravel paginator envelopes are unwrapped via the shared helpers from
 * `KanbanApi` so callers see a flat `Secret[]`. Errors funnel through
 * `catchHttpError` — preserves the W3 wiring contract (403 discriminator
 * via URL + response headers, 422 field-error surface, 404 collapse).
 */
@Injectable({ providedIn: 'root' })
export class SecretsApi {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  /**
   * `GET /api/v1/projects/{project}/secrets` — paginated collection. The
   * backend `SecretController::index` pages at 25 / page, ordered by id ASC.
   */
  list(projectId: number, page = 1): Observable<Secret[]> {
    const url = this.collectionUrl(projectId);
    const params = page > 1 ? new HttpParams().set('page', String(page)) : new HttpParams();
    return this.http.get<unknown>(url, { params }).pipe(
      map((raw) => unwrapLaravelItems<Secret>(raw)),
      catchError((err: unknown) => catchHttpError(err)),
    );
  }

  /**
   * `GET /api/v1/projects/{project}/secrets/{secret}` — fetch a single
   * secret with its decrypted value.
   */
  get(projectId: number, secretId: number): Observable<Secret> {
    return this.http.get<unknown>(`${this.collectionUrl(projectId)}/${secretId}`).pipe(
      map((raw) => unwrapLaravelItem<Secret>(raw)),
      catchError((err: unknown) => catchHttpError(err)),
    );
  }

  /**
   * `POST /api/v1/projects/{project}/secrets` — create a new secret. The
   * backend returns 201 with the resource envelope `{ data: Secret }`.
   * `description` is JSON-null when omitted so the nullable column receives
   * the expected shape (mirrors {@link ProjectsApi.create}).
   */
  create(projectId: number, payload: CreateSecretPayload): Observable<Secret> {
    const body = {
      key: payload.key,
      value: payload.value,
      description: payload.description ?? null,
    };
    return this.http.post<{ data: Secret }>(this.collectionUrl(projectId), body).pipe(
      map((raw) => unwrapLaravelItem<Secret>(raw)),
      catchError((err: unknown) => catchHttpError(err)),
    );
  }

  /**
   * `PATCH /api/v1/projects/{project}/secrets/{secret}` — update a secret's
   * `value` and / or `description`. `key` is immutable (the backend
   * `UpdateSecretRequest` rules don't define it).
   */
  update(projectId: number, secretId: number, payload: UpdateSecretPayload): Observable<Secret> {
    const body: Record<string, string | null> = {};
    if (payload.value !== undefined) {
      body['value'] = payload.value;
    }
    if (payload.description !== undefined) {
      body['description'] = payload.description;
    }
    return this.http
      .patch<{ data: Secret }>(`${this.collectionUrl(projectId)}/${secretId}`, body)
      .pipe(
        map((raw) => unwrapLaravelItem<Secret>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `DELETE /api/v1/projects/{project}/secrets/{secret}` — hard delete.
   * Returns 204 No Content. The store removes the row from the cache
   * after the response resolves.
   */
  delete(projectId: number, secretId: number): Observable<void> {
    return this.http.delete<void>(`${this.collectionUrl(projectId)}/${secretId}`).pipe(
      map(() => undefined),
      catchError((err: unknown) => catchHttpError(err)),
    );
  }

  private collectionUrl(projectId: number): string {
    return `${this.apiConfig.apiBaseUrl}/v1/projects/${projectId}/secrets`;
  }
}

/**
 * Build an `ApiError` from a non-HTTP throw so the page layer can surface
 * a user-facing message without reaching into the HTTP layer.
 * Mirrors the helpers used in `kanban-write.api.spec.ts`.
 */
export function secretsToApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'kind' in err) {
    return err as ApiError;
  }
  if (err instanceof HttpErrorResponse) {
    return ErrorNormalizer.fromHttpErrorResponse(err, {
      url: err.url ?? undefined,
    });
  }
  return {
    kind: 'network',
    status: 0,
    message: 'Could not reach the server. Check your connection and try again.',
  };
}

/**
 * Re-export `catchHttpError` so spec files can audit the W3 wiring
 * contract (the kanban-equivalent spec pattern asserts errors always flow
 * through this helper). Internal use only.
 */
export { catchHttpError, throwError };
