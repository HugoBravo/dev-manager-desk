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
});
