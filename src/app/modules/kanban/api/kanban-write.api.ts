import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_CONFIG } from '../../../core/config/api-config';
import type { KanbanCard, KanbanColumn, KanbanLabel } from '../models';

import { catchHttpError, unwrapLaravelItem } from './kanban.api';

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
 *
 * The backend validator (`MoveCardRequest`) expects the field name
 * `to_column_id` — see `dev-manager-backend/app/Http/Requests/Kanban/MoveCardRequest.php`.
 * Earlier revisions of the frontend shipped `target_column_id`; the
 * mismatch caused a 422 on every move. The wire shape is now `to_column_id`.
 */
export interface MoveCardPayload {
  readonly to_column_id: number;
  readonly position?: string;
}

/**
 * Payload for {@link KanbanWriteApi.createLabel} (api-doc §10.2). Both
 * fields are required; the backend validates the color against the
 * `#RRGGBB` regex and enforces `name` uniqueness per user.
 */
export interface CreateLabelPayload {
  readonly name: string;
  readonly color: string;
}

/**
 * Payload for {@link KanbanWriteApi.updateLabel} (api-doc §10.4). Both
 * fields are optional — sending only `color` renames nothing, sending
 * only `name` recolors nothing.
 */
export interface UpdateLabelPayload {
  readonly name?: string;
  readonly color?: string;
}

/**
 * Payload for {@link KanbanWriteApi.syncCardLabels} (api-doc §10.6). The
 * `label_ids` array REPLACES the card's current set; empty array clears
 * all labels. Each id must belong to the authenticated user — cross-user
 * ids fail server-side with 422.
 */
export interface SyncCardLabelsPayload {
  readonly label_ids: readonly number[];
}

/**
 * Payload for {@link KanbanWriteApi.createColumn} (api-doc §6.7). The
 * backend validates `name` as `required|string|min:1|max:100` and the
 * server-computes the column's `position` (fractional indexing).
 */
export interface CreateColumnPayload {
  readonly name: string;
}

/**
 * Payload for {@link KanbanWriteApi.updateColumn} (api-doc §6.8). Both
 * fields are optional: sending only `name` leaves `archived_at` intact;
 * sending only `archived_at` leaves the name intact. To unarchive,
 * send `archived_at: null`; to archive, send an ISO 8601 string. The
 * `name` rule is `sometimes|required|string|min:1|max:100` so empty
 * strings are rejected.
 */
export interface UpdateColumnPayload {
  readonly name?: string;
  readonly archived_at?: string | null;
}

/**
 * Payload for {@link KanbanWriteApi.reorderColumns} (api-doc §6.6). The
 * server REPLACES the column ordering with the supplied id list; ids not
 * present in the list are unaffected (server-side guard). The response
 * only returns the count that was reordered, not the column list — the
 * caller refetches via {@link KanbanApi.listColumns} or refreshes the
 * store via {@link BoardsStore.replaceColumnOrder}.
 */
export interface ReorderColumnsPayload {
  readonly ordered_ids: readonly number[];
}

/**
 * Result returned by {@link KanbanWriteApi.reorderColumns}. The backend
 * returns `{ data: { reordered: number } }`; the API unwraps the outer
 * envelope and returns this type.
 */
