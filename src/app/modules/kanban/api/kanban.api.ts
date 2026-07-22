import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { API_CONFIG } from '../../../core/config/api-config';
import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import type { ApiError } from '../../../core/errors/api-error';

import type {
  Board,
  BoardAuditLog,
  BoardDetail,
  KanbanCard,
  KanbanColumn,
  KanbanLabel,
} from '../models';

/**
 * Thin HttpClient wrapper around the kanban endpoints under
 * `/api/v1/projects/{project}/tasks/{task}/kanban/...`. Returns Observables;
 * signal-backed state lives in store classes.
 *
 * ## URL contract (kanban-per-task)
 *
 * Every task-scoped read/write inserts `taskId` between `projectId` and the
 * `kanban/...` segment. Global endpoints (`/kanban-labels`,
 * `/boards/bulk-*`) remain unaffected — labels and bulk operations stay
 * user-global per the proposal.
 *
 * ## Laravel pagination envelope
 *
 * `GET` endpoints that return collections come back as
 * `{ data: [{ data: T }], links, meta }` — Laravel's paginator wraps each
 * resource in its own JsonResource envelope. The methods on this class UNWRAP
 * the inner envelope so callers see a flat `T[]`. Page metadata (links, meta)
 * is currently discarded; if pagination controls are needed later, the
 * `unwrapLaravelPage` helper exposes the raw `meta` for callers.
 *
 * ## W3 enforcement (non-negotiable — see verify-report #134 obs / error-normalizer §F4)
 *
 * Every method MUST pipe `HttpErrorResponse` through
 * {@link ErrorNormalizer.fromHttpErrorResponse} inside `.pipe(catchError(...))`
 * so the 403 `edit_window_expired` discriminator can inspect both the request
 * URL (from `HttpErrorResponse.url`) and the response headers (passed via
 * `ctx.headers`). Status+body alone is fine for typed 409 / 422 / 401 / 404
 * cases; for 403 the URL is mandatory.
 *
 * All methods funnel through {@link catchHttpError}, a single helper that
 * keeps the wiring pattern in one place. If the wiring ever drifts, the test
 * suite asserts the contract via `HttpTestingController`.
 */
