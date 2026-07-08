import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { API_CONFIG } from '../../../core/config/api-config';
import { ErrorNormalizer } from '../../../core/errors/error-normalizer';
import type { ApiError } from '../../../core/errors/api-error';
import type { Project } from '../../../core/projects/project.model';

import type {
  Board,
  BoardDetail,
  KanbanCard,
  KanbanColumn,
  Page,
} from '../models';

/**
 * Thin HttpClient wrapper around the kanban endpoints under
 * `/api/v1/projects/{project}/kanban/...`. Returns Observables; signal-backed
 * state lives in store classes.
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
   * `GET /api/v1/projects` — the authenticated user's projects (paginated,
   * archived filtered by default per api-doc §4.1).
   */
  listProjects(includeArchived = false): Observable<Project[]> {
    let params = new HttpParams();
    if (includeArchived) {
      params = params.set('include_archived', '1');
    }
    return this.http
      .get<Page<Project>>(`${this.baseUrl()}/projects`, { params })
      .pipe(
        map((page) => page.data as Project[]),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `GET /api/v1/projects/{project}/kanban/boards?page=...` — paginated list of
   * boards ordered by position ASC (api-doc §5.1).
   */
  listBoards(projectId: number, page = 1): Observable<Page<Board>> {
    const url = `${this.baseUrl(projectId)}/kanban/boards`;
    return this.http
      .get<Page<Board>>(url, {
        params: page > 1 ? new HttpParams().set('page', String(page)) : new HttpParams(),
      })
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  /**
   * `GET /api/v1/projects/{project}/kanban/boards/{board}` — bare board
   * (api-doc §5.3). Returns just the `Board` resource; the columns and
   * cards are fetched via the dedicated endpoints below.
   */
  getBoard(projectId: number, boardId: number): Observable<Board> {
    return this.http
      .get<Board>(`${this.baseUrl(projectId)}/kanban/boards/${boardId}`)
      .pipe(catchError((err: unknown) => catchHttpError(err)));
  }

  /**
   * `GET /api/v1/projects/{project}/kanban/boards/{board}/columns` — bare
   * columns for a board (api-doc §6.1), ordered by position ASC.
   */
  listColumns(projectId: number, boardId: number): Observable<readonly KanbanColumn[]> {
    return this.http
      .get<Page<KanbanColumn>>(
        `${this.baseUrl(projectId)}/kanban/boards/${boardId}/columns`,
      )
      .pipe(
        map((page) => page.data),
        catchError((err: unknown) => catchHttpError(err)),
      );
  }

  /**
   * `GET /api/v1/projects/{project}/kanban/boards/{board}/columns/{column}/cards`
   * — bare cards in a column (api-doc §7.1), ordered by position ASC.
   */
  listCards(
    projectId: number,
    boardId: number,
    columnId: number,
  ): Observable<readonly KanbanCard[]> {
    return this.http
      .get<Page<KanbanCard>>(
        `${this.baseUrl(projectId)}/kanban/boards/${boardId}/columns/${columnId}/cards`,
      )
      .pipe(
        map((page) => page.data),
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
  getBoardDetail(projectId: number, boardId: number): Observable<BoardDetail> {
    const board$ = this.getBoard(projectId, boardId);
    const columns$ = this.listColumns(projectId, boardId);

    return forkJoin({ board: board$, columns: columns$ }).pipe(
      switchMap(({ board, columns }) => {
        if (columns.length === 0) {
          return [[board, columns, {} as Record<string, KanbanCard[]>] as const];
        }
        return forkJoin(
          columns.map((column) =>
            this.listCards(projectId, boardId, column.id).pipe(
              map((cards) => ({ columnId: column.id, cards })),
              catchError(() =>
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

  private baseUrl(projectId?: number): string {
    const prefix = `${this.apiConfig.apiBaseUrl}/v1`;
    if (projectId === undefined) {
      return `${prefix}`;
    }
    return `${prefix}/projects/${projectId}`;
  }
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
      err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
        ? ((err as { message: string }).message)
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
