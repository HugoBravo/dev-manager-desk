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
const API_PREFIX = '/api/v1';

const sampleProject = (overrides: Partial<Project> = {}): Project => ({
  id: 7,
  name: 'Demo',
  slug: 'demo',
  owner_id: 1,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function configure(storedId: number | null = null): {
  service: ProjectService;
  httpMock: HttpTestingController;
} {
  TestBed.resetTestingModule();
  window.localStorage.clear();
  if (storedId !== null) {
    window.localStorage.setItem('dm:selectedProjectId', String(storedId));
  }
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
  return {
    service: TestBed.inject(ProjectService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

const paginated = (data: Project[]) => ({
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
    expect(window.localStorage.getItem('dm:selectedProjectId')).toBeNull();
    expect(service.projects().map((x) => x.id)).toEqual([7]);
    httpMock.verify();
  });

  it('bootstrap() keeps a stored id when the project is present in the response', async () => {
    const { service, httpMock } = configure(7);
    const p = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(paginated([sampleProject({ id: 7 })]));
    await p;
    expect(service.currentId()).toBe(7);
    expect(service.current()?.id).toBe(7);
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

  it('setActive() persists the id to localStorage under dm:selectedProjectId', () => {
    const { service } = configure();
    service.setActive(sampleProject({ id: 11 }));
    expect(window.localStorage.getItem('dm:selectedProjectId')).toBe('11');
    expect(service.currentId()).toBe(11);
  });

  it('setActive(null) clears localStorage and the signal', () => {
    const { service } = configure();
    service.setActive(sampleProject({ id: 11 }));
    service.setActive(null);
    expect(window.localStorage.getItem('dm:selectedProjectId')).toBeNull();
    expect(service.currentId()).toBeNull();
  });
});
