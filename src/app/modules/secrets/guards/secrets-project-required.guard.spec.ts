import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';

import { API_CONFIG } from '../../../core/config/api-config';
import { ProjectService } from '../../../core/projects/project.service';
import { secretsProjectRequiredGuard } from './secrets-project-required.guard';

const API_BASE_URL = 'http://localhost:8000/api';

function snapshot(id: string | null): ActivatedRouteSnapshot {
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

const sampleProject = (id: number) => ({
  id,
  name: `Project ${id}`,
  slug: `project-${id}`,
  owner_id: 1,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('secretsProjectRequiredGuard', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      ],
    });
  });

  afterEach(() => window.localStorage.clear());

  const runGuard = (route: ActivatedRouteSnapshot, stateSnapshot: RouterStateSnapshot) =>
    TestBed.runInInjectionContext(() => secretsProjectRequiredGuard(route, stateSnapshot));

  it('allows when ProjectService.currentId() matches :projectId', () => {
    const service = TestBed.inject(ProjectService);
    service.setActive({ ...sampleProject(7), id: 7 } as never);
    const result = runGuard(snapshot('7'), state('/modules/secrets/projects/7'));
    expect(result).toBe(true);
  });

  it('redirects to /modules/secrets/projects with returnUrl when currentId() is null', () => {
    const service = TestBed.inject(ProjectService);
    // No setActive; currentId() is initially null from localStorage (cleared).
    expect(service.currentId()).toBeNull();
    const result = runGuard(snapshot('7'), state('/modules/secrets/projects/7'));
    expect(result instanceof UrlTree).toBe(true);
    if (result instanceof UrlTree) {
      const serialized = result.toString();
      expect(serialized).toContain('/modules/secrets/projects');
      expect(serialized).toContain('returnUrl=');
    }
  });

  it('redirects when currentId() differs from the route :projectId', () => {
    const service = TestBed.inject(ProjectService);
    service.setActive({ ...sampleProject(7), id: 7 } as never);
    const result = runGuard(snapshot('8'), state('/modules/secrets/projects/8'));
    expect(result instanceof UrlTree).toBe(true);
  });

  it('redirects when the route :projectId is not a positive integer', () => {
    const service = TestBed.inject(ProjectService);
    service.setActive({ ...sampleProject(7), id: 7 } as never);
    const result = runGuard(snapshot('abc'), state('/modules/secrets/projects/abc'));
    expect(result instanceof UrlTree).toBe(true);
  });
});
