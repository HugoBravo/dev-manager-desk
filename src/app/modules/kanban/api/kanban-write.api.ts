import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_CONFIG } from '../../../core/config/api-config';
import type { KanbanCard } from '../models';

import { catchHttpError } from './kanban.api';

/**
 * Payload for {@link KanbanWriteApi.createCard} (api-doc §7.3).
 * `body`, `due_date`, and `assignee_id` are nullable / optional per the
 * documented constraints.
 */
export interface CreateCardPayload {
  readonly title: string;
  readonly body?: string | null;
  readonly due_date?: string | null;
}

/**
 * Payload for {@link KanbanWriteApi.updateCard} (api-doc §7.4). All fields are
 * optional; sending `body: null` clears the body (the backend's empty-string
 * / null semantics are honored server-side).
 */
export interface UpdateCardPayload {
  readonly title?: string;
  readonly body?: string | null;
  readonly due_date?: string | null;
}

/**
 * Payload for {@link KanbanWriteApi.moveCard} (api-doc §7.8). The client
 * NEVER computes `position` locally — the server returns the canonical
 * fractional-indexing string in the response. `position` is optional: when
 * omitted the card is appended to the target column's chain.
 */
export interface MoveCardPayload {
  readonly target_column_id: number;
  readonly position?: string;
}

/**
 * Write API for cards. Endpoints match `dev-manager-backend/docs/kanban-api.md`
 * §7.3–§7.9 exactly. Every method pipes errors through
 * {@link catchHttpError} so the W3 wiring contract is preserved (PR2
 * verify-report #134 obs / `kanban-write` F1).
 *
 * The move method is the only path CDK drag-drop is allowed to take (see
 * {@link serverConfirmedMove}); NO optimistic local mutation is permitted.
 */
@Injectable({ providedIn: 'root' })
export class KanbanWriteApi {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  /**
   * `POST /api/v1/projects/{p}/kanban/boards/{b}/columns/{c}/cards` —
   * create a card in a column (api-doc §7.3). Returns 201 with the new
   * {@link KanbanCard} (server-computed `position`).
   */
  createCard(
    projectId: number,
    boardId: number,
    columnId: number,
    payload: CreateCardPayload,
  ): Observable<KanbanCard> {
    return this.http
      .post<KanbanCard>(
        `${this.cardsBase(projectId, boardId, columnId)}/cards`,
        payload,
      )
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  /**
   * `PATCH /api/v1/projects/{p}/kanban/boards/{b}/columns/{c}/cards/{card}` —
   * update a card (api-doc §7.4). All payload fields are optional.
   */
  updateCard(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    payload: UpdateCardPayload,
  ): Observable<KanbanCard> {
    return this.http
      .patch<KanbanCard>(
        `${this.cardsBase(projectId, boardId, columnId)}/cards/${cardId}`,
        payload,
      )
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  /**
   * `POST .../cards/{card}/move` — move a card to another column (api-doc §7.8).
   * Returns the updated {@link KanbanCard} with the server-computed
   * `position`. The caller MUST await this response before committing to
   * local signals; see {@link serverConfirmedMove}.
   */
  moveCard(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    payload: MoveCardPayload,
  ): Observable<KanbanCard> {
    return this.http
      .post<KanbanCard>(
        `${this.cardsBase(projectId, boardId, columnId)}/cards/${cardId}/move`,
        payload,
      )
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  /**
   * `POST .../cards/{card}/archive` — archive a card (api-doc §7.5). Returns
   * the updated {@link KanbanCard} with `archived_at` set.
   */
  archiveCard(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
  ): Observable<KanbanCard> {
    return this.http
      .post<KanbanCard>(
        `${this.cardsBase(projectId, boardId, columnId)}/cards/${cardId}/archive`,
        {},
      )
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  /**
   * `POST .../cards/{card}/restore` — restore an archived card (api-doc §7.6).
   * Returns the updated {@link KanbanCard} with `archived_at = null`.
   */
  restoreCard(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
  ): Observable<KanbanCard> {
    return this.http
      .post<KanbanCard>(
        `${this.cardsBase(projectId, boardId, columnId)}/cards/${cardId}/restore`,
        {},
      )
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  /**
   * `DELETE .../cards/{card}` — hard-delete a card (api-doc §7.9). Cascades
   * to comments + attachments server-side. Returns 204.
   *
   * Note: per api-doc §10, card deletion does NOT return a `409` typed code
   * (only board and column deletions do — see §5.8 / §6.9). The 409 conflict
   * UX for `column_has_contents` fires when deleting the parent column, not
   * the card itself.
   */
  deleteCard(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
  ): Observable<void> {
    return this.http
      .delete<void>(
        `${this.cardsBase(projectId, boardId, columnId)}/cards/${cardId}`,
      )
      .pipe(
        map(() => undefined),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  private cardsBase(
    projectId: number,
    boardId: number,
    columnId: number,
  ): string {
    const prefix = `${this.apiConfig.apiBaseUrl}${this.apiConfig.apiPrefix}`;
    return `${prefix}/projects/${projectId}/kanban/boards/${boardId}/columns/${columnId}`;
  }
}