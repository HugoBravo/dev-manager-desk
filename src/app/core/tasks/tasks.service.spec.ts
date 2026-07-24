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
  priority: 'MEDIUM',
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

  it('propagates the priority from create() and update() payloads through to the wire', async () => {
    const created: Task = { ...firstTask, id: 10, name: 'Hot', priority: 'HIGH' };
    api.create.mockReturnValue(of(created));
    api.update.mockReturnValue(of({ ...created, priority: 'LOW' }));
    const service = TestBed.inject(TasksService);

    await service.bootstrap(7);
    const result = await service.create(7, { name: 'Hot', description: null, status: 'open', priority: 'HIGH' });
    expect(result.priority).toBe('HIGH');
    expect(api.create).toHaveBeenCalledWith(7, expect.objectContaining({ priority: 'HIGH' }));
    expect(service.tasks().some((task) => task.id === 10 && task.priority === 'HIGH')).toBe(true);

    const updated = await service.update(7, 10, { priority: 'LOW' });
    expect(updated.priority).toBe('LOW');
    expect(api.update).toHaveBeenCalledWith(7, 10, { priority: 'LOW' });
    expect(service.tasks().find((task) => task.id === 10)?.priority).toBe('LOW');
  });

  it('allows create() to omit priority and update() to preserve it', async () => {
    const created: Task = { ...firstTask, id: 11, priority: 'MEDIUM' };
    api.create.mockReturnValue(of(created));
    const service = TestBed.inject(TasksService);
    await service.bootstrap(7);
    const result = await service.create(7, { name: 'Default', description: null, status: 'open' });
    expect(result.priority).toBe('MEDIUM');
    expect(api.create).toHaveBeenCalledWith(7, { name: 'Default', description: null, status: 'open' });
  });
});
