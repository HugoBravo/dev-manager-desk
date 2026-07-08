import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import { KanbanApi } from '../api/kanban.api';
import { KanbanWriteApi } from '../api/kanban-write.api';
import type { KanbanLabel } from '../models';
import { BoardsStore } from './boards.store';
import { LabelsStore } from './labels.store';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;
const labelsBase = () => `${FULL_PREFIX}/kanban-labels`;

const sampleLabel = (id: number, name: string, color: string): KanbanLabel => ({
  id,
  name,
  color,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('LabelsStore', () => {
  let store: LabelsStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        KanbanApi,
        KanbanWriteApi,
        BoardsStore,
        LabelsStore,
      ],
    });
    store = TestBed.inject(LabelsStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('exposes initial empty state', () => {
    expect(store.labels()).toEqual([]);
    expect(store.loading()).toBe('idle');
    expect(store.error()).toBeNull();
  });

  it('load() fetches and caches the library', async () => {
    const promise = store.load();
    httpMock.expectOne(labelsBase()).flush({
      data: [{ data: sampleLabel(1, 'bug', '#ef4444') }, { data: sampleLabel(2, 'p1', '#f59e0b') }],
      links: {},
      meta: { current_page: 1, from: 1, last_page: 1, per_page: 25, to: 2, total: 2, path: '' },
    });
    const result = await promise;
    expect(result?.length).toBe(2);
    expect(store.labels().map((l) => l.id)).toEqual([1, 2]);
  });

  it('load() sets the error signal on failure and returns null', async () => {
    const promise = store.load();
    httpMock
      .expectOne(labelsBase())
      .flush({ message: 'Server down' }, { status: 500, statusText: 'Server Error' });
    const result = await promise;
    expect(result).toBeNull();
    expect(store.error()).not.toBeNull();
    expect(store.loading()).toBe('idle');
  });

  it('ensureLoaded() is a no-op when the cache is non-empty', async () => {
    store.labelsCache.set([sampleLabel(1, 'bug', '#ef4444')]);
    // Mark the store as already-loaded so ensureLoaded short-circuits
    // (in production this is set by the first successful `load()` call).
    store.__markLoadedForTests();
    await store.ensureLoaded();
    httpMock.expectNone(labelsBase());
  });

  it('ensureLoaded() fires a fetch when no load has been attempted yet', async () => {
    const promise = store.ensureLoaded();
    httpMock.expectOne(labelsBase()).flush({
      data: [],
      links: {},
      meta: {
        current_page: 1,
        from: null,
        last_page: 1,
        per_page: 25,
        to: null,
        total: 0,
        path: '',
      },
    });
    await promise;
    expect(store.labels()).toEqual([]);
  });

  it('ensureLoaded() does NOT refetch when the previous load returned an empty list', async () => {
    // First call: returns empty.
    const first = store.ensureLoaded();
    httpMock.expectOne(labelsBase()).flush({
      data: [],
      links: {},
      meta: {
        current_page: 1,
        from: null,
        last_page: 1,
        per_page: 25,
        to: null,
        total: 0,
        path: '',
      },
    });
    await first;
    // Second call: should NOT issue another GET.
    await store.ensureLoaded();
    httpMock.expectNone(labelsBase());
  });

  it('create() appends the new label and re-sorts by name', async () => {
    store.labelsCache.set([sampleLabel(2, 'zebra', '#3b82f6')]);
    const promise = store.create({ name: 'apple', color: '#10b981' });
    httpMock.expectOne(labelsBase()).flush({ data: sampleLabel(3, 'apple', '#10b981') });
    const result = await promise;
    expect(result?.id).toBe(3);
    expect(store.labels().map((l) => l.name)).toEqual(['apple', 'zebra']);
  });

  it('create() surfaces 422 errors with the validation kind', async () => {
    const promise = store.create({ name: 'duplicate', color: '#ef4444' });
    httpMock.expectOne(labelsBase()).flush(
      {
        message: 'The given data was invalid.',
        errors: { name: ['The name has already been taken.'] },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    const result = await promise;
    expect(result).toBeNull();
    expect(store.error()?.kind).toBe('validation');
  });

  it('update() patches the matching row and re-sorts by name', async () => {
    store.labelsCache.set([sampleLabel(1, 'apple', '#ef4444'), sampleLabel(2, 'zebra', '#3b82f6')]);
    const promise = store.update(2, { name: 'banana' });
    httpMock.expectOne(`${labelsBase()}/2`).flush({ data: sampleLabel(2, 'banana', '#3b82f6') });
    const result = await promise;
    expect(result?.name).toBe('banana');
    expect(store.labels().map((l) => l.name)).toEqual(['apple', 'banana']);
  });

  it('update() propagates 404 cross-user as a notFound ApiError', async () => {
    store.labelsCache.set([sampleLabel(1, 'apple', '#ef4444')]);
    const promise = store.update(1, { name: 'taken' });
    httpMock
      .expectOne(`${labelsBase()}/1`)
      .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
    const result = await promise;
    expect(result).toBeNull();
    expect(store.error()?.kind).toBe('notFound');
  });

  it('remove() drops the label from the cache', async () => {
    store.labelsCache.set([sampleLabel(1, 'apple', '#ef4444'), sampleLabel(2, 'zebra', '#3b82f6')]);
    const promise = store.remove(1);
    httpMock.expectOne(`${labelsBase()}/1`).flush(null, { status: 204, statusText: 'No Content' });
    const ok = await promise;
    expect(ok).toBe(true);
    expect(store.labels().map((l) => l.id)).toEqual([2]);
  });

  it('remove() surfaces errors and leaves the cache untouched', async () => {
    store.labelsCache.set([sampleLabel(1, 'apple', '#ef4444')]);
    const promise = store.remove(1);
    httpMock
      .expectOne(`${labelsBase()}/1`)
      .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
    const ok = await promise;
    expect(ok).toBe(false);
    expect(store.labels().map((l) => l.id)).toEqual([1]);
  });
});
