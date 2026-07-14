import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import type { ApiError } from '../../../core/errors/api-error';
import { secretsToApiError, SecretsApi } from './secrets.api';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;

const secret = (overrides: Partial<{ id: number; key: string }> = {}) => ({
  id: overrides.id ?? 1,
  project_id: 7,
  key: overrides.key ?? 'API_KEY',
  value: 'plaintext',
  description: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const wrapped = (rows: unknown[]) => ({
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
});

describe('SecretsApi', () => {
  let api: SecretsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        SecretsApi,
      ],
    });
    api = TestBed.inject(SecretsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('list()', () => {
    it('GETs /projects/{id}/secrets without page param on first page', async () => {
      const promise = api.list(7).toPromise();
      const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/secrets`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('page')).toBe(false);
      req.flush(wrapped([secret({ id: 1, key: 'API_KEY' })]));
      await expect(promise).resolves.toEqual([secret({ id: 1, key: 'API_KEY' })]);
    });

    it('appends ?page=N when page > 1', async () => {
      const promise = api.list(7, 3).toPromise();
      const req = httpMock.expectOne((r) => r.params.get('page') === '3');
      expect(req.request.url).toBe(`${FULL_PREFIX}/projects/7/secrets`);
      req.flush(wrapped([]));
      await expect(promise).resolves.toEqual([]);
    });

    it('routes 404 through the normalizer (cross-owner collapse)', async () => {
      const promise = api.list(99).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/99/secrets`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });

    it('routes 401 through the normalizer', async () => {
      const promise = api.list(7).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/secrets`)
        .flush({ message: 'unauth' }, { status: 401, statusText: 'Unauthorized' });
      await expect(promise).rejects.toMatchObject({ kind: 'unauthorized' });
    });
  });

  describe('get()', () => {
    it('GETs /secrets/{id} and unwraps the resource envelope', async () => {
      const promise = api.get(7, 42).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/secrets/42`)
        .flush({ data: secret({ id: 42 }) });
      await expect(promise).resolves.toEqual(secret({ id: 42 }));
    });
  });

  describe('create()', () => {
    it('POSTs to /secrets with description normalized to null when omitted', async () => {
      const promise = api.create(7, { key: 'NEW_KEY', value: 'plaintext' }).toPromise();
      const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/secrets`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        key: 'NEW_KEY',
        value: 'plaintext',
        description: null,
      });
      req.flush({ data: secret({ id: 11, key: 'NEW_KEY' }) });
      await expect(promise).resolves.toEqual(secret({ id: 11, key: 'NEW_KEY' }));
    });

    it('routes 422 field errors through the normalizer (W3 enforcement)', async () => {
      const promise = api.create(7, { key: 'bad spaces', value: 'v' }).toPromise();
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/secrets`).flush(
        {
          message: 'invalid',
          errors: { key: ['Key may only contain letters, digits, dots, ...'] },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await expect(promise).rejects.toMatchObject({
        kind: 'validation',
        fieldErrors: {
          key: ['Key may only contain letters, digits, dots, ...'],
        },
      });
    });

    it('routes 422 unique-key collision through the normalizer (no special UI branch)', async () => {
      const promise = api.create(7, { key: 'DUPLICATE', value: 'v' }).toPromise();
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/secrets`).flush(
        {
          message: 'Key already taken.',
          errors: { key: ['Key already taken.'] },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await expect(promise).rejects.toMatchObject({ kind: 'validation' });
    });
  });

  describe('update()', () => {
    it('PATCHes /secrets/{id} with value + description payload', async () => {
      const promise = api.update(7, 42, { value: 'new-value', description: 'notes' }).toPromise();
      const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/secrets/42`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ value: 'new-value', description: 'notes' });
      req.flush({ data: secret({ id: 42 }) });
      await expect(promise).resolves.toEqual(secret({ id: 42 }));
    });

    it('omits value when only description is provided', async () => {
      const promise = api.update(7, 42, { description: null }).toPromise();
      const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/secrets/42`);
      expect(req.request.body).toEqual({ description: null });
      expect(req.request.body).not.toHaveProperty('value');
      req.flush({ data: secret({ id: 42 }) });
      await expect(promise).resolves.toEqual(secret({ id: 42 }));
    });

    it('routes 404 through the normalizer', async () => {
      const promise = api.update(7, 42, { value: 'x' }).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/secrets/42`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });

  describe('delete()', () => {
    it('DELETEs /secrets/{id} and resolves to undefined', async () => {
      const promise = api.delete(7, 42).toPromise();
      const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/secrets/42`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await expect(promise).resolves.toBeUndefined();
    });

    it('routes 404 through the normalizer', async () => {
      const promise = api.delete(7, 42).toPromise();
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/secrets/42`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ kind: 'notFound' });
    });
  });
});

describe('secretsToApiError()', () => {
  it('returns ApiError as-is when already typed', () => {
    const err: ApiError = {
      kind: 'notFound',
      status: 404,
      message: 'gone',
    };
    expect(secretsToApiError(err)).toBe(err);
  });

  it('normalizes an HttpErrorResponse', () => {
    const httpErr = new HttpErrorResponse({
      status: 503,
      statusText: 'Service Unavailable',
      url: `${FULL_PREFIX}/projects/7/secrets`,
    });
    const result = secretsToApiError(httpErr);
    expect(result.kind).toBe('http');
    expect(result.status).toBe(503);
  });

  it('synthesizes a network error for unknown throws', () => {
    const result = secretsToApiError(new Error('boom'));
    expect(result.kind).toBe('network');
    expect(result.status).toBe(0);
  });
});
