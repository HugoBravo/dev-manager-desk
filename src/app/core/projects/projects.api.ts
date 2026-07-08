import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { API_CONFIG } from '../config/api-config';
import type { Project } from './project.model';

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
}
