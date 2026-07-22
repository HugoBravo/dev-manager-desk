import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { API_CONFIG } from '../config/api-config';
import type { Task, TaskPatch } from './task.model';

interface TasksEnvelope {
  readonly data: ReadonlyArray<{ readonly data: Task }>;
}

interface TaskEnvelope {
  readonly data: Task;
}

@Service()
export class TasksApi {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  list(projectId: number, includeArchived = false): Observable<Task[]> {
    let params = new HttpParams();
    if (includeArchived) {
      params = params.set('include_archived', '1');
    }
    return this.http
      .get<TasksEnvelope>(this.baseUrl(projectId), { params })
      .pipe(map((response) => response.data.map((item) => item.data)));
  }

  show(projectId: number, taskId: number): Observable<Task> {
    return this.http
      .get<TaskEnvelope>(`${this.baseUrl(projectId)}/${taskId}`)
      .pipe(map((response) => response.data));
  }

  create(projectId: number, input: TaskPatch & Pick<Task, 'name'>): Observable<Task> {
    return this.http
      .post<TaskEnvelope>(this.baseUrl(projectId), input)
      .pipe(map((response) => response.data));
  }

  update(projectId: number, taskId: number, patch: TaskPatch): Observable<Task> {
    return this.http
      .patch<TaskEnvelope>(`${this.baseUrl(projectId)}/${taskId}`, patch)
      .pipe(map((response) => response.data));
  }

  archive(projectId: number, taskId: number): Observable<Task> {
    return this.postAction(projectId, taskId, 'archive');
  }

  restore(projectId: number, taskId: number): Observable<Task> {
    return this.postAction(projectId, taskId, 'restore');
  }

  private postAction(projectId: number, taskId: number, action: 'archive' | 'restore') {
    return this.http
      .post<TaskEnvelope>(`${this.baseUrl(projectId)}/${taskId}/${action}`, {})
      .pipe(map((response) => response.data));
  }

  private baseUrl(projectId: number): string {
    return `${this.apiConfig.apiBaseUrl}/v1/projects/${projectId}/tasks`;
  }
}
