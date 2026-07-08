import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';

import { API_CONFIG } from '../../../core/config/api-config';
import { ProjectService } from '../../../core/projects/project.service';
import { projectRequiredGuard, requireProjectId } from './project-required.guard';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/api/v1';
const PROJECTS_URL = `${API_BASE_URL}${API_PREFIX}/projects`;

function snapshot(id: string | null): ActivatedRouteSnapshot {
  // Minimal mock — the guard reads `paramMap.get('projectId')` only.
  const params = new Map<string, string>();
  if (id !== null) {
    params.set('projectId', id);
  }
  return {
    paramMap: {
      get: (key: string) => params.get(key) ?? null,
      has: (key: string) => params.has(key),
      getAll: (key: string) => (params.has(key) ? [params.get(key)!] : []),
      keys: Array.from(params.keys()),
    },
  } as unknown as ActivatedRouteSnapshot;
}

function state(url: string): RouterStateSnapshot {
  return { url } as RouterStateSnapshot;
}

const paginated = (data: unknown[]) => ({
  data,
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

const sampleProject = (id: number) => ({
  id,
  name: `Project ${id}`,
  slug: `project-${id}`,
  owner_id: 1,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('projectRequiredGuard', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: API_CONFIG,
          useValue: { apiBaseUrl: API_BASE_URL, apiPrefix: API_PREFIX },
        },
      ],
    });
  });

  afterEach(() => window.localStorage.clear());

  // Wraps the guard in TestBed.runInInjectionContext so `inject()` resolves
  // — functional guards rely on the call site providing an injection context.
  const runGuard = (
    route: ActivatedRouteSnapshot,
    stateSnapshot: RouterStateSnapshot,
  ) =>
    TestBed.runInInjectionContext(() =>
      projectRequiredGuard(route, stateSnapshot),
    );

  it('allows when currentId() matches the route :projectId', () => {
    const service = TestBed.inject(ProjectService);
    service.setActive({ ...sampleProject(7), id: 7 } as never);

    const result = runGuard(
      snapshot('7'),
      state('/modules/kanban/projects/7/boards'),
    );
    expect(result).toBe(true);
  });

  it('redirects to /modules/kanban/projects with returnUrl when currentId() is null', async () => {
    const service = TestBed.inject(ProjectService);
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = service.bootstrap();
    httpMock.expectOne(PROJECTS_URL).flush(paginated([]));
    await promise;

    const result = runGuard(
      snapshot('7'),
      state('/modules/kanban/projects/7/boards'),
    );

    expect(result instanceof UrlTree).toBe(true);
    if (result instanceof UrlTree) {
      expect(result.toString()).toContain('/modules/kanban/projects');
      expect(result.toString()).toContain('returnUrl=');
    }
  });

  it('redirects when currentId() differs from the route :projectId', () => {
    const service = TestBed.inject(ProjectService);
    service.setActive({ ...sampleProject(7), id: 7 } as never);

    const result = runGuard(
      snapshot('99'),
      state('/modules/kanban/projects/99/boards'),
    );

    expect(result instanceof UrlTree).toBe(true);
    if (result instanceof UrlTree) {
      expect(result.toString()).toContain('/modules/kanban/projects');
      expect(result.toString()).toContain('returnUrl=');
    }
  });

  it('redirects when the route :projectId is not a positive integer', () => {
    const service = TestBed.inject(ProjectService);
    service.setActive({ ...sampleProject(7), id: 7 } as never);

    const result = runGuard(
      snapshot('not-a-number'),
      state('/modules/kanban/projects/not-a-number/boards'),
    );

    expect(result instanceof UrlTree).toBe(true);
  });
});

describe('requireProjectId()', () => {
  it('returns the value when it is a positive integer', () => {
    expect(requireProjectId(7)).toBe(7);
  });

  it('throws a typed notFound ApiError when null', () => {
    expect(() => requireProjectId(null)).toThrowError(
      expect.objectContaining({ kind: 'notFound' }),
    );
  });

  it('throws when undefined or non-positive', () => {
    expect(() => requireProjectId(undefined)).toThrow();
    expect(() => requireProjectId(0)).toThrow();
    expect(() => requireProjectId(-3)).toThrow();
    expect(() => requireProjectId(1.5)).toThrow();
  });
});
