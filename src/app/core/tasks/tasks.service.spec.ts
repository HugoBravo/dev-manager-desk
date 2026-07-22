import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { TasksApi } from './tasks.api';
import { TasksService } from './tasks.service';
import type { Task } from './task.model';

const firstTask: Task = {
  id: 2,
  project_id: 7,
  name: 'First',
  slug: 'first',
  description: null,
  status: 'open',
  archived_at: null,
  created_at: '2026-07-21T00:00:00Z',
  updated_at: '2026-07-21T00:00:00Z',
};

describe('TasksService', () => {
  const api = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: TasksApi, useValue: api }] });
  });

  it('bootstraps a project and revalidates the stored selection', async () => {
    localStorage.setItem('dev-manager-desk:task:selected', '2');
    api.list.mockReturnValue(of([firstTask]));
    const service = TestBed.inject(TasksService);

    await service.bootstrap(7);

    expect(service.tasks()).toEqual([firstTask]);
    expect(service.current()).toEqual(firstTask);
    expect(service.isBootstrapped()).toBe(true);
  });

  it('clears a stale stored selection during bootstrap', async () => {
    localStorage.setItem('dev-manager-desk:task:selected', '99');
    api.list.mockReturnValue(of([firstTask]));
    const service = TestBed.inject(TasksService);

    await service.bootstrap(7);

    expect(service.currentId()).toBeNull();
    expect(localStorage.getItem('dev-manager-desk:task:selected')).toBeNull();
  });
});
