import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import type { ApiError } from '../../../core/errors/api-error';
import { SecretsApi } from '../api/secrets.api';
import type { Secret } from '../models/secret.model';
import { SecretsStore } from './secrets.store';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;

const secret = (overrides: Partial<Secret> = {}): Secret => ({
  id: overrides.id ?? 1,
  project_id: 7,
  key: overrides.key ?? 'API_KEY',
  value: overrides.value ?? 'plaintext',
  description: overrides.description ?? null,
  created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
  updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
});

const wrapped = (rows: Secret[]) => ({
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

describe('SecretsStore', () => {
  let store: SecretsStore;
  let httpMock: HttpTestingController;
  let api: SecretsApi;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        SecretsApi,
        SecretsStore,
      ],
    });
    store = TestBed.inject(SecretsStore);
    api = TestBed.inject(SecretsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('load()', () => {
    it('hydrates secrets + projectId and resolves with the list', async () => {
      const promise = store.load(7);
      const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/secrets`);
      expect(req.request.method).toBe('GET');
      req.flush(wrapped([secret({ id: 1 }), secret({ id: 2, key: 'OTHER' })]));
      const result = await promise;
      expect(result).toHaveLength(2);
      expect(store.secrets()).toEqual([secret({ id: 1 }), secret({ id: 2, key: 'OTHER' })]);
      expect(store.projectId()).toBe(7);
      expect(store.isListLoading()).toBe(false);
      expect(store.error()).toBeNull();
    });

    it('sets error and returns null on 404', async () => {
      const promise = store.load(99);
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/99/secrets`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
      const result = await promise;
      expect(result).toBeNull();
      const err = store.error() as ApiError;
      expect(err.kind).toBe('notFound');
      expect(store.isListLoading()).toBe(false);
      expect(store.projectId()).toBe(99);
    });

    it('toggles loading while in flight', async () => {
      const promise = store.load(7);
      expect(store.isListLoading()).toBe(true);
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/secrets`).flush(wrapped([]));
      await promise;
      expect(store.isListLoading()).toBe(false);
    });
  });

  describe('cache writer', () => {
    it('commits a list directly without re-fetching', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1 })]);
      expect(store.secrets()).toEqual([secret({ id: 1 })]);
      expect(store.projectId()).toBe(7);
      // No HTTP was issued.
      httpMock.expectNone(`${FULL_PREFIX}/projects/7/secrets`);
    });
  });

  describe('applyCreated()', () => {
    it('appends a new secret to the cache when the project matches', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1 })]);
      store.applyCreated(7, secret({ id: 2, key: 'NEW' }));
      expect(store.secrets().map((s) => s.id)).toEqual([1, 2]);
    });

    it('no-ops when the project id does not match (cross-project race)', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1 })]);
      store.applyCreated(99, secret({ id: 2, key: 'OTHER' }));
      expect(store.secrets().map((s) => s.id)).toEqual([1]);
    });

    it('falls back to applyUpdated when the same id already exists', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1, value: 'old' })]);
      store.applyCreated(7, secret({ id: 1, value: 'new' }));
      expect(store.secrets()[0].value).toBe('new');
    });
  });

  describe('applyUpdated()', () => {
    it('replaces the matching entry', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1, value: 'old' }), secret({ id: 2, value: 'x' })]);
      store.applyUpdated(7, secret({ id: 1, value: 'new' }));
      expect(store.secrets()[0].value).toBe('new');
      expect(store.secrets()[1].value).toBe('x');
    });

    it('no-ops when the project id does not match', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1 })]);
      store.applyUpdated(99, secret({ id: 1, value: 'new' }));
      expect(store.secrets()[0].value).toBe('plaintext');
    });

    it('no-ops when the id is not in the cache', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1 })]);
      store.applyUpdated(7, secret({ id: 99, value: 'new' }));
      expect(store.secrets()).toHaveLength(1);
    });
  });

  describe('applyRemoved()', () => {
    it('drops the matching secret from the cache', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1 }), secret({ id: 2 })]);
      store.applyRemoved(7, 1);
      expect(store.secrets().map((s) => s.id)).toEqual([2]);
    });

    it('is a no-op when the id is already missing', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1 })]);
      store.applyRemoved(7, 99);
      expect(store.secrets()).toHaveLength(1);
    });

    it('no-ops when the project id does not match', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1 })]);
      store.applyRemoved(99, 1);
      expect(store.secrets()).toHaveLength(1);
    });
  });

  describe('reset()', () => {
    it('clears the cache + loading flag but keeps projectId + error', () => {
      store.cache.setProjectId(7);
      store.cache.set([secret({ id: 1 })]);
      (
        store as unknown as {
          _error: { set: (v: ApiError | null) => void };
        }
      )._error.set({
        kind: 'network',
        status: 0,
        message: 'offline',
      });
      store.reset();
      expect(store.secrets()).toEqual([]);
      expect(store.projectId()).toBe(7);
      expect(store.error()).not.toBeNull();
      expect(store.loading()).toBe('idle');
    });
  });
});
