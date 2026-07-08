import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_CONFIG } from '../config/api-config';
import { ProjectsApi } from './projects.api';

describe('ProjectsApi', () => {
  let api: ProjectsApi;
  let httpMock: HttpTestingController;
  const apiBaseUrl = 'http://localhost:8000/api';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl } },
        ProjectsApi,
      ],
    });
    api = TestBed.inject(ProjectsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('unwraps the Laravel per-resource data envelope from list()', async () => {
    const projectsPromise = firstValueFrom(api.list());

    const req = httpMock.expectOne(
      (r) => r.url === `${apiBaseUrl}/v1/projects`,
    );
    expect(req.request.method).toBe('GET');
    // Match the real Laravel paginator + JsonResource shape:
    //   { data: [{ data: { ... } }], links: {...}, meta: {...} }
    req.flush({
      data: [
        {
          data: {
            id: 1,
            name: 'Demo Kanban Project',
            description: 'A pre-populated kanban project for the dev-manager demo.',
            slug: 'demo-kanban-project',
            archived_at: null,
            owner_id: 1,
            created_at: '2026-07-08T01:18:28+00:00',
            updated_at: '2026-07-08T01:20:54+00:00',
          },
        },
      ],
      links: {
        first: 'http://localhost:8000/api/v1/projects?page=1',
        last: 'http://localhost:8000/api/v1/projects?page=1',
        prev: null,
        next: null,
      },
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        per_page: 25,
        to: 1,
        total: 1,
        path: 'http://localhost:8000/api/v1/projects',
      },
    });

    const projects = await projectsPromise;
    expect(projects).toEqual([
      {
        id: 1,
        name: 'Demo Kanban Project',
        description: 'A pre-populated kanban project for the dev-manager demo.',
        slug: 'demo-kanban-project',
        archived_at: null,
        owner_id: 1,
        created_at: '2026-07-08T01:18:28+00:00',
        updated_at: '2026-07-08T01:20:54+00:00',
      },
    ]);
  });

  it('returns [] when the envelope has no projects', async () => {
    const projectsPromise = firstValueFrom(api.list());
    const req = httpMock.expectOne((r) => r.url === `${apiBaseUrl}/v1/projects`);
    req.flush({ data: [], links: {}, meta: {} });
    const projects = await projectsPromise;
    expect(projects).toEqual([]);
  });

  it('appends include_archived=1 when requested', async () => {
    const projectsPromise = firstValueFrom(api.list(true));
    const req = httpMock.expectOne(
      (r) =>
        r.url === `${apiBaseUrl}/v1/projects` &&
        r.params.get('include_archived') === '1',
    );
    expect(req.request.params.get('include_archived')).toBe('1');
    req.flush({ data: [] });
    await projectsPromise;
  });

  it('does not append include_archived by default', async () => {
    const projectsPromise = firstValueFrom(api.list());
    const req = httpMock.expectOne((r) => r.url === `${apiBaseUrl}/v1/projects`);
    expect(req.request.params.has('include_archived')).toBe(false);
    req.flush({ data: [] });
    await projectsPromise;
  });
});