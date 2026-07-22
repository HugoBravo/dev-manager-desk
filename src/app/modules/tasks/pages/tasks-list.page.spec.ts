import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';

import { filterTasks, TasksListPage } from './tasks-list.page';
import { TasksService } from '../../../core/tasks/tasks.service';
import { ProjectService } from '../../../core/projects/project.service';
import { API_CONFIG } from '../../../core/config/api-config';
import type { Task } from '../../../core/tasks/task.model';
import type { Project } from '../../../core/projects/project.model';
import { buildBoardRoute } from '../../kanban/utils/build-board-route';

const tasks: Task[] = [
  { id: 1, project_id: 7, name: 'Open', slug: 'open', description: null, status: 'open', archived_at: null, created_at: '', updated_at: '' },
  { id: 2, project_id: 7, name: 'Done', slug: 'done', description: null, status: 'done', archived_at: null, created_at: '', updated_at: '' },
];

const project = (id: number): Project => ({
  id,
  name: 'Demo',
  slug: 'demo',
  description: null,
  owner_id: 1,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const paginatedTasks = (data: Task[]) => ({
  data: data.map((task) => ({ data: task })),
  links: { first: '', last: '', prev: null, next: null },
  meta: { current_page: 1, from: 1, last_page: 1, per_page: 25, to: data.length, total: data.length, path: '' },
});

class FakeMatDialog {
  open = vi.fn().mockReturnValue({ afterClosed: () => ({ toPromise: () => Promise.resolve(undefined) }) });
}

describe('filterTasks', () => {
  it('returns only tasks matching the selected status', () => {
    expect(filterTasks(tasks, 'done')).toEqual([tasks[1]]);
  });

  it('returns every task for the all filter', () => {
    expect(filterTasks(tasks, 'all')).toEqual(tasks);
  });
});

async function configure(projectId = '7'): Promise<{
  component: TasksListPage;
  service: TasksService;
  projects: ProjectService;
  router: Router;
  httpMock: HttpTestingController;
}> {
  window.localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [TasksListPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { apiBaseUrl: '/api' } },
      { provide: MatDialog, useClass: FakeMatDialog },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(TasksListPage);
  fixture.componentRef.setInput('projectId', projectId);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  const requests = httpMock.match(`/api/v1/projects/${projectId}/tasks`);
  for (const req of requests) req.flush(paginatedTasks(tasks));
  return {
    component: fixture.componentInstance,
    service: TestBed.inject(TasksService),
    projects: TestBed.inject(ProjectService),
    router: TestBed.inject(Router),
    httpMock,
  };
}

describe('TasksListPage', () => {
  afterEach(() => window.localStorage.clear());

  it('navigates to the board route when a task is selected', async () => {
    const { component, router, httpMock } = await configure();
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component['select'](tasks[0]);
    expect(navSpy).toHaveBeenCalledWith(buildBoardRoute(7, 1));
    httpMock.verify();
  });

  it('revalidates the active project before navigating when the task belongs to another project', async () => {
    const { component, projects, router, httpMock } = await configure();
    const setActive = vi.spyOn(projects, 'setActive');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component['select']({ ...tasks[0], project_id: 9 });
    expect(setActive).toHaveBeenCalled();
    expect(navSpy).toHaveBeenCalledWith(buildBoardRoute(9, 1));
    httpMock.verify();
  });

  it('does not call setActive when the active project already matches the task project', async () => {
    const { component, projects, router, httpMock } = await configure();
    projects.setActive(project(7));
    const setActive = vi.spyOn(projects, 'setActive');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component['select'](tasks[0]);
    expect(setActive).not.toHaveBeenCalled();
    expect(navSpy).toHaveBeenCalledWith(buildBoardRoute(7, 1));
    httpMock.verify();
  });
});
