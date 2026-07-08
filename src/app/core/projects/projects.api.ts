import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { API_CONFIG } from '../config/api-config';
import type { Paginated } from '../api/paginate';
import type { Project } from './project.model';

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
      .get<Paginated<Project>>(`${this.apiConfig.apiBaseUrl}/v1/projects`, {
        params,
      })
      .pipe(map((page) => page.data as Project[]));
  }
}
