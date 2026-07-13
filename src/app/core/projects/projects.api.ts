import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { API_CONFIG } from '../config/api-config';
import type { Project, ProjectPatch } from './project.model';

/**
 * Shape returned by `GET /api/v1/projects`. Laravel's paginator wraps each
 * resource in its own `{ data: {...} }` envelope (JsonResource default), so
 * `data[]` items are not bare `Project` shapes — they are `{ data: Project }`.
 * We unwrap that layer here so callers see a flat `Project[]`.
 */
interface ProjectsEnvelope {
  readonly data: ReadonlyArray<{ readonly data: Project }>;
  readonly links?: unknown;
  readonly meta?: unknown;
}

/**
 * Thin HttpClient wrapper around the Laravel projects endpoints. Returns
 * Observables; signal-backed state lives in {@link ProjectService}.
 */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  list(includeArchived = false): Observable<Project[]> {
    let params = new HttpParams();
    if (includeArchived) {
      params = params.set('include_archived', '1');
    }
    return this.http
      .get<ProjectsEnvelope>(`${this.apiConfig.apiBaseUrl}/v1/projects`, {
        params,
      })
      .pipe(map((env) => env.data.map((wrapped) => wrapped.data)));
  }

  /**
   * Create a new project. POSTs to `/v1/projects` and unwraps Laravel's
   * per-resource `{ data: Project }` envelope so callers see a flat
   * `Project`. `description` is sent as `null` when omitted so the
   * nullable backend column receives a JSON null (not the string `"null"`
   * or `undefined`).
   */
  create(input: { name: string; description?: string | null }): Observable<Project> {
    return this.http
      .post<{ data: Project }>(`${this.apiConfig.apiBaseUrl}/v1/projects`, {
        name: input.name,
        description: input.description ?? null,
      })
      .pipe(map((env) => env.data));
  }

  /**
   * Patch a project. Used for rename, archive, and unarchive.
   *
   * The backend `UpdateProjectRequest` treats `archived_at: null` as an
   * explicit unarchive, and ISO timestamps as archive. Omitted fields are
   * left untouched, so callers can build small patches without restating
   * the whole record.
   */
  update(id: number, patch: ProjectPatch): Observable<Project> {
    return this.http
      .patch<{ data: Project }>(
        `${this.apiConfig.apiBaseUrl}/v1/projects/${id}`,
        patch,
      )
      .pipe(map((env) => env.data));
  }

  /**
   * Archive a project by PATCHing `archived_at` to the current timestamp.
   * Returns the updated `Project` so the service can reinsert it
   * server-truth into the visible list when needed.
   */
  archive(id: number): Observable<Project> {
    return this.update(id, { archived_at: new Date().toISOString() });
  }

  /**
   * Unarchive a project by PATCHing `archived_at` to `null`. Returns the
   * updated `Project` so the service can reinsert it at the head of the
   * active list.
   */
  unarchive(id: number): Observable<Project> {
    return this.update(id, { archived_at: null });
  }

  /**
   * Hard-delete a project. The backend returns 204 No Content; we map the
   * empty body to `void` so the service can detect success by the absence
   * of an error rather than parsing a payload.
   */
  delete(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.apiConfig.apiBaseUrl}/v1/projects/${id}`)
      .pipe(map(() => undefined));
  }
}
