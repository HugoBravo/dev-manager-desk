import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import type { User } from '../models/user.model';
import { UsersApi, UsersHttpError } from '../api/users.api';
import { UsersStore } from './users.store';

const API_BASE_URL = 'http://localhost:8000/api';
const FULL_URL = `${API_BASE_URL}/v1/users`;

const user = (overrides: Partial<User> = {}): User => ({
  id: overrides.id ?? 1,
  name: overrides.name ?? 'Jane',
  email: overrides.email ?? 'jane@example.com',
  email_verified_at: null,
  is_admin: overrides.is_admin ?? false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('UsersStore', () => {
  let store: UsersStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        UsersApi,
        UsersStore,
      ],
    });
    store = TestBed.inject(UsersStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('load() hydrates the cache with the API response', async () => {
    const promise = store.load();
    const req = httpMock.expectOne(FULL_URL);
    req.flush({
      data: [user({ id: 1 }), user({ id: 2 })].map((u) => ({ data: u })),
      links: { first: '', last: '', prev: null, next: null },
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        per_page: 25,
        to: 2,
        total: 2,
        path: '',
      },
    });
    const result = await promise;
    expect(result).toHaveLength(2);
    expect(store.users()).toEqual([user({ id: 1 }), user({ id: 2 })]);
    expect(store.isEmpty()).toBe(false);
    expect(store.isListLoading()).toBe(false);
  });

  it('load() surfaces a UsersHttpError.apiError through store.error()', async () => {
    const promise = store.load();
    httpMock
      .expectOne(FULL_URL)
      .flush({ message: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    const result = await promise;
    expect(result).toBeNull();
    const err = store.error();
    expect(err).not.toBeNull();
  });

  it('create() appends the server-returned user', async () => {
    const promise = store.create({
      name: 'New',
      email: 'new@example.com',
      password: 'password123',
    });
    const req = httpMock.expectOne(FULL_URL);
    req.flush({ data: user({ id: 9, email: 'new@example.com' }) });
    const created = await promise;
    expect(created?.id).toBe(9);
    expect(store.users().map((u) => u.id)).toContain(9);
  });

  it('update() replaces the matching row', async () => {
    store.cache.set([user({ id: 1 }), user({ id: 2 })]);
    const promise = store.update(2, { name: 'Renamed' });
    const req = httpMock.expectOne(`${FULL_URL}/2`);
    req.flush({ data: user({ id: 2, name: 'Renamed' }) });
    await promise;
    expect(store.users().find((u) => u.id === 2)?.name).toBe('Renamed');
  });

  it('delete() removes the matching row', async () => {
    store.cache.set([user({ id: 1 }), user({ id: 2 })]);
    const promise = store.delete(1);
    const req = httpMock.expectOne(`${FULL_URL}/1`);
    req.flush(null, { status: 204, statusText: 'No Content' });
    const ok = await promise;
    expect(ok).toBe(true);
    expect(store.users().map((u) => u.id)).toEqual([2]);
  });

  it('create() returns null and sets store.error when the backend rejects', async () => {
    const promise = store.create({
      name: 'X',
      email: 'x@example.com',
      password: 'password123',
    });
    httpMock
      .expectOne(FULL_URL)
      .flush({ message: 'taken', errors: { email: ['taken'] } }, { status: 422, statusText: '' });
    const created = await promise;
    expect(created).toBeNull();
    expect(store.error()).not.toBeNull();
  });
});
