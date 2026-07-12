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
});