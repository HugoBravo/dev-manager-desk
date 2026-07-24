import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from '../config/api-config';
import { TasksApi } from './tasks.api';

const task = {
  id: 2,
  project_id: 7,
  name: 'Ship S3',
  slug: 'ship-s3',
  description: null,
  status: 'open' as const,
  priority: 'MEDIUM' as const,
  archived_at: null,
  created_at: '2026-07-21T00:00:00Z',
  updated_at: '2026-07-21T00:00:00Z',
};

describe('TasksApi', () => {
  let api: TasksApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: '/api' } },
      ],
    });
    api = TestBed.inject(TasksApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists project tasks and unwraps paginator resources', () => {
    let result: unknown;
    api.list(7, true).subscribe((value) => (result = value));
    const request = http.expectOne('/api/v1/projects/7/tasks?include_archived=1');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [{ data: task }] });
    expect(result).toEqual([task]);
  });

  it('uses canonical project/task URLs for all mutations', () => {
    api.show(7, 2).subscribe();
    expect(http.expectOne('/api/v1/projects/7/tasks/2').request.method).toBe('GET');

    api.create(7, { name: 'New', description: null, status: 'open' }).subscribe();
    expect(http.expectOne('/api/v1/projects/7/tasks').request.method).toBe('POST');

    api.update(7, 2, { status: 'done' }).subscribe();
    expect(http.expectOne('/api/v1/projects/7/tasks/2').request.method).toBe('PATCH');

    api.archive(7, 2).subscribe();
    expect(http.expectOne('/api/v1/projects/7/tasks/2/archive').request.method).toBe('POST');

    api.restore(7, 2).subscribe();
    expect(http.expectOne('/api/v1/projects/7/tasks/2/restore').request.method).toBe('POST');
  });

  it('sends priority as uppercase on POST when the caller sets it', () => {
    api.create(7, { name: 'New', description: null, status: 'open', priority: 'high' as never }).subscribe();
    const request = http.expectOne('/api/v1/projects/7/tasks');
    expect(request.request.method).toBe('POST');
    // Wire values must be uppercase. The frontend does NOT lowercase the
    // caller input — it forwards the literal uppercase union. This test
    // documents the locked contract for any future caller that may try
    // to lowercase.
    expect(request.request.body).toEqual({ name: 'New', description: null, status: 'open', priority: 'high' });
  });

  it('omits priority on POST when the caller did not pick one (backend applies MEDIUM default)', () => {
    api.create(7, { name: 'New', description: null, status: 'open' }).subscribe();
    const request = http.expectOne('/api/v1/projects/7/tasks');
    expect(request.request.body).toEqual({ name: 'New', description: null, status: 'open' });
    expect('priority' in (request.request.body as Record<string, unknown>)).toBe(false);
  });

  it('forwards an uppercase priority on PATCH when the caller changes it', () => {
    api.update(7, 2, { priority: 'HIGH' }).subscribe();
    const request = http.expectOne('/api/v1/projects/7/tasks/2');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ priority: 'HIGH' });
  });

  it('omits priority on PATCH when the caller did not touch it (backend preserves current value)', () => {
    api.update(7, 2, { status: 'done' }).subscribe();
    const request = http.expectOne('/api/v1/projects/7/tasks/2');
    expect(request.request.body).toEqual({ status: 'done' });
    expect('priority' in (request.request.body as Record<string, unknown>)).toBe(false);
  });

  it('surfaces HTTP 422 validation errors when the backend rejects an invalid priority', () => {
    let received: unknown;
    let errored = false;
    api.update(7, 2, { priority: 'URGENT' as never }).subscribe({
      next: (value) => (received = value),
      error: () => (errored = true),
    });
    const request = http.expectOne('/api/v1/projects/7/tasks/2');
    request.flush(
      { message: 'The priority must be HIGH, MEDIUM, or LOW.', errors: { priority: ['Invalid priority.'] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(errored).toBe(true);
    expect(received).toBeUndefined();
  });
});
