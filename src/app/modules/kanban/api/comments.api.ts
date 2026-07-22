import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_CONFIG } from '../../../core/config/api-config';
import { catchHttpError, unwrapLaravelItems } from './kanban.api';

import type { KanbanComment } from '../models';

/**
 * Request body for `POST /comments` and `PATCH /comments/{id}`.
 *
 * Per api-doc §8.3 the server accepts only `body` (and `parent_id` on
 * create). PR4 omits `parent_id` support — the dialog creates top-level
 * comments only; threading support is a future change.
 */
export interface CommentBodyRequest {
  readonly body: string;
}

/**
 * Wire shape returned by `GET /comments` (paginated, see api-doc §8.1).
 * The endpoint returns the Laravel envelope; this client unwraps `data`.
 */
export type CommentList = readonly KanbanComment[];

/**
 * Comments API. Mirrors {@link KanbanApi} / {@link KanbanWriteApi}: thin
 * HttpClient wrapper, W3 wiring through {@link catchHttpError}.
 *
 * URL shape per api-doc §8 (kanban-per-task):
 *   GET    /api/v1/projects/{p}/tasks/{t}/kanban/boards/{b}/columns/{c}/cards/{card}/comments
 *   POST   /api/v1/projects/{p}/tasks/{t}/kanban/boards/{b}/columns/{c}/cards/{card}/comments
 *   PATCH  /api/v1/projects/{p}/tasks/{t}/kanban/boards/{b}/columns/{c}/cards/{card}/comments/{id}
 *   DELETE /api/v1/projects/{p}/tasks/{t}/kanban/boards/{b}/columns/{c}/cards/{card}/comments/{id}
 *
 * `taskId` is inserted between `projectId` and the `kanban/...` segment;
 * the rest of the path is unchanged from the previous contract.
 */
@Injectable({ providedIn: 'root' })
export class CommentsApi {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  listComments(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
    cardId: number,
  ): Observable<CommentList> {
    const url = `${this.baseUrl(projectId, taskId, boardId, columnId, cardId)}/comments`;
    return this.http
      .get<unknown>(url)
      .pipe(
        map((raw) => unwrapLaravelItems<KanbanComment>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  createComment(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    body: CommentBodyRequest,
  ): Observable<KanbanComment> {
    const url = `${this.baseUrl(projectId, taskId, boardId, columnId, cardId)}/comments`;
    return this.http
      .post<KanbanComment>(url, body)
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  updateComment(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    commentId: number,
    body: CommentBodyRequest,
  ): Observable<KanbanComment> {
    const url = `${this.baseUrl(projectId, taskId, boardId, columnId, cardId)}/comments/${commentId}`;
    return this.http
      .patch<KanbanComment>(url, body)
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  deleteComment(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    commentId: number,
  ): Observable<void> {
    const url = `${this.baseUrl(projectId, taskId, boardId, columnId, cardId)}/comments/${commentId}`;
    return this.http.delete<void>(url).pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  private baseUrl(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
    cardId: number,
  ): string {
    const prefix = `${this.apiConfig.apiBaseUrl}/v1`;
    return `${prefix}/projects/${projectId}/tasks/${taskId}/kanban/boards/${boardId}/columns/${columnId}/cards/${cardId}`;
  }
}