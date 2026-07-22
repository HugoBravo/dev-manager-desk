import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap, Router, type ActivatedRouteSnapshot } from '@angular/router';

import { TasksService } from '../../../core/tasks/tasks.service';
import { taskRequiredGuard } from './task-required.guard';

describe('taskRequiredGuard', () => {
  const createUrlTree = vi.fn().mockReturnValue('redirect');
  const currentId = signal<number | null>(2);

  beforeEach(() => {
    createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: TasksService, useValue: { currentId } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  });

  it('allows the selected task in the canonical chain', () => {
    const route = { paramMap: convertToParamMap({ projectId: '7', taskId: '2' }) } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() =>
      taskRequiredGuard(route, { url: '/modules/kanban/projects/7/tasks/2/boards' } as never),
    );
    expect(result).toBe(true);
  });

  it('redirects a stale task selection to the project task list', () => {
    currentId.set(9);
    const route = { paramMap: convertToParamMap({ projectId: '7', taskId: '2' }) } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => taskRequiredGuard(route, { url: '/target' } as never));
    expect(result).toBe('redirect');
    expect(createUrlTree).toHaveBeenCalledWith(['/modules/tasks/projects', 7, 'tasks'], {
      queryParams: { returnUrl: '/target' },
    });
  });
});
