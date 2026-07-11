import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import type { ApiError } from '../../../core/errors/api-error';
import { KanbanWriteApi } from './kanban-write.api';

const API_BASE_URL = 'http://localhost:8000/api';
// `apiBaseUrl` already ends in `/api`, so the v1 prefix is `/v1`.
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;

const cardsBase = (projectId: number, boardId: number, columnId: number) =>
  `${FULL_PREFIX}/projects/${projectId}/kanban/boards/${boardId}/columns/${columnId}/cards`;

const sampleCard = (id = 87) => ({
  id,
  column_id: 12,
  title: `Card ${id}`,
  body: null,
  due_date: null,
  archived_at: null,
  position: 'k',
  labels: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('KanbanWriteApi', () => {
  let api: KanbanWriteApi;
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
        KanbanWriteApi,
      ],
    });
    api = TestBed.inject(KanbanWriteApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('createCard()', () => {
    it('POSTs to /columns/{c}/cards and returns the new card with server position', async () => {
      const promise = api.createCard(7, 4, 12, { title: 'New card', body: '## Hello' }).toPromise();
      const req = httpMock.expectOne(cardsBase(7, 4, 12));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ title: 'New card', body: '## Hello' });
      req.flush(sampleCard(101));
      await expect(promise).resolves.toEqual(sampleCard(101));
    });

    it('routes 422 field errors through the normalizer (W3 enforcement)', async () => {
      const promise = api.createCard(7, 4, 12, { title: '' }).toPromise();
      httpMock.expectOne(cardsBase(7, 4, 12)).flush(
        {
          message: 'The given data was invalid.',
          errors: { title: ['The title field is required.'] },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await expect(promise).rejects.toMatchObject({
        kind: 'validation',
        fieldErrors: { title: ['The title field is required.'] },
      });
    });
  });

  describe('updateCard()', () => {
    it('PATCHes /cards/{card} with the partial payload', async () => {
      const promise = api.updateCard(7, 4, 12, 87, { title: 'Renamed' }).toPromise();
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ title: 'Renamed' });
      req.flush({ ...sampleCard(), title: 'Renamed' });
      await expect(promise).resolves.toMatchObject({ title: 'Renamed' });
    });
  });

  describe('moveCard()', () => {
    it('POSTs /cards/{card}/move with to_column_id and returns server position', async () => {
      const promise = api.moveCard(7, 4, 12, 87, { to_column_id: 15 }).toPromise();
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/move`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ to_column_id: 15 });
      req.flush({ ...sampleCard(), column_id: 15, position: 'z' });
      await expect(promise).resolves.toMatchObject({
        column_id: 15,
        position: 'z',
      });
    });

    it('routes 422 position_exhausted through the normalizer with code', async () => {
      const promise = api.moveCard(7, 4, 12, 87, { to_column_id: 15 }).toPromise();
      httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/move`).flush(
        {
          message: 'Server ran out of room to position items.',
          errors: {},
          code: 'position_exhausted',
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      const captured = (await promise.catch((e: ApiError) => e)) as ApiError;
      expect(captured.kind).toBe('validation');
      if (captured.kind === 'validation') {
        expect(captured.code).toBe('position_exhausted');
      }
    });

    it('does NOT mutate local state — caller must await the response', async () => {
      // Structural assertion: the API returns an Observable, not a Promise
      // with a pre-resolved value. The caller cannot read `position` until
      // the HTTP response lands.
      let resolved = false;
      const result = api.moveCard(7, 4, 12, 87, { to_column_id: 15 });
      // Subscribe first so HttpClient issues the request.
      const subscription = result.subscribe(() => {
        resolved = true;
      });
      // Drain the request — the position is the server's, not a local guess.
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/move`);
      req.flush({ ...sampleCard(), position: 'z' });

      expect(resolved).toBe(true);
      // Touch `subscription` to silence noUnusedLocals if it ever flags.
      void subscription;
    });
  });

  describe('archiveCard() / restoreCard()', () => {
    it('archiveCard POSTs /cards/{card}/archive', async () => {
      const promise = api.archiveCard(7, 4, 12, 87).toPromise();
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/archive`);
      expect(req.request.method).toBe('POST');
      req.flush({ ...sampleCard(), archived_at: '2026-07-07T15:42:18.000000Z' });
      await expect(promise).resolves.toMatchObject({ archived_at: expect.any(String) });
    });

    it('restoreCard POSTs /cards/{card}/restore', async () => {
      const promise = api.restoreCard(7, 4, 12, 87).toPromise();
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/restore`);
      expect(req.request.method).toBe('POST');
      req.flush({ ...sampleCard(), archived_at: null });
      await expect(promise).resolves.toMatchObject({ archived_at: null });
    });
  });

  describe('deleteCard()', () => {
    it('DELETEs /cards/{card} and returns void on 204', async () => {
      const promise = api.deleteCard(7, 4, 12, 87).toPromise();
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await expect(promise).resolves.toBeUndefined();
    });

    it('routes 404 through the normalizer (existence-leak prevention)', async () => {
      const promise = api.deleteCard(7, 4, 12, 87).toPromise();
      httpMock
        .expectOne(`${cardsBase(7, 4, 12)}/87`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });

  describe('label CRUD', () => {
    const sampleLabel = (id = 4) => ({
      id,
      name: 'bug',
      color: '#ef4444',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    it('createLabel POSTs to /kanban-labels', async () => {
      const promise = api.createLabel({ name: 'bug', color: '#ef4444' }).toPromise();
      const req = httpMock.expectOne(`${FULL_PREFIX}/kanban-labels`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'bug', color: '#ef4444' });
      req.flush(sampleLabel(4));
      await expect(promise).resolves.toEqual(sampleLabel(4));
    });

    it('createLabel routes 422 duplicate-name through the normalizer with fieldErrors', async () => {
      const promise = api.createLabel({ name: 'bug', color: '#ef4444' }).toPromise();
      httpMock.expectOne(`${FULL_PREFIX}/kanban-labels`).flush(
        {
          message: 'The given data was invalid.',
          errors: { name: ['The name has already been taken.'] },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await expect(promise).rejects.toMatchObject({
        kind: 'validation',
        fieldErrors: { name: ['The name has already been taken.'] },
      });
    });

    it('updateLabel PATCHes /kanban-labels/{id} with the partial payload', async () => {
      const promise = api.updateLabel(4, { color: '#10b981' }).toPromise();
      const req = httpMock.expectOne(`${FULL_PREFIX}/kanban-labels/4`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ color: '#10b981' });
      req.flush({ ...sampleLabel(4), color: '#10b981' });
      await expect(promise).resolves.toMatchObject({ color: '#10b981' });
    });

    it('updateLabel routes 404 cross-user through the normalizer', async () => {
      const promise = api.updateLabel(4, { name: 'taken' }).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/kanban-labels/4`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });

    it('deleteLabel DELETEs /kanban-labels/{id} and returns void on 204', async () => {
      const promise = api.deleteLabel(4).toPromise();
      const req = httpMock.expectOne(`${FULL_PREFIX}/kanban-labels/4`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('syncCardLabels()', () => {
    it('PUTs /cards/{card}/labels with label_ids and returns the updated card', async () => {
      const promise = api.syncCardLabels(7, 4, 12, 87, [4, 7]).toPromise();
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/labels`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ label_ids: [4, 7] });
      req.flush({
        ...sampleCard(),
        labels: [
          { id: 4, name: 'bug', color: '#ef4444', created_at: 'x', updated_at: 'x' },
          { id: 7, name: 'p1', color: '#f59e0b', created_at: 'x', updated_at: 'x' },
        ],
      });
      const result = await promise;
      expect(result?.labels.length).toBe(2);
      expect(result?.labels.map((l) => l.id)).toEqual([4, 7]);
    });

    it('sends an empty array when labelIds is empty (clears the card)', async () => {
      const promise = api.syncCardLabels(7, 4, 12, 87, []).toPromise();
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/labels`);
      expect(req.request.body).toEqual({ label_ids: [] });
      req.flush({ ...sampleCard(), labels: [] });
      await expect(promise).resolves.toMatchObject({ labels: [] });
    });

    it('routes 422 cross-user label id through the normalizer with fieldErrors', async () => {
      const promise = api.syncCardLabels(7, 4, 12, 87, [4, 999]).toPromise();
      httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/labels`).flush(
        {
          message: 'The given data was invalid.',
          errors: { 'label_ids.1': ['The selected label_ids.1 is invalid.'] },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await expect(promise).rejects.toMatchObject({
        kind: 'validation',
        fieldErrors: { 'label_ids.1': ['The selected label_ids.1 is invalid.'] },
      });
    });
  });

  describe('column CRUD', () => {
    const sampleColumn = (id = 21) => ({
      id,
      board_id: 4,
      name: `Column ${id}`,
      position: 'a',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const columnsBase = (projectId: number, boardId: number) =>
      `${FULL_PREFIX}/projects/${projectId}/kanban/boards/${boardId}/columns`;

    it('createColumn POSTs /columns with { name } and returns the new column', async () => {
      const promise = api.createColumn(7, 4, { name: 'Backlog' }).toPromise();
      const req = httpMock.expectOne(columnsBase(7, 4));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Backlog' });
      req.flush(sampleColumn(21));
      await expect(promise).resolves.toEqual(sampleColumn(21));
    });

    it('updateColumn PATCHes /columns/{c} with the partial body (rename)', async () => {
      const promise = api.updateColumn(7, 4, 21, { name: 'Renamed' }).toPromise();
      const req = httpMock.expectOne(`${columnsBase(7, 4)}/21`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Renamed' });
      req.flush({ ...sampleColumn(21), name: 'Renamed' });
      await expect(promise).resolves.toMatchObject({ name: 'Renamed' });
    });

    it('updateColumn PATCHes /columns/{c} with archived_at: null for unarchive', async () => {
      const promise = api.updateColumn(7, 4, 21, { archived_at: null }).toPromise();
      const req = httpMock.expectOne(`${columnsBase(7, 4)}/21`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ archived_at: null });
      req.flush({ ...sampleColumn(21), archived_at: null });
      await expect(promise).resolves.toMatchObject({ archived_at: null });
    });

    it('updateColumn routes 409 column_has_contents through the normalizer', async () => {
      const promise = api
        .updateColumn(7, 4, 21, { archived_at: '2026-07-07T00:00:00Z' })
        .toPromise();
      httpMock.expectOne(`${columnsBase(7, 4)}/21`).flush(
        {
          message: 'Cannot archive a column that still has cards.',
          code: 'column_has_contents',
          column_id: 21,
        },
        { status: 409, statusText: 'Conflict' },
      );
      const captured = (await promise.catch((e: ApiError) => e)) as ApiError;
      expect(captured.kind).toBe('conflict');
      if (captured.kind === 'conflict') {
        expect(captured.code).toBe('column_has_contents');
      }
    });

    it('deleteColumn DELETEs /columns/{c} and returns void on 204', async () => {
      const promise = api.deleteColumn(7, 4, 21).toPromise();
      const req = httpMock.expectOne(`${columnsBase(7, 4)}/21`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await expect(promise).resolves.toBeUndefined();
    });

    it('deleteColumn routes 409 column_has_contents through the normalizer', async () => {
      const promise = api.deleteColumn(7, 4, 21).toPromise();
      httpMock.expectOne(`${columnsBase(7, 4)}/21`).flush(
        {
          message: 'This column still has cards.',
          code: 'column_has_contents',
          column_id: 21,
        },
        { status: 409, statusText: 'Conflict' },
      );
      const captured = (await promise.catch((e: ApiError) => e)) as ApiError;
      expect(captured.kind).toBe('conflict');
      if (captured.kind === 'conflict') {
        expect(captured.code).toBe('column_has_contents');
      }
    });

    it('reorderColumns POSTs /columns/reorder with { ordered_ids } and unwraps the result', async () => {
      const promise = api.reorderColumns(7, 4, [21, 15, 12]).toPromise();
      const req = httpMock.expectOne(`${columnsBase(7, 4)}/reorder`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ordered_ids: [21, 15, 12] });
      req.flush({ reordered: 3 });
      await expect(promise).resolves.toEqual({ reordered: 3 });
    });

    it('reorderColumns spreads a readonly array into the request body', async () => {
      // `readonly number[]` survives the `let ordered_ids = [...orderedIds]`
      // step (no mutation) — confirm the wire shape matches what the
      // backend expects (NOT `Object`).
      const ids = Object.freeze([21, 15, 12]) as readonly number[];
      const promise = api.reorderColumns(7, 4, ids).toPromise();
      const req = httpMock.expectOne(`${columnsBase(7, 4)}/reorder`);
      expect(req.request.body).toEqual({ ordered_ids: [21, 15, 12] });
      req.flush({ reordered: 3 });
      await expect(promise).resolves.toEqual({ reordered: 3 });
    });

    it('moveColumn POSTs /columns/{c}/move with { to_board_id } and returns the column', async () => {
      const promise = api.moveColumn(7, 4, 21, 9).toPromise();
      const req = httpMock.expectOne(`${columnsBase(7, 4)}/21/move`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ to_board_id: 9 });
      const moved = { ...sampleColumn(21), board_id: 9 };
      req.flush(moved);
      await expect(promise).resolves.toEqual(moved);
    });
  });

  describe('board CRUD', () => {
    const sampleBoard = (id = 4) => ({
      id,
      project_id: 7,
      name: `Board ${id}`,
      position: 'n',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const boardsBase = (projectId: number) => `${FULL_PREFIX}/projects/${projectId}/kanban/boards`;

    describe('createBoard()', () => {
      it('POSTs /projects/{p}/kanban/boards with { name } and returns the new board', async () => {
        const promise = api.createBoard(7, { name: 'Sprint 42' }).toPromise();
        const req = httpMock.expectOne(boardsBase(7));
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ name: 'Sprint 42' });
        req.flush(sampleBoard(42));
        await expect(promise).resolves.toEqual(sampleBoard(42));
      });

      it('routes 422 name_taken through the normalizer with fieldErrors', async () => {
        const promise = api.createBoard(7, { name: 'taken' }).toPromise();
        httpMock.expectOne(boardsBase(7)).flush(
          {
            message: 'A board with this name already exists in this project.',
            errors: { name: ['A board with this name already exists in this project.'] },
          },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
        await expect(promise).rejects.toMatchObject({
          kind: 'validation',
          fieldErrors: {
            name: ['A board with this name already exists in this project.'],
          },
        });
      });

      it('routes 401 unauth through the normalizer', async () => {
        const promise = api.createBoard(7, { name: 'Sprint 42' }).toPromise();
        httpMock
          .expectOne(boardsBase(7))
          .flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });
        await expect(promise).rejects.toMatchObject({ kind: 'unauthorized' });
      });
    });

    describe('updateBoard()', () => {
      it('PATCHes /boards/{id} with the partial payload', async () => {
        const promise = api.updateBoard(7, 4, { name: 'Renamed' }).toPromise();
        const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`);
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body).toEqual({ name: 'Renamed' });
        req.flush({ ...sampleBoard(4), name: 'Renamed' });
        await expect(promise).resolves.toMatchObject({ name: 'Renamed' });
      });

      it('routes 404 cross-owner through the normalizer (existence-leak guard)', async () => {
        const promise = api.updateBoard(7, 4, { name: 'Renamed' }).toPromise();
        httpMock
          .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`)
          .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
        await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
      });

      it('routes 422 name_taken on rename through the normalizer', async () => {
        const promise = api.updateBoard(7, 4, { name: 'taken' }).toPromise();
        httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`).flush(
          {
            message: 'A board with this name already exists.',
            errors: { name: ['A board with this name already exists.'] },
          },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
        await expect(promise).rejects.toMatchObject({
          kind: 'validation',
          fieldErrors: { name: ['A board with this name already exists.'] },
        });
      });
    });

    describe('deleteBoard()', () => {
      it('DELETEs /boards/{id} and returns void on 204', async () => {
        const promise = api.deleteBoard(7, 4).toPromise();
        const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`);
        expect(req.request.method).toBe('DELETE');
        req.flush(null, { status: 204, statusText: 'No Content' });
        await expect(promise).resolves.toBeUndefined();
      });

      it('routes 409 board_has_contents through the normalizer with code', async () => {
        const promise = api.deleteBoard(7, 4).toPromise();
        httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`).flush(
          {
            message: 'This board still has columns.',
            code: 'board_has_contents',
            board_id: 4,
          },
          { status: 409, statusText: 'Conflict' },
        );
        const captured = (await promise.catch((e: ApiError) => e)) as ApiError;
        expect(captured.kind).toBe('conflict');
        if (captured.kind === 'conflict') {
          expect(captured.code).toBe('board_has_contents');
        }
      });

      it('routes 404 cross-owner through the normalizer', async () => {
        const promise = api.deleteBoard(7, 4).toPromise();
        httpMock
          .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`)
          .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
        await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
      });
    });

    describe('restoreBoard()', () => {
      it('POSTs /boards/{id}/restore and returns the restored board', async () => {
        const promise = api.restoreBoard(7, 4).toPromise();
        const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/restore`);
        expect(req.request.method).toBe('POST');
        req.flush({ ...sampleBoard(4), name: 'Restored' });
        await expect(promise).resolves.toMatchObject({ name: 'Restored' });
      });

      it('routes 422 not_trashed through the normalizer as validation', async () => {
        const promise = api.restoreBoard(7, 4).toPromise();
        httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/restore`).flush(
          {
            message: 'Board is not in trash.',
            errors: {},
          },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
        await expect(promise).rejects.toMatchObject({ kind: 'validation' });
      });
    });

    describe('cloneBoard()', () => {
      it('POSTs /boards/{id}/clone with no body and returns the new board', async () => {
        const promise = api.cloneBoard(7, 4).toPromise();
        const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/clone`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({});
        req.flush({ ...sampleBoard(99), name: 'Board 4 (Copy)' });
        await expect(promise).resolves.toMatchObject({ id: 99, name: 'Board 4 (Copy)' });
      });

      it('POSTs /boards/{id}/clone with { name } when provided', async () => {
        const promise = api.cloneBoard(7, 4, { name: 'Q3 Sprint' }).toPromise();
        const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/clone`);
        expect(req.request.body).toEqual({ name: 'Q3 Sprint' });
        req.flush({ ...sampleBoard(99), name: 'Q3 Sprint' });
        await expect(promise).resolves.toMatchObject({ name: 'Q3 Sprint' });
      });

      it('routes 404 cross-owner / trashed source through the normalizer', async () => {
        const promise = api.cloneBoard(7, 4).toPromise();
        httpMock
          .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/clone`)
          .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
        await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
      });
    });

    describe('bulkDeleteBoards()', () => {
      it('POSTs /boards/bulk-delete with { ids } and unwraps the result envelope', async () => {
        const promise = api.bulkDeleteBoards([1, 2, 3]).toPromise();
        const req = httpMock.expectOne(`${FULL_PREFIX}/boards/bulk-delete`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ ids: [1, 2, 3] });
        req.flush({
          data: {
            results: [
              { id: 1, status: 204 },
              { id: 2, status: 204 },
              { id: 3, status: 409, error: { code: 'board_has_contents' } },
            ],
            summary: { total: 3, ok: 2, failed: 1 },
          },
        });
        const result = await promise;
        expect(result).toEqual({
          results: [
            { id: 1, status: 204 },
            { id: 2, status: 204 },
            { id: 3, status: 409, error: { code: 'board_has_contents' } },
          ],
          summary: { total: 3, ok: 2, failed: 1 },
        });
      });

      it('routes 422 max_100 through the normalizer with fieldErrors', async () => {
        const ids = Array.from({ length: 101 }, (_, i) => i + 1);
        const promise = api.bulkDeleteBoards(ids).toPromise();
        httpMock.expectOne(`${FULL_PREFIX}/boards/bulk-delete`).flush(
          {
            message: 'Too many ids.',
            errors: { ids: ['The ids may not have more than 100 items.'] },
          },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
        await expect(promise).rejects.toMatchObject({
          kind: 'validation',
          fieldErrors: { ids: ['The ids may not have more than 100 items.'] },
        });
      });
    });

    describe('bulkRenameBoards()', () => {
      it('POSTs /boards/bulk-rename with { ids, prefix, mode } and unwraps the result', async () => {
        const promise = api.bulkRenameBoards([1, 2], 'v2-', 'add').toPromise();
        const req = httpMock.expectOne(`${FULL_PREFIX}/boards/bulk-rename`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ ids: [1, 2], prefix: 'v2-', mode: 'add' });
        req.flush({
          data: {
            results: [
              { id: 1, status: 200 },
              { id: 2, status: 200 },
            ],
            summary: { total: 2, ok: 2, failed: 0 },
          },
        });
        const result = await promise;
        expect(result).toEqual({
          results: [
            { id: 1, status: 200 },
            { id: 2, status: 200 },
          ],
          summary: { total: 2, ok: 2, failed: 0 },
        });
      });

      it('routes 401 unauth through the normalizer', async () => {
        const promise = api.bulkRenameBoards([1], 'x', 'add').toPromise();
        httpMock
          .expectOne(`${FULL_PREFIX}/boards/bulk-rename`)
          .flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });
        await expect(promise).rejects.toMatchObject({ kind: 'unauthorized' });
      });
    });
  });
});
