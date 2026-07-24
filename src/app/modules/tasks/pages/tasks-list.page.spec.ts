import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, Subject } from 'rxjs';

import { filterTasks, priorityChip, TasksListPage } from './tasks-list.page';
import { TasksService } from '../../../core/tasks/tasks.service';
import { ProjectService } from '../../../core/projects/project.service';
import { API_CONFIG } from '../../../core/config/api-config';
import type { Task, TaskPriority } from '../../../core/tasks/task.model';
import type { Project } from '../../../core/projects/project.model';
import { KanbanApi } from '../../kanban/api/kanban.api';
import type { Board } from '../../kanban/models/board.model';
import { buildBoardRoute } from '../../kanban/utils/build-board-route';
import {
  ConfirmDialog,
  type ConfirmDialogResult,
} from '../../projects/components/confirm-dialog/confirm-dialog';

const tasks: Task[] = [
  { id: 1, project_id: 7, name: 'Open', slug: 'open', description: null, status: 'open', priority: 'MEDIUM', archived_at: null, created_at: '', updated_at: '' },
  { id: 2, project_id: 7, name: 'Done', slug: 'done', description: null, status: 'done', priority: 'LOW', archived_at: null, created_at: '', updated_at: '' },
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
    expect(filterTasks(tasks, 'done', 'all')).toEqual([tasks[1]]);
  });

  it('combines status and priority filters client-side', () => {
    expect(filterTasks(tasks, 'all', 'LOW')).toEqual([tasks[1]]);
    expect(filterTasks(tasks, 'open', 'LOW')).toEqual([]);
  });

  it('returns every task when both filters are set to all', () => {
    expect(filterTasks(tasks, 'all', 'all')).toEqual(tasks);
  });
});

describe('priorityChip', () => {
  it('returns a readable label and icon for every locked priority value', () => {
    const labels: Readonly<Record<TaskPriority, string>> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
    for (const value of Object.keys(labels) as TaskPriority[]) {
      const chip = priorityChip(value);
      expect(chip.value).toBe(value);
      expect(chip.label).toBe(labels[value]);
      expect(chip.icon.length).toBeGreaterThan(0);
    }
  });

  it('covers every value of the TaskPriority union', () => {
    expect(priorityChip('HIGH').value).toBe('HIGH');
    expect(priorityChip('MEDIUM').value).toBe('MEDIUM');
    expect(priorityChip('LOW').value).toBe('LOW');
  });
});

