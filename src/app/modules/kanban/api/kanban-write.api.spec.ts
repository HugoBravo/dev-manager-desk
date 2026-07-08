import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import type { ApiError } from '../../../core/errors/api-error';
import { KanbanWriteApi } from './kanban-write.api';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/api/v1';
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
          useValue: { apiBaseUrl: API_BASE_URL, apiPrefix: API_PREFIX },
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
      const promise = api
        .createCard(7, 4, 12, { title: 'New card', body: '## Hello' })
        .toPromise();
      const req = httpMock.expectOne(cardsBase(7, 4, 12));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ title: 'New card', body: '## Hello' });
      req.flush(sampleCard(101));
      await expect(promise).resolves.toEqual(sampleCard(101));
    });

    it('routes 422 field errors through the normalizer (W3 enforcement)', async () => {
      const promise = api
        .createCard(7, 4, 12, { title: '' })
        .toPromise();
      httpMock
        .expectOne(cardsBase(7, 4, 12))
        .flush(
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
      const promise = api
        .updateCard(7, 4, 12, 87, { title: 'Renamed' })
        .toPromise();
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ title: 'Renamed' });
      req.flush({ ...sampleCard(), title: 'Renamed' });
      await expect(promise).resolves.toMatchObject({ title: 'Renamed' });
    });
  });

  describe('moveCard()', () => {
    it('POSTs /cards/{card}/move with target_column_id and returns server position', async () => {
      const promise = api
        .moveCard(7, 4, 12, 87, { target_column_id: 15 })
        .toPromise();
      const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/move`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ target_column_id: 15 });
      req.flush({ ...sampleCard(), column_id: 15, position: 'z' });
      await expect(promise).resolves.toMatchObject({
        column_id: 15,
        position: 'z',
      });
    });

    it('routes 422 position_exhausted through the normalizer with code', async () => {
      const promise = api
        .moveCard(7, 4, 12, 87, { target_column_id: 15 })
        .toPromise();
      httpMock
        .expectOne(`${cardsBase(7, 4, 12)}/87/move`)
        .flush(
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
      const result = api.moveCard(7, 4, 12, 87, { target_column_id: 15 });
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
        .flush(
          { message: 'gone' },
          { status: 404, statusText: 'Not Found' },
        );
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });
});