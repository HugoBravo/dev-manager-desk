import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../core/config/api-config';
import { ProjectService } from '../../../core/projects/project.service';
import { KanbanApi } from '../api/kanban.api';
import { KanbanWriteApi } from '../api/kanban-write.api';
import { BoardsStore } from '../stores/boards.store';
import { BoardTrashPage } from './board-trash.page';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;
const TASK_ID = 9;
const TRASH_URL = (projectId: number) =>
  `${FULL_PREFIX}/projects/${projectId}/tasks/${TASK_ID}/kanban/boards/trashed`;
const RESTORE_URL = (projectId: number, boardId: number) =>
  `${FULL_PREFIX}/projects/${projectId}/tasks/${TASK_ID}/kanban/boards/${boardId}/restore`;

const sampleTrashedBoard = (id: number, name: string, deletedAt: string) => ({
  id,
  task_id: TASK_ID,
  task: {
    id: TASK_ID,
    name: 'Ship S4',
    slug: 'ship-s4',
    status: 'open',
    priority: 'MEDIUM',
    archived_at: null,
  },
  name,
  position: 'n',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: deletedAt,
});

interface MountResult {
  fixture: ReturnType<typeof TestBed.createComponent<BoardTrashPage>>;
  httpMock: HttpTestingController;
  snackBar: MatSnackBar;
}

function createComponent(projectId = '7', taskId = String(TASK_ID)): MountResult {
  TestBed.resetTestingModule();
  window.localStorage.clear();
  TestBed.configureTestingModule({
    imports: [BoardTrashPage, NoopAnimationsModule, MatSnackBarModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      KanbanApi,
      KanbanWriteApi,
      BoardsStore,
      ProjectService,
    ],
  });
  // S2: BoardsStore is NOT pre-bound with setTaskId. The page must
  // derive its taskId from the route input (`setInput('taskId', ...)`
  // below) and forward it both to direct API calls and to
  // BoardsStore.setTaskId for the store's internal loadTrash call.
  const fixture = TestBed.createComponent(BoardTrashPage);
  fixture.componentRef.setInput('projectId', projectId);
  fixture.componentRef.setInput('taskId', taskId);
  fixture.detectChanges();
  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
    snackBar: TestBed.inject(MatSnackBar),
  };
}

describe('BoardTrashPage', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('loads trashed boards on init and renders them as a list', async () => {
    const { fixture, httpMock } = createComponent();

    const req = httpMock.expectOne(TRASH_URL(7));
    expect(req.request.method).toBe('GET');
    req.flush({
      data: [
        sampleTrashedBoard(1, 'Old Sprint', '2026-07-01T10:00:00.000000Z'),
        sampleTrashedBoard(2, 'Archived Sprint', '2026-07-04T10:00:00.000000Z'),
      ],
      links: { first: '', last: '', prev: null, next: null },
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        per_page: 25,
        to: 2,
        total: 2,
        path: '',
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.trash-title')?.textContent).toContain('Trash');
    expect(host.querySelectorAll('[data-testid="trash-row"]').length).toBe(2);
    expect(host.textContent).toContain('Old Sprint');
    expect(host.textContent).toContain('Archived Sprint');
    httpMock.verify();
  });

  it('renders the empty state when no trashed boards are returned', async () => {
    const { fixture, httpMock } = createComponent();

    httpMock.expectOne(TRASH_URL(7)).flush({
      data: [],
      links: { first: '', last: '', prev: null, next: null },
      meta: {
        current_page: 1,
        from: null,
        last_page: 1,
        per_page: 25,
        to: null,
        total: 0,
        path: '',
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="trash-empty"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-testid="trash-row"]').length).toBe(0);
    httpMock.verify();
  });

  it('clicking Restore calls writeApi.restoreBoard and removes the row locally', async () => {
    const { fixture, httpMock } = createComponent();

    httpMock.expectOne(TRASH_URL(7)).flush({
      data: [
        sampleTrashedBoard(1, 'Old Sprint', '2026-07-01T10:00:00.000000Z'),
        sampleTrashedBoard(2, 'Archived Sprint', '2026-07-04T10:00:00.000000Z'),
      ],
      links: { first: '', last: '', prev: null, next: null },
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        per_page: 25,
        to: 2,
        total: 2,
        path: '',
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const restoreButtons = host.querySelectorAll<HTMLButtonElement>(
      '[data-testid="restore-button"]',
    );
    expect(restoreButtons.length).toBe(2);
    // Click the first row's Restore button.
    restoreButtons[0].click();
    fixture.detectChanges();
    await fixture.whenStable();

    const restoreReq = httpMock.expectOne(RESTORE_URL(7, 1));
    expect(restoreReq.request.method).toBe('POST');
    restoreReq.flush({
      id: 1,
      task_id: TASK_ID,
      task: {
        id: TASK_ID,
        name: 'Ship S4',
        slug: 'ship-s4',
        status: 'open',
        priority: 'MEDIUM',
        archived_at: null,
      },
      name: 'Old Sprint',
      position: 'o',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-10T10:00:00Z',
      deleted_at: null,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // The first row should be gone, the second still present.
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '[data-testid="trash-row"]',
    );
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Archived Sprint');
    httpMock.verify();
  });
});
