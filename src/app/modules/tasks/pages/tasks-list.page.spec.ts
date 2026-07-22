import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';

import { filterTasks, TasksListPage } from './tasks-list.page';
import { TasksService } from '../../../core/tasks/tasks.service';
import { ProjectService } from '../../../core/projects/project.service';
import type { Task } from '../../../core/tasks/task.model';
import { buildBoardRoute } from '../../kanban/utils/build-board-route';

const tasks: Task[] = [
  { id: 1, project_id: 7, name: 'Open', slug: 'open', description: null, status: 'open', archived_at: null, created_at: '', updated_at: '' },
  { id: 2, project_id: 7, name: 'Done', slug: 'done', description: null, status: 'done', archived_at: null, created_at: '', updated_at: '' },
];

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

describe('TasksListPage', () => {
  let component: TasksListPage;
  let service: TasksService;
  let projects: ProjectService;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TasksListPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useClass: FakeMatDialog },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TasksListPage);
    component = fixture.componentInstance;
    service = TestBed.inject(TasksService);
    projects = TestBed.inject(ProjectService);
    router = TestBed.inject(Router);
    fixture.componentRef.setInput('projectId', '7');
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw on bootstrap when api is called', async () => {
    const http = TestBed.inject(HttpTestingController);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const project = { id: 7, name: 'P', description: null, archived_at: null, created_at: '', updated_at: '' };
    projects.setActive(project as never);
    service.setActive(tasks[0]);
    component['select'](tasks[0]);
    http.expectNone(() => true);
    expect(navSpy).toHaveBeenCalledWith(buildBoardRoute(7, 1));
  });

  it('revalidates project before navigating when projectId differs', () => {
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const setActive = vi.spyOn(projects, 'setActive');
    service.setActive(tasks[0]);
    component['select']({ ...tasks[0], project_id: 9 });
    expect(setActive).toHaveBeenCalled();
    expect(navSpy).toHaveBeenCalledWith(buildBoardRoute(9, 1));
  });
});