export interface ReorderColumnsResult {
  readonly reordered: number;
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
      .post<KanbanCard>(`${this.cardsBase(projectId, boardId, columnId)}/cards`, payload)
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanCard>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
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
      .patch<KanbanCard>(`${this.cardsBase(projectId, boardId, columnId)}/cards/${cardId}`, payload)
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanCard>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
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
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanCard>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
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
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanCard>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
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
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanCard>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
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
      .delete<void>(`${this.cardsBase(projectId, boardId, columnId)}/cards/${cardId}`)
      .pipe(
        map(() => undefined),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `POST /api/v1/kanban-labels` — create a new label for the
   * authenticated user (api-doc §10.2). Returns 201 with the new
   * {@link KanbanLabel}.
   *
   * Validation lives in the backend: 422 with field errors when `name`
   * collides with another label owned by the same user, or when `color`
   * does not match the `#RRGGBB` regex.
   */
  createLabel(payload: CreateLabelPayload): Observable<KanbanLabel> {
    return this.http.post<KanbanLabel>(`${this.labelsBase()}/kanban-labels`, payload).pipe(
      map((raw) => unwrapLaravelItem<KanbanLabel>(raw)),
      catchError((err: unknown) => catchHttpError(err)),
    );
  }

  /**
   * `PATCH /api/v1/kanban-labels/{label}` — update an existing label
   * (api-doc §10.4). Both payload fields are optional. Cross-user patch
   * returns 404 (no existence leak).
   */
  updateLabel(labelId: number, payload: UpdateLabelPayload): Observable<KanbanLabel> {
    return this.http
      .patch<KanbanLabel>(`${this.labelsBase()}/kanban-labels/${labelId}`, payload)
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanLabel>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `DELETE /api/v1/kanban-labels/{label}` — hard-delete a label
   * (api-doc §10.5). Returns 204. The pivot rows in `kanban_card_label`
   * cascade server-side; the calling store MUST prune the label out of
   * every cached card to avoid stale UI references.
   */
  deleteLabel(labelId: number): Observable<void> {
    return this.http.delete<void>(`${this.labelsBase()}/kanban-labels/${labelId}`).pipe(
      map(() => undefined),
      catchError((err: unknown) => catchHttpError(err)),
    );
  }

  /**
   * `PUT /api/v1/projects/{p}/kanban/boards/{b}/columns/{c}/cards/{card}/labels`
   * — sync the set of labels on a card (api-doc §10.6). Returns 200 with
   * the updated {@link KanbanCard} including the new `labels` array. The
   * caller is responsible for committing the card to the store via
   * `BoardsStore.applyCardMutation()`.
   */
  syncCardLabels(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    labelIds: readonly number[],
  ): Observable<KanbanCard> {
    const body: SyncCardLabelsPayload = { label_ids: [...labelIds] };
    return this.http
      .put<KanbanCard>(
        `${this.cardsBase(projectId, boardId, columnId)}/cards/${cardId}/labels`,
        body,
      )
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanCard>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  private cardsBase(projectId: number, boardId: number, columnId: number): string {
    const prefix = `${this.apiConfig.apiBaseUrl}/v1`;
    return `${prefix}/projects/${projectId}/kanban/boards/${boardId}/columns/${columnId}`;
  }

  private labelsBase(): string {
    return `${this.apiConfig.apiBaseUrl}/v1`;
  }

  private columnsBase(projectId: number, boardId: number): string {
    const prefix = `${this.apiConfig.apiBaseUrl}/v1`;
    return `${prefix}/projects/${projectId}/kanban/boards/${boardId}/columns`;
  }

  /**
   * `POST /api/v1/projects/{p}/kanban/boards/{b}/columns` — create a new
   * column on a board (api-doc §6.7). Returns 201 with the new
   * {@link KanbanColumn}. The server computes the column's `position`
   * (fractional indexing, appended to the existing chain).
   *
   * Backend validation: 422 with `fieldErrors.name` if the name is empty,
   * non-string, or longer than 100 characters.
   */
  createColumn(
    projectId: number,
    boardId: number,
    payload: CreateColumnPayload,
  ): Observable<KanbanColumn> {
    return this.http
      .post<KanbanColumn>(`${this.columnsBase(projectId, boardId)}`, payload)
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanColumn>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `PATCH /api/v1/projects/{p}/kanban/boards/{b}/columns/{c}` — update a
   * column (api-doc §6.8). At least one of `name` / `archived_at` MUST be
   * sent; both are optional. Sending `archived_at: null` unarchives.
   * Returns the updated {@link KanbanColumn}.
   *
   * Backend validation: 422 with `fieldErrors.name` if a name is provided
   * but fails the `required|string|min:1|max:100` rule; 409 with
   * `code: 'column_has_contents'` if archiving a column that still has
   * cards (the backend's archive-before-move contract — see api-doc §6.5).
   */
  updateColumn(
    projectId: number,
    boardId: number,
    columnId: number,
    payload: UpdateColumnPayload,
  ): Observable<KanbanColumn> {
    return this.http
      .patch<KanbanColumn>(
        `${this.columnsBase(projectId, boardId)}/${columnId}`,
        payload,
      )
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanColumn>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `DELETE /api/v1/projects/{p}/kanban/boards/{b}/columns/{c}` —
   * hard-delete a column (api-doc §6.9). Returns 204. Throws 409 with
   * `code: 'column_has_contents'` if the column still has cards; the
   * caller surfaces this with a snackbar via
   * {@link ErrorNormalizer.toUserMessage}.
   */
  deleteColumn(
    projectId: number,
    boardId: number,
    columnId: number,
  ): Observable<void> {
    return this.http
      .delete<void>(`${this.columnsBase(projectId, boardId)}/${columnId}`)
      .pipe(
        map(() => undefined),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `POST /api/v1/projects/{p}/kanban/boards/{b}/columns/reorder` —
   * replace the column ordering with the supplied id list (api-doc
   * §6.6). The endpoint expects an `ordered_ids` array; ids not in the
   * list are untouched (server-side guard). Returns a count — use
   * {@link KanbanApi.listColumns} / {@link BoardsStore.replaceColumnOrder}
   * to refresh the local cache.
   */
  reorderColumns(
    projectId: number,
    boardId: number,
    orderedIds: readonly number[],
  ): Observable<ReorderColumnsResult> {
    const body: ReorderColumnsPayload = { ordered_ids: [...orderedIds] };
    return this.http
      .post<ReorderColumnsResult>(
        `${this.columnsBase(projectId, boardId)}/reorder`,
        body,
      )
      .pipe(
        map((raw) => unwrapLaravelItem<ReorderColumnsResult>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `POST /api/v1/projects/{p}/kanban/boards/{b}/columns/{c}/move` —
   * move a column to another board on the same project (api-doc §6.10).
   * Returns the moved {@link KanbanColumn} with the destination board's
   * `board_id` and a server-computed `position`.
   */
  moveColumn(
    projectId: number,
    boardId: number,
    columnId: number,
    toBoardId: number,
  ): Observable<KanbanColumn> {
    return this.http
      .post<KanbanColumn>(
        `${this.columnsBase(projectId, boardId)}/${columnId}/move`,
        { to_board_id: toBoardId },
      )
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanColumn>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }
}
