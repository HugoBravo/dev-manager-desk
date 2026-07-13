import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { API_CONFIG } from '../config/api-config';
import { ProjectService } from './project.service';
import type { Project } from './project.model';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const STORAGE_KEY = 'dev-manager-desk:project:selected';
const LEGACY_STORAGE_KEY = 'dm:selectedProjectId';

const sampleProject = (overrides: Partial<Project> = {}): Project => ({
  id: 7,
  name: 'Demo',
  slug: 'demo',
  description: null,
  owner_id: 1,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function configure(storedId: number | null = null, legacyId: number | null = null): {
  service: ProjectService;
  httpMock: HttpTestingController;
} {
  TestBed.resetTestingModule();
  window.localStorage.clear();
  if (legacyId !== null) {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, String(legacyId));
  } else if (storedId !== null) {
    window.localStorage.setItem(STORAGE_KEY, String(storedId));
  }
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: API_CONFIG,
        useValue: { apiBaseUrl: API_BASE_URL },
      },
    ],
  });
  return {
    service: TestBed.inject(ProjectService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

const paginated = (data: Project[]) => ({
  // Laravel paginator wraps each resource in its own `{ data: Project }`
  // envelope (JsonResource default), so the outer `data` is an array of
  // wrappers, not of bare projects. Matches the real API shape.
  data: data.map((project) => ({ data: project })),
  links: { first: '', last: '', prev: null, next: null },
  meta: {
    current_page: 1,
    from: 1,
    last_page: 1,
    per_page: 25,
    to: data.length,
    total: data.length,
    path: '',
  },
});

const projectsUrl = `${API_BASE_URL}${API_PREFIX}/projects`;

describe('ProjectService', () => {
  afterEach(() => window.localStorage.clear());

  it('bootstrap() clears stale localStorage id when the project is missing from the server response', async () => {
    const { service, httpMock } = configure(42);
    const p = service.bootstrap();
    const req = httpMock.expectOne(projectsUrl);
    expect(req.request.params.get('include_archived')).toBeNull();
    req.flush(paginated([sampleProject({ id: 7 })]));
    await p;
    expect(service.currentId()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(service.projects().map((x) => x.id)).toEqual([7]);
    expect(service.bootstrapError()).toBeNull();
    httpMock.verify();
  });

  it('bootstrap() keeps a stored id when the project is present in the response', async () => {
    const { service, httpMock } = configure(7);
    const p = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(paginated([sampleProject({ id: 7 })]));
    await p;
    expect(service.currentId()).toBe(7);
    expect(service.current()?.id).toBe(7);
    expect(service.bootstrapError()).toBeNull();
    httpMock.verify();
  });

  it('bootstrap() silently drops archived projects from the visible list', async () => {
    const { service, httpMock } = configure();
    const p = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([
        sampleProject({ id: 7 }),
        sampleProject({ id: 8, archived_at: '2026-01-01T00:00:00Z' }),
      ]),
    );
    await p;
    expect(service.projects().map((x) => x.id)).toEqual([7]);
    httpMock.verify();
  });

  it('setActive() persists the id to localStorage under dev-manager-desk:project:selected', () => {
    const { service } = configure();
    service.setActive(sampleProject({ id: 11 }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('11');
    expect(service.currentId()).toBe(11);
  });

  it('setActive(null) clears localStorage and the signal', () => {
    const { service } = configure();
    service.setActive(sampleProject({ id: 11 }));
    service.setActive(null);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(service.currentId()).toBeNull();
  });

  // -------- C1: bootstrap() preserves stored id on network failure --------

  it('bootstrap() preserves stored id AND sets bootstrapError when fetch fails', async () => {
    // Spec F3 + scenario 4: a network blip must NOT log the user out of
    // their project. The toolbar can show `bootstrapError()` as a
    // non-blocking warning.
    const { service, httpMock } = configure(7);
    const p = service.bootstrap();
    const req = httpMock.expectOne(projectsUrl);
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await p;

    expect(service.currentId()).toBe(7);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7');
    expect(service.bootstrapError()).not.toBeNull();
    expect(service.bootstrapError()?.kind).toBe('network');
    expect(service.isBootstrapped()).toBe(true);
    httpMock.verify();
  });

  it('bootstrap() preserves stored id AND sets bootstrapError on 5xx', async () => {
    // Same as above but for a server-side outage: the user keeps their
    // last-known selection; bootstrapError surfaces the http kind.
    const { service, httpMock } = configure(7);
    const p = service.bootstrap();
    const req = httpMock.expectOne(projectsUrl);
    req.flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    await p;

    expect(service.currentId()).toBe(7);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7');
    expect(service.bootstrapError()?.kind).toBe('http');
    expect(service.isBootstrapped()).toBe(true);
    httpMock.verify();
  });

  it('bootstrap() with no stored id and network failure leaves current null and surfaces bootstrapError', async () => {
    // First-run scenario + offline: current stays null (nothing to
    // preserve), but bootstrapError is set so the toolbar can warn.
    const { service, httpMock } = configure();
    const p = service.bootstrap();
    const req = httpMock.expectOne(projectsUrl);
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await p;

    expect(service.currentId()).toBeNull();
    expect(service.bootstrapError()?.kind).toBe('network');
    expect(service.isBootstrapped()).toBe(true);
    httpMock.verify();
  });

  it('bootstrap() clears stored id when fetch succeeds but id is missing from response', async () => {
    // Server confirms the project is gone — clear it (this is the
    // original stale-id behavior, still required for correctness).
    const { service, httpMock } = configure(42);
    const p = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(paginated([sampleProject({ id: 7 })]));
    await p;

    expect(service.currentId()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(service.bootstrapError()).toBeNull();
    httpMock.verify();
  });

  it('bootstrap() sets current from response when stored id is present', async () => {
    // End-to-end success path: the response's project object becomes
    // `current()`, not just the id.
    const { service, httpMock } = configure(7);
    const p = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(paginated([sampleProject({ id: 7, name: 'Demo 7' })]));
    await p;

    expect(service.currentId()).toBe(7);
    expect(service.current()?.name).toBe('Demo 7');
    expect(service.bootstrapError()).toBeNull();
    httpMock.verify();
  });

  // -------- W2: storage key migration --------

  it('readStoredId() migrates the legacy `dm:selectedProjectId` key at construction', async () => {
    // Pre-upgrade browsers had `dm:selectedProjectId`; the service's
    // constructor migrates it to `dev-manager-desk:project:selected` so
    // users are NOT logged out after the upgrade. Migration runs in
    // readStoredId() — which the constructor invokes to seed the signal
    // — so by the time TestBed.inject() returns, the legacy key is gone.
    const { service, httpMock } = configure(undefined, 7);

    // Post-construction assertion: legacy key was consumed, new key holds the id.
    expect(service.currentId()).toBe(7);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7');
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();

    // And bootstrap() still works (server confirms id 7).
    const p = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(paginated([sampleProject({ id: 7 })]));
    await p;
    expect(service.currentId()).toBe(7);
    httpMock.verify();
  });

  it('setActive() writes under dev-manager-desk:project:selected (NOT the legacy key)', () => {
    const { service } = configure();
    service.setActive(sampleProject({ id: 11 }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('11');
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  // -------- C3: create() happy + error paths --------

  it('create() prepends the new project to the list and sets it active', async () => {
    const { service, httpMock } = configure();
    // Seed with an existing project so we can verify prepend.
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(paginated([sampleProject({ id: 1, name: 'Existing' })]));
    await bootstrapPromise;

    const created = sampleProject({ id: 2, name: 'Fresh', description: 'Notes' });
    const createPromise = service.create({ name: 'Fresh', description: 'Notes' });

    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Fresh', description: 'Notes' });
    req.flush({ data: created });

    const result = await createPromise;
    expect(result).toEqual(created);
    // New project is at the head of the list.
    expect(service.projects().map((p) => p.id)).toEqual([2, 1]);
    // `current` follows the new project + localStorage updated.
    expect(service.currentId()).toBe(2);
    expect(service.current()?.name).toBe('Fresh');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('2');
    httpMock.verify();
  });

  it('create() leaves _projects and current unchanged when the API errors', async () => {
    const { service, httpMock } = configure();
    // Seed with an existing project; bootstrap returns one row.
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(paginated([sampleProject({ id: 1, name: 'Existing' })]));
    await bootstrapPromise;
    expect(service.projects().map((p) => p.id)).toEqual([1]);

    const createPromise = service.create({ name: 'Will Fail' });
    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects`);
    req.flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });

    await expect(createPromise).rejects.toMatchObject({ status: 503 });
    // No mutation of the list.
    expect(service.projects().map((p) => p.id)).toEqual([1]);
    // No mutation of the active id.
    expect(service.currentId()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    httpMock.verify();
  });

  // -------- WU-4: update / archive / unarchive / delete --------

  it('update() optimistically merges the patch and replaces with the server response on success', async () => {
    const { service, httpMock } = configure();
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 1, name: 'Old', description: null })]),
    );
    await bootstrapPromise;

    const patched = sampleProject({ id: 1, name: 'New', description: 'Notes' });
    const updatePromise = service.update(1, { name: 'New', description: 'Notes' });

    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'New', description: 'Notes' });
    req.flush({ data: patched });

    const result = await updatePromise;
    expect(result).toEqual(patched);
    expect(service.projects()[0]).toEqual(patched);
    httpMock.verify();
  });

  it('update() rolls back the optimistic merge on server error', async () => {
    const { service, httpMock } = configure();
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 1, name: 'Old', description: null })]),
    );
    await bootstrapPromise;

    const updatePromise = service.update(1, { name: 'New' });

    // Optimistic state visible BEFORE the response.
    expect(service.projects()[0].name).toBe('New');

    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/1`);
    req.flush(
      { message: 'invalid' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    await expect(updatePromise).rejects.toMatchObject({ status: 422 });
    expect(service.projects()[0].name).toBe('Old');
    httpMock.verify();
  });

  it('update() removes the row from the visible list on 404', async () => {
    const { service, httpMock } = configure();
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([
        sampleProject({ id: 1, name: 'A' }),
        sampleProject({ id: 2, name: 'B' }),
      ]),
    );
    await bootstrapPromise;

    const updatePromise = service.update(2, { name: 'X' });
    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/2`);
    req.flush(
      { message: 'gone' },
      { status: 404, statusText: 'Not Found' },
    );

    await expect(updatePromise).rejects.toMatchObject({ status: 404 });
    expect(service.projects().map((p) => p.id)).toEqual([1]);
    httpMock.verify();
  });

  it('archive() optimistically removes the row from the list on success', async () => {
    const { service, httpMock } = configure();
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([
        sampleProject({ id: 1, name: 'A' }),
        sampleProject({ id: 2, name: 'B' }),
      ]),
    );
    await bootstrapPromise;

    const archived = sampleProject({
      id: 2,
      name: 'B',
      archived_at: '2026-01-02T00:00:00Z',
    });
    const archivePromise = service.archive(2);

    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/2`);
    expect(req.request.method).toBe('PATCH');
    expect((req.request.body as { archived_at: string }).archived_at).toBeTruthy();
    req.flush({ data: archived });

    const result = await archivePromise;
    expect(result).toEqual(archived);
    expect(service.projects().map((p) => p.id)).toEqual([1]);
    httpMock.verify();
  });

  it('archive() of the ACTIVE project does NOT clear the active id (REQ-2.5)', async () => {
    // REQ-2.5: archived projects are still selectable for read-only
    // views, so archiving the toolbar's active project must keep the
    // selection valid. The service only clears the active id when the
    // project is DELETED, not when it's archived.
    const { service, httpMock } = configure(1);
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([
        sampleProject({ id: 1, name: 'Active' }),
        sampleProject({ id: 2, name: 'Other' }),
      ]),
    );
    await bootstrapPromise;

    const archived = sampleProject({
      id: 1,
      name: 'Active',
      archived_at: '2026-01-02T00:00:00Z',
    });
    const archivePromise = service.archive(1);

    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/1`);
    req.flush({ data: archived });

    await archivePromise;

    expect(service.currentId()).toBe(1);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
    httpMock.verify();
  });

  it('unarchive() of the ACTIVE archived project keeps the active id valid (REQ-3.2)', async () => {
    // REQ-3.2: an unarchived project that happens to be the toolbar
    // selection must keep that selection valid.
    const { service, httpMock } = configure(7);
    const bootstrapPromise = service.bootstrap();
    // bootstrap filters archived, so seed the active id 7 as if it
    // were not archived yet.
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 7, name: 'A' })]),
    );
    await bootstrapPromise;

    const restored = sampleProject({ id: 7, name: 'A', archived_at: null });
    const unarchivePromise = service.unarchive(7);
    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/7`);
    req.flush({ data: restored });

    await unarchivePromise;

    expect(service.currentId()).toBe(7);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7');
    httpMock.verify();
  });

  it('archive() rolls back the optimistic remove on server error', async () => {
    const { service, httpMock } = configure();
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([
        sampleProject({ id: 1, name: 'A' }),
        sampleProject({ id: 2, name: 'B' }),
      ]),
    );
    await bootstrapPromise;

    const archivePromise = service.archive(2);
    // Row removed optimistically.
    expect(service.projects().map((p) => p.id)).toEqual([1]);

    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/2`);
    req.flush(
      { message: 'down' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    await expect(archivePromise).rejects.toMatchObject({ status: 503 });
    expect(service.projects().map((p) => p.id)).toEqual([1, 2]);
    httpMock.verify();
  });

  it('unarchive() prepends the server-truth project to the list on success', async () => {
    const { service, httpMock } = configure();
    const bootstrapPromise = service.bootstrap();
    // bootstrap() does NOT include archived, so the seed list has only one row.
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 1, name: 'A' })]),
    );
    await bootstrapPromise;

    const restored = sampleProject({
      id: 99,
      name: 'Restored',
      archived_at: null,
    });
    const unarchivePromise = service.unarchive(99);

    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/99`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ archived_at: null });
    req.flush({ data: restored });

    await expect(unarchivePromise).resolves.toEqual(restored);
    expect(service.projects().map((p) => p.id)).toEqual([99, 1]);
    httpMock.verify();
  });

  it('unarchive() on server error leaves the visible list untouched (REQ-3.3)', async () => {
    // REQ-3.3: a 5xx on unarchive must NOT corrupt the list. The card
    // stays in the archived section because unarchive has no
    // optimistic mutation — it only prepends on success.
    const { service, httpMock } = configure();
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 1, name: 'A' })]),
    );
    await bootstrapPromise;
    const before = service.projects().map((p) => p.id);

    const unarchivePromise = service.unarchive(42);
    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/42`);
    req.flush(
      { message: 'down' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    await expect(unarchivePromise).rejects.toMatchObject({ status: 503 });
    expect(service.projects().map((p) => p.id)).toEqual(before);
    httpMock.verify();
  });

  it('delete() removes the row after 204 and clears the active id when it matched', async () => {
    const { service, httpMock } = configure(7);
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 7, name: 'To delete' })]),
    );
    await bootstrapPromise;

    expect(service.currentId()).toBe(7);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7');

    const deletePromise = service.delete(7);

    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    await deletePromise;

    expect(service.projects().map((p) => p.id)).toEqual([]);
    expect(service.currentId()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    httpMock.verify();
  });

  it('delete() leaves the row in the list when the server errors', async () => {
    const { service, httpMock } = configure();
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 1, name: 'A' })]),
    );
    await bootstrapPromise;

    const deletePromise = service.delete(1);
    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/1`);
    req.flush(
      { message: 'down' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    await expect(deletePromise).rejects.toMatchObject({ status: 503 });
    expect(service.projects().map((p) => p.id)).toEqual([1]);
    httpMock.verify();
  });

  it('delete() does NOT clear the active id when the deleted project is not the active one', async () => {
    const { service, httpMock } = configure(1);
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([
        sampleProject({ id: 1, name: 'Active' }),
        sampleProject({ id: 2, name: 'Other' }),
      ]),
    );
    await bootstrapPromise;

    const deletePromise = service.delete(2);
    const req = httpMock.expectOne(`${API_BASE_URL}${API_PREFIX}/projects/2`);
    req.flush(null, { status: 204, statusText: 'No Content' });

    await deletePromise;

    expect(service.projects().map((p) => p.id)).toEqual([1]);
    expect(service.currentId()).toBe(1);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
    httpMock.verify();
  });

  // -------- WU-4: includeArchived + toggleArchived --------

  it('includeArchived defaults to false', () => {
    const { service } = configure();
    expect(service.includeArchived()).toBe(false);
  });

  it('toggleArchived() flips the flag and re-fetches with include_archived=1', async () => {
    const { service, httpMock } = configure();
    // Seed with one project so toggleArchived sees a starting list.
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 1, name: 'A' })]),
    );
    await bootstrapPromise;

    const togglePromise = service.toggleArchived();

    const req = httpMock.expectOne(
      (r) =>
        r.url === projectsUrl &&
        r.params.get('include_archived') === '1',
    );
    req.flush(
      paginated([
        sampleProject({ id: 1, name: 'A' }),
        sampleProject({ id: 2, name: 'B', archived_at: '2026-01-02T00:00:00Z' }),
      ]),
    );
    await togglePromise;

    expect(service.includeArchived()).toBe(true);
    expect(service.projects().map((p) => p.id).sort()).toEqual([1, 2]);
    httpMock.verify();
  });

  it('toggleArchived() preserves the stored id when the project is still in the response', async () => {
    const { service, httpMock } = configure(7);
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 7, name: 'A' })]),
    );
    await bootstrapPromise;

    const togglePromise = service.toggleArchived();
    httpMock
      .expectOne(
        (r) =>
          r.url === projectsUrl &&
          r.params.get('include_archived') === '1',
      )
      .flush(
        paginated([
          sampleProject({ id: 7, name: 'A' }),
          sampleProject({ id: 8, name: 'B', archived_at: '2026-01-02T00:00:00Z' }),
        ]),
      );
    await togglePromise;

    expect(service.currentId()).toBe(7);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7');
    httpMock.verify();
  });

  it('toggleArchived() clears the stored id when the project is gone from the response', async () => {
    const { service, httpMock } = configure(42);
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 1, name: 'A' })]),
    );
    await bootstrapPromise;
    expect(service.currentId()).toBeNull();

    const togglePromise = service.toggleArchived();
    httpMock
      .expectOne(
        (r) =>
          r.url === projectsUrl &&
          r.params.get('include_archived') === '1',
      )
      .flush(paginated([sampleProject({ id: 1, name: 'A' })]));
    await togglePromise;

    expect(service.currentId()).toBeNull();
    httpMock.verify();
  });

  it('toggleArchived() surfaces a network failure via bootstrapError without throwing', async () => {
    const { service, httpMock } = configure();
    const bootstrapPromise = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([sampleProject({ id: 1, name: 'A' })]),
    );
    await bootstrapPromise;

    const togglePromise = service.toggleArchived();

    const req = httpMock.expectOne(
      (r) =>
        r.url === projectsUrl &&
        r.params.get('include_archived') === '1',
    );
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    await expect(togglePromise).resolves.toBeUndefined();
    expect(service.bootstrapError()?.kind).toBe('network');
    expect(service.includeArchived()).toBe(true); // flag still flipped — UI can re-try
    expect(service.projects().map((p) => p.id)).toEqual([1]); // previous list preserved
    httpMock.verify();
  });
});