async function configure(
  projectId = '7',
  seedTasks: readonly Task[] = tasks,
): Promise<{
  component: TasksListPage;
  fixture: ReturnType<typeof TestBed.createComponent<TasksListPage>>;
  service: TasksService;
  projects: ProjectService;
  router: Router;
  httpMock: HttpTestingController;
}> {
  window.localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [TasksListPage, MatSnackBarModule, NoopAnimationsModule],
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
  for (const req of requests) req.flush(paginatedTasks(seedTasks as Task[]));
  return {
    component: fixture.componentInstance,
    fixture,
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

  it('navigates to the board route when the Open Kanban button is clicked (click/state assertion)', async () => {
    const { fixture, router, httpMock } = await configure();
    await fixture.whenStable();
    fixture.detectChanges();
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const host = fixture.nativeElement as HTMLElement;
    const openButtons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button.mat-mdc-unelevated-button'),
    ).filter((btn) => btn.textContent?.trim() === 'Open Kanban');
    expect(openButtons).toHaveLength(tasks.length);
    openButtons[0]?.click();

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

  it('renders a priority chip per task with text label and theme-safe priority class', async () => {
    const { fixture, httpMock } = await configure();
    // The bootstrap is async (`firstValueFrom(api.list(...))`); wait for the
    // microtask to resolve and re-render before inspecting the rendered list.
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const chips = host.querySelectorAll<HTMLElement>('.task-card__priority');
    expect(chips).toHaveLength(tasks.length);
    const values = Array.from(chips).map((chip) => chip.getAttribute('data-priority'));
    expect(values).toEqual(tasks.map((task) => task.priority));
    // Pair theme-safe color treatment with visible text — never colour-only.
    for (const [index, chip] of Array.from(chips).entries()) {
      const priority = tasks[index]!.priority.toLowerCase();
      const label = chip.querySelector('.task-card__priority-label')?.textContent?.trim() ?? '';
      expect(chip.classList.contains(`task-card__priority--${priority}`)).toBe(true);
      expect(label.length).toBeGreaterThan(0);
      expect(chip.querySelector('mat-icon')).not.toBeNull();
      expect(chip.getAttribute('aria-label')).toMatch(/^Priority /);
    }
    httpMock.verify();
  });

  it('renders a segmented priority filter and applies it to the loaded list', async () => {
    const { fixture, httpMock } = await configure();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const group = host.querySelector<HTMLElement>(
      'mat-button-toggle-group[aria-label="Filter tasks by priority"]',
    );
    expect(group).not.toBeNull();
    const toggles = group?.querySelectorAll<HTMLElement>('mat-button-toggle');
    expect(toggles).toHaveLength(4);

    const lowToggle = Array.from(toggles ?? []).find(
      (toggle) => toggle.textContent?.trim() === 'Low',
    );
    lowToggle?.querySelector<HTMLButtonElement>('button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = host.querySelectorAll<HTMLElement>('.task-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.querySelector('.task-card__title')?.textContent?.trim()).toBe('Done');
    httpMock.verify();
  });

  it('filters by HIGH priority and shows only HIGH tasks', async () => {
    const allPriorityTasks: Task[] = [
      { id: 10, project_id: 7, name: 'Urgent', slug: 'urgent', description: null, status: 'open', priority: 'HIGH', archived_at: null, created_at: '', updated_at: '' },
      { id: 11, project_id: 7, name: 'Planned', slug: 'planned', description: null, status: 'open', priority: 'MEDIUM', archived_at: null, created_at: '', updated_at: '' },
      { id: 12, project_id: 7, name: 'Backlog', slug: 'backlog', description: null, status: 'open', priority: 'LOW', archived_at: null, created_at: '', updated_at: '' },
    ];
    const { fixture, httpMock } = await configure('7', allPriorityTasks);
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const group = host.querySelector<HTMLElement>(
      'mat-button-toggle-group[aria-label="Filter tasks by priority"]',
    );
    expect(group).not.toBeNull();
    const toggles = group?.querySelectorAll<HTMLElement>('mat-button-toggle') ?? [];
    expect(toggles).toHaveLength(4);

    const highToggle = Array.from(toggles).find(
      (toggle) => toggle.textContent?.trim() === 'High',
    );
    expect(highToggle).toBeDefined();
    highToggle?.querySelector<HTMLButtonElement>('button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = host.querySelectorAll<HTMLElement>('.task-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.querySelector('.task-card__title')?.textContent?.trim()).toBe('Urgent');
    httpMock.verify();
  });

  it('checks for active Kanban boards and shows confirmation before archiving', async () => {
    const { component, service, httpMock } = await configure();
    const kanbanApi = TestBed.inject(KanbanApi);
    vi.spyOn(kanbanApi, 'listBoards').mockReturnValue(
      of([{ id: 99 } as Board]),
    );
    const archiveSpy = vi.spyOn(service, 'archive').mockResolvedValue(tasks[0]!);
    const pageDialog = (component as unknown as { dialog: MatDialog }).dialog;
    const afterClosed = new Subject<ConfirmDialogResult>();
    const openSpy = vi.spyOn(pageDialog, 'open').mockReturnValue({
      afterClosed: () => afterClosed.asObservable(),
    } as unknown as ReturnType<MatDialog['open']>);

    const pendingArchive = component['archiveTask'](7, tasks[0]!);
    await Promise.resolve();

    expect(kanbanApi.listBoards).toHaveBeenCalledWith(7, 1);
    expect(openSpy).toHaveBeenCalledWith(
      ConfirmDialog,
      expect.objectContaining({
        data: expect.objectContaining({
          message:
            'This task has active Kanban boards. Archiving will leave them orphaned. Continue?',
          confirmLabel: 'Archive anyway',
        }),
      }),
    );
    expect(archiveSpy).not.toHaveBeenCalled();

    afterClosed.next({ confirmed: false });
    await pendingArchive;
    httpMock.verify();
  });

  it('archives after the active-board confirmation is accepted', async () => {
    const { component, service, httpMock } = await configure();
    const kanbanApi = TestBed.inject(KanbanApi);
    vi.spyOn(kanbanApi, 'listBoards').mockReturnValue(
      of([{ id: 99 } as Board]),
    );
    const archiveSpy = vi.spyOn(service, 'archive').mockResolvedValue(tasks[0]!);
    const pageDialog = (component as unknown as { dialog: MatDialog }).dialog;
    const afterClosed = new Subject<ConfirmDialogResult>();
    const openSpy = vi.spyOn(pageDialog, 'open').mockReturnValue({
      afterClosed: () => afterClosed.asObservable(),
    } as unknown as ReturnType<MatDialog['open']>);

    const pendingArchive = component['archiveTask'](7, tasks[0]!);
    await Promise.resolve();

    expect(openSpy).toHaveBeenCalled();
    expect(archiveSpy).not.toHaveBeenCalled();

    afterClosed.next({ confirmed: true });
    await pendingArchive;

    expect(archiveSpy).toHaveBeenCalledOnce();
    expect(archiveSpy).toHaveBeenCalledWith(7, 1);
    httpMock.verify();
  });

  it('does not archive when the active-board confirmation is cancelled', async () => {
    const { component, service, httpMock } = await configure();
    const kanbanApi = TestBed.inject(KanbanApi);
    vi.spyOn(kanbanApi, 'listBoards').mockReturnValue(
      of([{ id: 99 } as Board]),
    );
    const archiveSpy = vi.spyOn(service, 'archive').mockResolvedValue(tasks[0]!);
    const pageDialog = (component as unknown as { dialog: MatDialog }).dialog;
    vi.spyOn(pageDialog, 'open').mockReturnValue({
      afterClosed: () => of({ confirmed: false }),
    } as unknown as ReturnType<MatDialog['open']>);

    await component['archiveTask'](7, tasks[0]!);

    expect(archiveSpy).not.toHaveBeenCalled();
    httpMock.verify();
  });

  it('archives directly without confirmation when the task has no active boards', async () => {
    const { component, service, httpMock } = await configure();
    const kanbanApi = TestBed.inject(KanbanApi);
    vi.spyOn(kanbanApi, 'listBoards').mockReturnValue(of([]));
    const archiveSpy = vi.spyOn(service, 'archive').mockResolvedValue(tasks[0]!);
    const pageDialog = (component as unknown as { dialog: MatDialog }).dialog;
    const openSpy = vi.spyOn(pageDialog, 'open');

    await component['archiveTask'](7, tasks[0]!);

    expect(kanbanApi.listBoards).toHaveBeenCalledWith(7, 1);
    expect(openSpy).not.toHaveBeenCalled();
    expect(archiveSpy).toHaveBeenCalledOnce();
    expect(archiveSpy).toHaveBeenCalledWith(7, 1);
    httpMock.verify();
  });

  it('surfaces a 409 task_has_active_boards archive failure as a friendly snackbar', async () => {
    // Strategy: use the existing `configure()` helper so the page,
    // FakeMatDialog, and HTTP bootstrap are wired the same way as the
    // other tests. Then we mock TasksService.archive directly via a
    // spy so the page receives a typed 409 ApiError without needing to
    // drive the dialog or HTTP archive POST.
    //
    // IMPORTANT: The page imports `MatDialogModule` in its `imports`
    // array, which provides `MatDialog` at the module level — that
    // shadows the test bed's `useClass: FakeMatDialog`. So we grab the
    // page's actual `MatDialog` instance and mock `.open` on it.
    const harness = await configure();
    const service = harness.service;
    const kanbanApi = TestBed.inject(KanbanApi);
    vi.spyOn(kanbanApi, 'listBoards').mockReturnValue(of([]));
    const typedApiError = {
      kind: 'conflict' as const,
      status: 409,
      code: 'task_has_active_boards' as const,
      message: 'Task 1 cannot be archived while it contains active boards.',
    };
    vi.spyOn(service, 'archive').mockImplementation(async () => {
      throw typedApiError;
    });
    const snackBar = TestBed.inject(MatSnackBar);
    const snackSpy = vi.spyOn(snackBar, 'open');

    // The page's `MatDialog` is the one provided by `MatDialogModule`
    // (imported by the page), not the test bed's FakeMatDialog. We
    // mock `.open` on the page's instance so the dialog "closes" with
    // the `archived` action and the page's promise chain runs.
    const component = harness.component;
    const pageDialog = (component as unknown as { dialog: MatDialog }).dialog;
    vi.spyOn(pageDialog, 'open').mockReturnValue({
      afterClosed: () => of({ action: 'archived' as const }),
    } as unknown as ReturnType<MatDialog['open']>);

    component['openEditor'](tasks[0]);
    await harness.fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    harness.fixture.detectChanges();

    // The page must surface a snackbar with a friendly message — NOT
    // let the raw 409 bubble to the console.
    expect(snackSpy).toHaveBeenCalled();
    const [message] = snackSpy.mock.calls[0] ?? [];
    expect(typeof message).toBe('string');
    expect(message as string).toContain('active Kanban board');
    harness.httpMock.verify();
  });
});
