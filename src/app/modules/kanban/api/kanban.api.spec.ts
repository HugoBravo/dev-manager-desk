import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import type { ApiError } from '../../../core/errors/api-error';
import { catchHttpError, KanbanApi } from './kanban.api';

const API_BASE_URL = 'http://localhost:8000/api';
// `apiBaseUrl` already ends in `/api`, so the v1 prefix is `/v1` (NOT
// `/api/v1`). `FULL_PREFIX` is the real URL the runtime client produces.
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;

/**
 * Build a Laravel paginator response with JsonResource per row. Matches the
 * real backend shape `{ data: [{ data: T }], links, meta }`.
 */
function paginated<T>(rows: T[]) {
  return {
    data: rows.map((row) => ({ data: row })),
    links: { first: '', last: '', prev: null, next: null },
    meta: {
      current_page: 1,
      from: 1,
      last_page: 1,
      per_page: 25,
      to: rows.length,
      total: rows.length,
      path: '',
    },
  };
}

const sampleBoard = () => ({
  id: 4,
  project_id: 7,
  name: 'Sprint 42',
  position: 'n',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const sampleColumn = (id: number) => ({
  id,
  board_id: 4,
  name: 'In Progress',
  position: 'u',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const sampleLabel = (id: number, name: string, color: string) => ({
  id,
  name,
  color,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const sampleCard = (id: number, columnId: number) => ({
  id,
  column_id: columnId,
  title: `Card ${id}`,
  body: null,
  due_date: null,
  archived_at: null,
  position: 'k',
  labels: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('KanbanApi', () => {
  let api: KanbanApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: API_CONFIG,
          useValue: { apiBaseUrl: API_BASE_URL },
        },
        KanbanApi,
      ],
    });
    api = TestBed.inject(KanbanApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('listBoards()', () => {
    it('GETs /projects/{id}/kanban/boards with no page param on the first page', async () => {
      const promise = api.listBoards(7).toPromise();
      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url === `${FULL_PREFIX}/projects/7/kanban/boards`,
      );
      expect(req.request.params.has('page')).toBe(false);
      req.flush(paginated([sampleBoard()]));
      await expect(promise).resolves.toEqual([sampleBoard()]);
    });

    it('appends ?page=N when page > 1', async () => {
      const promise = api.listBoards(7, 3).toPromise();
      const req = httpMock.expectOne((r) => r.params.get('page') === '3');
      req.flush(paginated([]));
      await expect(promise).resolves.toEqual([]);
    });

    it('routes errors through catchHttpError (W3 enforcement)', async () => {
      const promise = api.listBoards(7).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards`)
        .flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });

  describe('getBoard()', () => {
    it('GETs /projects/{id}/kanban/boards/{board} and unwraps the resource envelope', async () => {
      const promise = api.getBoard(7, 4).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`)
        .flush({ data: sampleBoard() });
      await expect(promise).resolves.toEqual(sampleBoard());
    });

    it('surfaces 404 through the normalizer', async () => {
      const promise = api.getBoard(7, 4).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });

  describe('listColumns() and listCards()', () => {
    it('listColumns GETs /columns and unwraps the envelope', async () => {
      const promise = api.listColumns(7, 4).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns`)
        .flush(paginated([sampleColumn(12)]));
      await expect(promise).resolves.toEqual([sampleColumn(12)]);
    });

    it('listCards GETs /columns/{id}/cards and unwraps the envelope', async () => {
      const promise = api.listCards(7, 4, 12).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards`)
        .flush(paginated([sampleCard(87, 12)]));
      await expect(promise).resolves.toEqual([sampleCard(87, 12)]);
    });

    it('listColumns routes 404 through the normalizer', async () => {
      const promise = api.listColumns(7, 4).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });

  describe('getBoardDetail()', () => {
    it('composes board + columns + cards into one BoardDetail', async () => {
      const promise = api.getBoardDetail(7, 4).toPromise();
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`).flush(sampleBoard());

      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns`)
        .flush(paginated([sampleColumn(12), sampleColumn(13)]));

      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards`)
        .flush(paginated([sampleCard(87, 12)]));

      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/13/cards`)
        .flush(paginated([]));

      const result = await promise;
      expect(result?.board.id).toBe(4);
      expect(result?.columns.map((c) => c.id)).toEqual([12, 13]);
      expect(result?.cardsByColumnId['12']?.map((c) => c.id)).toEqual([87]);
      expect(result?.cardsByColumnId['13']).toEqual([]);
    });

    it('surfaces board 404 even if columns request is cancelled', async () => {
      // When the board endpoint errors, forkJoin cancels the sibling columns
      // request. We use direct subscribe + `expectOne` (without flush) to
      // acknowledge both — `expectOne` removes the request from the verify()
      // check without trying to flush a cancelled request.
      const errorPromise = new Promise<unknown>((resolve, reject) => {
        api.getBoardDetail(7, 4).subscribe({
          next: () => reject(new Error('expected error, got next')),
          error: (err) => resolve(err),
        });
      });

      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      // Mark the sibling columns request as observed so verify() passes;
      // the request was cancelled by forkJoin so we cannot flush it.
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns`);

      const captured = await errorPromise;
      expect(captured).toMatchObject({ kind: 'notFound' });
    });

    it('tolerates a column having no cards (empty list)', async () => {
      const promise = api.getBoardDetail(7, 4).toPromise();
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`).flush(sampleBoard());
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns`)
        .flush(paginated([sampleColumn(12)]));
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards`)
        .flush(paginated([]));
      const result = await promise;
      expect(result?.cardsByColumnId['12']).toEqual([]);
    });
  });

  describe('listLabels()', () => {
    it('GETs /kanban-labels with no page param on the first page', async () => {
      const promise = api.listLabels().toPromise();
      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url === `${FULL_PREFIX}/kanban-labels`,
      );
      expect(req.request.params.has('page')).toBe(false);
      req.flush(paginated([sampleLabel(4, 'bug', '#ef4444')]));
      await expect(promise).resolves.toEqual([sampleLabel(4, 'bug', '#ef4444')]);
    });

    it('appends ?page=N when page > 1', async () => {
      const promise = api.listLabels(2).toPromise();
      const req = httpMock.expectOne(
        (r) => r.params.get('page') === '2' && r.url === `${FULL_PREFIX}/kanban-labels`,
      );
      req.flush(paginated([]));
      await expect(promise).resolves.toEqual([]);
    });

    it('surfaces 401 through the normalizer', async () => {
      const promise = api.listLabels().toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/kanban-labels`)
        .flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });
      await expect(promise).rejects.toMatchObject({ kind: 'unauthorized' });
    });
  });

  describe('getLabel()', () => {
    it('GETs /kanban-labels/{id} and unwraps the resource envelope', async () => {
      const promise = api.getLabel(4).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/kanban-labels/4`)
        .flush({ data: sampleLabel(4, 'bug', '#ef4444') });
      await expect(promise).resolves.toEqual(sampleLabel(4, 'bug', '#ef4444'));
    });

    it('surfaces 404 cross-user through the normalizer', async () => {
      const promise = api.getLabel(4).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/kanban-labels/4`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });

  describe('listTrashedBoards()', () => {
    it('GETs /projects/{id}/kanban/boards/trashed with no page param on the first page', async () => {
      const promise = api.listTrashedBoards(7).toPromise();
      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url === `${FULL_PREFIX}/projects/7/kanban/boards/trashed`,
      );
      expect(req.request.params.has('page')).toBe(false);
      req.flush(paginated([{ ...sampleBoard(), deleted_at: '2026-07-10T15:00:00Z' }]));
      await expect(promise).resolves.toEqual([
        { ...sampleBoard(), deleted_at: '2026-07-10T15:00:00Z' },
      ]);
    });

    it('appends ?page=N when page > 1', async () => {
      const promise = api.listTrashedBoards(7, 3).toPromise();
      const req = httpMock.expectOne(
        (r) => r.params.get('page') === '3' && r.url.endsWith('/boards/trashed'),
      );
      req.flush(paginated([]));
      await expect(promise).resolves.toEqual([]);
    });

    it('routes 401 unauth through the normalizer', async () => {
      const promise = api.listTrashedBoards(7).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/trashed`)
        .flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });
      await expect(promise).rejects.toMatchObject({ kind: 'unauthorized' });
    });

    it('routes 404 cross-owner through the normalizer', async () => {
      const promise = api.listTrashedBoards(7).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/trashed`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });

  describe('listBoardAudit()', () => {
    it('GETs /boards/{id}/audit and unwraps the paginated envelope', async () => {
      const promise = api.listBoardAudit(7, 4).toPromise();
      const req = httpMock.expectOne(
        (r) => r.url === `${FULL_PREFIX}/projects/7/kanban/boards/4/audit`,
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('page')).toBe(false);
      req.flush({
        data: [
          {
            data: {
              id: 1,
              board_id: 4,
              actor_user_id: 7,
              action: 'created',
              payload: {},
              created_at: '2026-01-01T00:00:00Z',
            },
          },
        ],
        links: { first: '', last: '', prev: null, next: null },
        meta: {
          current_page: 1,
          from: 1,
          last_page: 1,
          per_page: 25,
          to: 1,
          total: 1,
          path: '',
        },
      });
      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result?.[0]).toMatchObject({
        id: 1,
        board_id: 4,
        actor_user_id: 7,
        action: 'created',
      });
    });

    it('routes 401 unauth through the normalizer', async () => {
      const promise = api.listBoardAudit(7, 4).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/audit`)
        .flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });
      await expect(promise).rejects.toMatchObject({ kind: 'unauthorized' });
    });

    it('routes 404 cross-owner through the normalizer', async () => {
      const promise = api.listBoardAudit(7, 4).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/audit`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });

  describe('catchHttpError (W3 wiring contract)', () => {
    it('forwards url + headers into the normalizer for 403 with X-Kanban-Realm', async () => {
      // W3 contract: catchHttpError must forward URL + response headers so
      // the 403 discriminator fires for /comments/{id} PATCH/DELETE (PR4
      // concern, but the wiring must exist in PR2).
      const httpErr = new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
        error: { message: 'Forbidden' },
        url: 'http://localhost:8000/api/v1/projects/1/kanban/boards/4',
        headers: new HttpHeaders({ 'X-Kanban-Realm': 'comment' }),
      });

      const captured = await new Promise<ApiError | null>((resolve) => {
        let result: ApiError | null = null;
        catchHttpError(httpErr).subscribe({ error: (e) => (result = e) });
        resolve(result);
      });

      expect(captured).not.toBeNull();
      expect(captured?.kind).toBe('forbidden');
      if (captured?.kind === 'forbidden') {
        expect(captured.code).toBe('edit_window_expired');
      }
    });

    it('detects /comments/{id} URL as edit_window_expired without a header', async () => {
      const httpErr = new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
        error: { message: 'Forbidden' },
        url: 'http://localhost:8000/api/v1/projects/1/kanban/boards/4/columns/12/cards/87/comments/311',
        headers: new HttpHeaders(),
      });

      const captured = await new Promise<ApiError | null>((resolve) => {
        let result: ApiError | null = null;
        catchHttpError(httpErr).subscribe({ error: (e) => (result = e) });
        resolve(result);
      });

      expect(captured?.kind).toBe('forbidden');
      if (captured?.kind === 'forbidden') {
        expect(captured.code).toBe('edit_window_expired');
      }
    });
  });
});
