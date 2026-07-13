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

  it('create() POSTs to /v1/projects, unwraps the envelope, and returns the Project', async () => {
    const projectPromise = firstValueFrom(
      api.create({ name: 'My Project', description: 'Notes here' }),
    );

    const req = httpMock.expectOne(
      (r) => r.url === `${apiBaseUrl}/v1/projects` && r.method === 'POST',
    );
    expect(req.request.body).toEqual({
      name: 'My Project',
      description: 'Notes here',
    });
    req.flush({
      data: {
        id: 42,
        name: 'My Project',
        description: 'Notes here',
        slug: 'my-project',
        archived_at: null,
        owner_id: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    });

    const created = await projectPromise;
    expect(created).toEqual({
      id: 42,
      name: 'My Project',
      description: 'Notes here',
      slug: 'my-project',
      archived_at: null,
      owner_id: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
  });

  it('create() serializes description as null when omitted', async () => {
    const projectPromise = firstValueFrom(api.create({ name: 'No Description' }));

    const req = httpMock.expectOne(
      (r) => r.url === `${apiBaseUrl}/v1/projects` && r.method === 'POST',
    );
    expect(req.request.body).toEqual({
      name: 'No Description',
      description: null,
    });
    req.flush({
      data: {
        id: 7,
        name: 'No Description',
        description: null,
        slug: 'no-description',
        archived_at: null,
        owner_id: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    });
    await projectPromise;
  });

  it('create() propagates 422 validation errors as HttpErrorResponse', async () => {
    const projectPromise = firstValueFrom(api.create({ name: '' }));

    const req = httpMock.expectOne(
      (r) => r.url === `${apiBaseUrl}/v1/projects` && r.method === 'POST',
    );
    req.flush(
      {
        message: 'The name field is required.',
        errors: { name: ['The name field is required.'] },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    await expect(projectPromise).rejects.toMatchObject({
      status: 422,
      statusText: 'Unprocessable Entity',
    });
  });

  it('create() propagates network errors (status 0)', async () => {
    const projectPromise = firstValueFrom(api.create({ name: 'Whatever' }));

    const req = httpMock.expectOne(
      (r) => r.url === `${apiBaseUrl}/v1/projects` && r.method === 'POST',
    );
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    await expect(projectPromise).rejects.toMatchObject({ status: 0 });
  });

  it('update() PATCHes /v1/projects/{id} and unwraps the envelope', async () => {
    const patched = {
      id: 7,
      name: 'Renamed',
      slug: 'renamed',
      description: 'updated',
      owner_id: 1,
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    };

    const projectPromise = firstValueFrom(
      api.update(7, { name: 'Renamed', description: 'updated' }),
    );

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${apiBaseUrl}/v1/projects/7` && r.method === 'PATCH',
    );
    expect(req.request.body).toEqual({ name: 'Renamed', description: 'updated' });
    req.flush({ data: patched });

    await expect(projectPromise).resolves.toEqual(patched);
  });

  it('archive() sends an ISO timestamp in archived_at', async () => {
    const patched = {
      id: 7,
      name: 'P',
      slug: 'p',
      description: null,
      owner_id: 1,
      archived_at: '2026-01-02T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    };

    const projectPromise = firstValueFrom(api.archive(7));

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${apiBaseUrl}/v1/projects/7` && r.method === 'PATCH',
    );
    const body = req.request.body as { archived_at: string };
    expect(typeof body.archived_at).toBe('string');
    // Sanity-check the timestamp parses as a Date.
    expect(Number.isNaN(new Date(body.archived_at).getTime())).toBe(false);
    req.flush({ data: patched });

    await expect(projectPromise).resolves.toEqual(patched);
  });

  it('unarchive() sends archived_at: null', async () => {
    const patched = {
      id: 7,
      name: 'P',
      slug: 'p',
      description: null,
      owner_id: 1,
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    };

    const projectPromise = firstValueFrom(api.unarchive(7));

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${apiBaseUrl}/v1/projects/7` && r.method === 'PATCH',
    );
    expect(req.request.body).toEqual({ archived_at: null });
    req.flush({ data: patched });

    await expect(projectPromise).resolves.toEqual(patched);
  });

  it('delete() DELETEs /v1/projects/{id} and maps 204 to void', async () => {
    const deletePromise = firstValueFrom(api.delete(7));

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${apiBaseUrl}/v1/projects/7` && r.method === 'DELETE',
    );
    req.flush(null, { status: 204, statusText: 'No Content' });

    await expect(deletePromise).resolves.toBeUndefined();
  });

  it('update() propagates 422 validation errors as HttpErrorResponse', async () => {
    const projectPromise = firstValueFrom(
      api.update(7, { name: '' }),
    );

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${apiBaseUrl}/v1/projects/7` && r.method === 'PATCH',
    );
    req.flush(
      { message: 'The name field is required.', errors: { name: ['required'] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    await expect(projectPromise).rejects.toMatchObject({ status: 422 });
  });
});