import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import { UsersApi, UsersHttpError } from './users.api';
import type { User } from '../models/user.model';

const API_BASE_URL = 'http://localhost:8000/api';
const FULL_URL = `${API_BASE_URL}/v1/users`;

const user = (overrides: Partial<User> = {}): User => ({
  id: overrides.id ?? 1,
  name: overrides.name ?? 'Jane',
  email: overrides.email ?? 'jane@example.com',
  email_verified_at: overrides.email_verified_at ?? null,
  is_admin: overrides.is_admin ?? false,
  created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
  updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
});

const wrapped = (rows: User[]) => ({
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

const item = (row: User) => ({ data: row });

describe('UsersApi', () => {
  let api: UsersApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        UsersApi,
      ],
    });
    api = TestBed.inject(UsersApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('list()', () => {
    it('GETs /users without page param on first page', async () => {
      const promise = api.list();
      const req = httpMock.expectOne(FULL_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('page')).toBe(false);
      req.flush(wrapped([user({ id: 1 }), user({ id: 2 })]));
      await expect(promise).resolves.toEqual([user({ id: 1 }), user({ id: 2 })]);
    });

    it('appends ?page=N when page > 1', async () => {
      const promise = api.list(3);
      const req = httpMock.expectOne((r) => r.params.get('page') === '3');
      expect(req.request.url).toBe(FULL_URL);
      req.flush(wrapped([]));
      await expect(promise).resolves.toEqual([]);
    });

    it('throws UsersHttpError wrapping the normalised 422 (admin gate)', async () => {
      const promise = api.list();
      httpMock
        .expectOne(FULL_URL)
        .flush({ message: 'forbidden', errors: {} }, { status: 403, statusText: 'Forbidden' });
      await expect(promise).rejects.toBeInstanceOf(UsersHttpError);
    });
  });

  describe('get()', () => {
    it('GETs /users/{id}', async () => {
      const promise = api.get(42);
      const req = httpMock.expectOne(`${FULL_URL}/42`);
      expect(req.request.method).toBe('GET');
      req.flush(item(user({ id: 42, email: 'target@example.com' })));
      await expect(promise).resolves.toEqual(user({ id: 42, email: 'target@example.com' }));
    });
  });

  describe('create()', () => {
    it('POSTs is_admin:false when payload omits the flag', async () => {
      const promise = api.create({
        name: 'New',
        email: 'new@example.com',
        password: 'password123',
      });
      const req = httpMock.expectOne(FULL_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        name: 'New',
        email: 'new@example.com',
        password: 'password123',
        is_admin: false,
      });
      req.flush(item(user({ id: 11, email: 'new@example.com' })));
      await expect(promise).resolves.toEqual(user({ id: 11, email: 'new@example.com' }));
    });
  });

  describe('update()', () => {
    it('omits fields that are not provided', async () => {
      const promise = api.update(7, { name: 'Renamed' });
      const req = httpMock.expectOne(`${FULL_URL}/7`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Renamed' });
      req.flush(item(user({ id: 7, name: 'Renamed' })));
      await expect(promise).resolves.toEqual(user({ id: 7, name: 'Renamed' }));
    });

    it('sends every provided field including is_admin', async () => {
      const promise = api.update(7, {
        name: 'A',
        email: 'a@example.com',
        is_admin: true,
        password: 'pw1234567',
      });
      const req = httpMock.expectOne(`${FULL_URL}/7`);
      expect(req.request.body).toEqual({
        name: 'A',
        email: 'a@example.com',
        is_admin: true,
        password: 'pw1234567',
      });
      req.flush(item(user({ id: 7 })));
      await promise;
    });
  });

  describe('delete()', () => {
    it('DELETEs /users/{id} and resolves to undefined on 204', async () => {
      const promise = api.delete(7);
      const req = httpMock.expectOne(`${FULL_URL}/7`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await expect(promise).resolves.toBeUndefined();
    });
  });

  it('returns a UsersHttpError with kind:"validation" on 422', async () => {
    const promise = api.get(1);
    httpMock
      .expectOne(`${FULL_URL}/1`)
      .flush({ message: 'invalid', errors: { email: ['taken'] } }, { status: 422, statusText: '' });
    await expect(promise).rejects.toMatchObject({ apiError: { kind: 'validation' } });
  });
});
