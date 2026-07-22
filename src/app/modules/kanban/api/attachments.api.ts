import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_CONFIG } from '../../../core/config/api-config';
import { catchHttpError, unwrapLaravelItems } from './kanban.api';

import type { KanbanAttachment } from '../models';

/**
 * Wire shape returned by `GET /attachments` (paginated, api-doc §9.1).
 * The endpoint returns the Laravel envelope; this client unwraps `data`.
 */
export type AttachmentList = readonly KanbanAttachment[];

/**
 * Client-side mime allowlist (api-doc §9.2). The backend enforces the same
 * allowlist server-side and returns 422 `attachment_mime_blocked` on
 * violation. We block disallowed mimes BEFORE the upload to spare the
 * server a request and to give the user an immediate snackbar.
 *
 * The 8 allowed mimes are (matches the backend's allowlist exactly):
 *   image/jpeg, image/png, image/gif, image/webp,
 *   application/pdf, text/plain, text/markdown, application/zip.
 *
 * Extension aliases from the backend (`jpg`, `jpeg`, `png`, `gif`, `webp`,
 * `pdf`, `md`, `txt`, `zip`) are accepted on upload but the server resolves
 * them to a canonical mime before the `mime` field on the response. The
 * client uses canonical mimes only.
 */
export const ATTACHMENT_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/zip',
]);

/** Maximum allowed upload size in bytes (5 MB — api-doc §9.2). */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Attachments API. Mirrors {@link CommentsApi}: thin HttpClient wrapper,
 * W3 wiring through {@link catchHttpError}.
 *
 * URL shape per api-doc §9 (kanban-per-task):
 *   GET    /api/v1/projects/{p}/tasks/{t}/kanban/boards/{b}/columns/{c}/cards/{card}/attachments
 *   POST   /api/v1/projects/{p}/tasks/{t}/kanban/boards/{b}/columns/{c}/cards/{card}/attachments
 *   DELETE /api/v1/projects/{p}/tasks/{t}/kanban/boards/{b}/columns/{c}/cards/{card}/attachments/{id}
 *
 * `taskId` is inserted between `projectId` and the `kanban/...` segment;
 * the rest of the path is unchanged from the previous contract.
 *
 * The POST sends `multipart/form-data` with a single `file` field. Mime +
 * size pre-checks live in {@link AttachmentsStore} so the dialog can show
 * immediate feedback without round-tripping.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentsApi {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  listAttachments(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
    cardId: number,
  ): Observable<AttachmentList> {
    const url = `${this.baseUrl(projectId, taskId, boardId, columnId, cardId)}/attachments`;
    return this.http
      .get<unknown>(url)
      .pipe(
        map((raw) => unwrapLaravelItems<KanbanAttachment>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  uploadAttachment(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    file: File,
  ): Observable<KanbanAttachment> {
    const url = `${this.baseUrl(projectId, taskId, boardId, columnId, cardId)}/attachments`;
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http
      .post<KanbanAttachment>(url, form)
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  deleteAttachment(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    attachmentId: number,
  ): Observable<void> {
    const url = `${this.baseUrl(projectId, taskId, boardId, columnId, cardId)}/attachments/${attachmentId}`;
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