@Injectable({ providedIn: 'root' })
export class KanbanApi {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  /**
   * `GET /api/v1/projects/{p}/tasks/{t}/kanban/boards?page=...` — paginated
   * list of boards ordered by position ASC (api-doc §5.1). Unwraps the
   * Laravel per-resource envelope; returns a flat `Board[]`.
   */
  listBoards(projectId: number, taskId: number, page = 1): Observable<Board[]> {
    const url = `${this.baseUrl(projectId, taskId)}/kanban/boards`;
    return this.http
      .get<unknown>(url, {
        params: page > 1 ? new HttpParams().set('page', String(page)) : new HttpParams(),
      })
      .pipe(
        map((raw) => unwrapLaravelItems<Board>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `GET /api/v1/projects/{p}/tasks/{t}/kanban/boards/{board}` — bare board
   * (api-doc §5.3). Returns just the `Board` resource; the columns and
   * cards are fetched via the dedicated endpoints below.
   */
  getBoard(projectId: number, taskId: number, boardId: number): Observable<Board> {
    return this.http
      .get<unknown>(`${this.baseUrl(projectId, taskId)}/kanban/boards/${boardId}`)
      .pipe(
        map((raw) => unwrapLaravelItem<Board>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `GET /api/v1/projects/{p}/tasks/{t}/kanban/boards/{board}/columns` —
   * bare columns for a board (api-doc §6.1), ordered by position ASC.
   * Unwraps the Laravel per-resource envelope.
   */
  listColumns(
    projectId: number,
    taskId: number,
    boardId: number,
  ): Observable<KanbanColumn[]> {
    return this.http
      .get<unknown>(`${this.baseUrl(projectId, taskId)}/kanban/boards/${boardId}/columns`)
      .pipe(
        map((raw) => unwrapLaravelItems<KanbanColumn>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `GET /api/v1/projects/{p}/tasks/{t}/kanban/boards/{board}/columns/{column}`
   * — bare single column (api-doc §6.3). Returns the {@link KanbanColumn}
   * resource with the canonical `archived_at` and `position`. Unwraps
   * the Laravel per-resource envelope.
   *
   * Useful for refresh-after-mutation (one column's `position` /
   * `archived_at` changed) when the caller wants to avoid refetching
   * the whole `getBoardDetail` payload.
   */
  getColumn(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
  ): Observable<KanbanColumn> {
    return this.http
      .get<unknown>(
        `${this.baseUrl(projectId, taskId)}/kanban/boards/${boardId}/columns/${columnId}`,
      )
      .pipe(
        map((raw) => unwrapLaravelItem<KanbanColumn>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `GET /api/v1/projects/{p}/tasks/{t}/kanban/boards/{board}/columns/{column}/cards`
   * — bare cards in a column (api-doc §7.1), ordered by position ASC.
   * Unwraps the Laravel per-resource envelope.
   */
  listCards(
    projectId: number,
    taskId: number,
    boardId: number,
    columnId: number,
  ): Observable<KanbanCard[]> {
    return this.http
      .get<unknown>(
        `${this.baseUrl(projectId, taskId)}/kanban/boards/${boardId}/columns/${columnId}/cards`,
      )
      .pipe(
        map((raw) => unwrapLaravelItems<KanbanCard>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * Convenience: composes {@link getBoard} + {@link listColumns} +
   * {@link listCards} (one call per column) into a single `BoardDetail`.
   *
   * Consumers can `subscribe` and use `BoardDetail` directly. If the board or
   * columns request fails, the composed observable errors with the typed
   * `ApiError`. If a single column's cards request fails, the page falls
   * back to an empty list for that column — column-level failures are not
   * fatal in the read-only viewer.
   */
  getBoardDetail(
    projectId: number,
    taskId: number,
    boardId: number,
  ): Observable<BoardDetail> {
    const board$ = this.getBoard(projectId, taskId, boardId);
    const columns$ = this.listColumns(projectId, taskId, boardId);

    return forkJoin({ board: board$, columns: columns$ }).pipe(
      switchMap(({ board, columns }) => {
        if (columns.length === 0) {
          return [[board, columns, {} as Record<string, KanbanCard[]>] as const];
        }
        return forkJoin(
          columns.map((column) =>
            this.listCards(projectId, taskId, boardId, column.id).pipe(
              map((cards) => ({ columnId: column.id, cards })),
              catchError(
                () =>
                  // Card-level failure is non-fatal: empty list for that
                  // column. The page still renders the rest.
                  [[column.id, []] as const].slice(-1).map((entry) => ({
                    columnId: column.id,
                    cards: [] as KanbanCard[],
                  })) as never,
              ),
            ),
          ),
        ).pipe(
          map((perColumn) => {
            const cardsByColumnId: Record<string, KanbanCard[]> = {};
            for (const entry of perColumn) {
              cardsByColumnId[String(entry.columnId)] = entry.cards as KanbanCard[];
            }
            return [board, columns, cardsByColumnId] as const;
          }),
        );
      }),
      map(([board, columns, cardsByColumnId]) => ({
        board,
        columns,
        cardsByColumnId,
      })),
    );
  }

  /**
   * `GET /api/v1/kanban-labels?page=...` — paginated list of the
   * authenticated user's labels ordered by name ASC (api-doc §10.1).
   * Unwraps the Laravel per-resource envelope; returns a flat
   * `KanbanLabel[]`.
   */
  listLabels(page = 1): Observable<KanbanLabel[]> {
    const url = `${this.baseUrl()}/kanban-labels`;
    return this.http
      .get<unknown>(url, {
        params: page > 1 ? new HttpParams().set('page', String(page)) : new HttpParams(),
      })
      .pipe(
        map((raw) => unwrapLaravelItems<KanbanLabel>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `GET /api/v1/kanban-labels/{label}` — bare label (api-doc §10.3).
   * Cross-user fetch returns 404 (existence-leak guard); the typed
   * `ApiError` lands in the `error` signal of the calling store.
   */
  getLabel(labelId: number): Observable<KanbanLabel> {
    return this.http.get<unknown>(`${this.baseUrl()}/kanban-labels/${labelId}`).pipe(
      map((raw) => unwrapLaravelItem<KanbanLabel>(raw)),
      catchError((err: unknown) => catchHttpError(err)),
    );
  }

  /**
   * `GET /api/v1/projects/{p}/tasks/{t}/kanban/boards/trashed?page=...` —
   * soft-deleted boards for a task (api-doc §16 trash), newest-deleted
   * first. Unwraps the Laravel paginator envelope; returns a flat
   * {@link Board} array where every entry has a non-null `deleted_at`.
   *
   * Used by the trash page; the active boards list endpoint excludes
   * these by default. Cross-owner returns 404 (collapsed to `notFound`).
   */
  listTrashedBoards(projectId: number, taskId: number, page = 1): Observable<Board[]> {
    const url = `${this.baseUrl(projectId, taskId)}/kanban/boards/trashed`;
    return this.http
      .get<unknown>(url, {
        params: page > 1 ? new HttpParams().set('page', String(page)) : new HttpParams(),
      })
      .pipe(
        map((raw) => unwrapLaravelItems<Board>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `GET /api/v1/projects/{p}/tasks/{t}/kanban/boards/{board}/audit?page=...`
   * — paginated audit log for a board (api-doc §19), newest-first, page
   * size 25. Returns a flat {@link BoardAuditLog} array (unwraps the
   * Laravel per-row envelope).
   *
   * Lives on the read API surface so callers can `inject(KanbanApi)` for
   * the audit fetch without pulling in the write API. Errors: 401
   * unauth, 404 cross-owner.
   */
  listBoardAudit(
    projectId: number,
    taskId: number,
    boardId: number,
    page = 1,
  ): Observable<readonly BoardAuditLog[]> {
    const url = `${this.baseUrl(projectId, taskId)}/kanban/boards/${boardId}/audit`;
    return this.http
      .get<unknown>(url, {
        params: page > 1 ? new HttpParams().set('page', String(page)) : new HttpParams(),
      })
      .pipe(
        map((raw) => unwrapLaravelItems<BoardAuditLog>(raw)),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  private baseUrl(projectId?: number, taskId?: number): string {
    const prefix = `${this.apiConfig.apiBaseUrl}/v1`;
    if (projectId === undefined) {
      // Global endpoints (labels) — no project/task scope.
      return `${prefix}`;
    }
    if (taskId === undefined) {
      // Misuse guard: a project-scoped kanban URL without a taskId is no
      // longer supported under the kanban-per-task contract. Surfacing this
      // here (instead of silently building a legacy URL) means a missing
      // `setTaskId()` in a store fails fast in tests.
      throw new Error(
        'KanbanApi.baseUrl: taskId is required when projectId is provided (kanban-per-task contract).',
      );
    }
    return `${prefix}/projects/${projectId}/tasks/${taskId}`;
  }
}

/**
 * Unwrap a Laravel paginator response that uses JsonResource per row:
 *
 *   { data: [{ data: T }, { data: T }, ...], links, meta }
 *
 * Returns a flat `T[]`. Throws if the envelope is malformed — that's a
 * programmer error worth catching in tests, not silently returning `[]`.
 */
export function unwrapLaravelItems<T>(raw: unknown): T[] {
  if (!raw || typeof raw !== 'object' || !('data' in raw)) {
    throw new Error('KanbanApi: expected Laravel paginator envelope');
  }
  const outer = (raw as { data: unknown }).data;
  if (!Array.isArray(outer)) {
    throw new Error('KanbanApi: envelope.data must be an array');
  }
  return outer.map((wrapped) => unwrapLaravelItem<T>(wrapped));
}

/**
 * Unwrap a single Laravel JsonResource envelope: `{ data: T }` → `T`.
 * If `raw` is already a bare object (no inner `data` key), it's returned as-is
 * — defensive against endpoints that bypass the resource wrapper.
 */
export function unwrapLaravelItem<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const inner = (raw as { data: unknown }).data;
    if (inner && typeof inner === 'object') {
      return inner as T;
    }
  }
  return raw as T;
}

/**
 * Pipe an `HttpErrorResponse` through {@link ErrorNormalizer.fromHttpErrorResponse}
 * and rethrow as an `ApiError`. Centralized so the W3 wiring contract is in
 * one place (the W3 enforce-test in `kanban.api.spec.ts` asserts this helper
 * is the only path errors take).
 */
export function catchHttpError(err: unknown): Observable<never> {
  if (err instanceof HttpErrorResponse) {
    const apiError: ApiError = ErrorNormalizer.fromHttpErrorResponse(err, {
      url: err.url ?? undefined,
      headers: headersToRecord(err.headers),
    });
    return throwError(() => apiError);
  }
  // Anything that escapes the normalizer path (e.g. a synthetic throw) is
  // surfaced as a generic network error — `ErrorNormalizer` cannot inspect a
  // non-HTTP error.
  const fallback: ApiError = {
    kind: 'network',
    status: 0,
    message:
      err &&
      typeof err === 'object' &&
      'message' in err &&
      typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'Could not reach the server. Check your connection and try again.',
  };
  return throwError(() => fallback);
}

/**
 * Convert an `HttpHeaders` instance to a plain record. Used to forward
 * response headers (e.g. `X-Kanban-Realm`) into the normalizer context so
 * the 403 discriminator can fire for non-URL-detectable cases.
 */
function headersToRecord(
  headers: HttpErrorResponse['headers'],
): Readonly<Record<string, string>> | undefined {
  if (!headers) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const key of headers.keys()) {
    const value = headers.get(key);
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}
