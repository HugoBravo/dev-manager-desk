import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';

import { API_CONFIG } from '../../../core/config/api-config';
import { ProjectService } from '../../../core/projects/project.service';
import { KanbanApi } from '../api/kanban.api';
import { KanbanWriteApi } from '../api/kanban-write.api';
import { BoardsStore } from '../stores/boards.store';
import { BoardsListPage } from './boards-list.page';
import type {
  BoardEditorDialogData,
  BoardEditorDialogResult,
} from '../components/board-editor-dialog/board-editor-dialog';
import { BoardEditorDialog } from '../components/board-editor-dialog/board-editor-dialog';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;
const TASK_ID = 9;
const BOARDS_URL = (projectId: number) =>
  `${FULL_PREFIX}/projects/${projectId}/tasks/${TASK_ID}/kanban/boards`;

const paginated = <T>(data: T[]) => ({
  data,
  links: { first: '', last: '', prev: null, next: null },
  meta: {
    current_page: 1,
    from: 1,
    last_page: 1,
    per_page: 25,
    to: data.length,
    total: data.length,
    path: '',
  },
});

const sampleBoard = (id: number, name: string) => ({
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
});

function createComponent(projectId = '7', taskId = String(TASK_ID)) {
  const fixture = TestBed.createComponent(BoardsListPage);
  // Provide the required inputs via the binding the router uses.
  // S2: taskId now flows from the route, not from BoardsStore.setTaskId.
  fixture.componentRef.setInput('projectId', projectId);
  fixture.componentRef.setInput('taskId', taskId);
  fixture.detectChanges();
  return fixture;
}

describe('BoardsListPage', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;
  let promptSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
    // jsdom doesn't implement window.confirm/window.prompt; mock them.
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('v2-');
    await TestBed.configureTestingModule({
      imports: [BoardsListPage, NoopAnimationsModule, MatDialogModule, MatSnackBarModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: API_CONFIG,
          useValue: { apiBaseUrl: API_BASE_URL },
        },
        KanbanApi,
        KanbanWriteApi,
        BoardsStore,
      ],
    }).compileComponents();
    // Silence snackbar dialogs in tests.
    TestBed.inject(MatSnackBar);
    // S2: BoardsStore is NOT pre-bound with setTaskId. The page must
    // derive its taskId from the route input (`setInput('taskId', ...)`
    // inside `createComponent`) and forward it both to direct API calls
    // and to BoardsStore.setTaskId for the store's internal loads.
  });

  afterEach(() => window.localStorage.clear());

  it('renders the loading state until the response lands', () => {
    const fixture = createComponent();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('mat-progress-spinner')).not.toBeNull();
  });

  it('renders the boards list on success', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush(paginated([sampleBoard(1, 'Sprint 42'), sampleBoard(2, 'Sprint 43')]));
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.boards-title')?.textContent).toContain('Boards');
    expect(host.querySelectorAll('.board-card').length).toBe(2);
  });

  it('renders the empty state when no boards are returned', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(BOARDS_URL(7)).flush(paginated([]));
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.state-empty')).not.toBeNull();
    expect(host.querySelector('.state-empty')?.textContent).toContain('No boards yet');
  });

  it('renders the error state when the API fails', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Not found');
  });

  it('reloads when Retry is clicked', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush({ message: 'gone' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    await fixture.whenStable();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[mat-stroked-button]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock.expectOne(BOARDS_URL(7)).flush(paginated([sampleBoard(1, 'Retry')]));
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.board-card').length).toBe(1);
    expect(httpMock.expectNone.bind(httpMock)).toBeDefined();
  });

  // --- Batch 6 — Task 2.7 ---

  it('renders a Create board button in the header', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush(paginated([sampleBoard(1, 'Sprint 42'), sampleBoard(2, 'Sprint 43')]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const createBtn = host.querySelector<HTMLButtonElement>('[data-testid="create-board-button"]');
    expect(createBtn).not.toBeNull();
    expect(createBtn?.textContent).toContain('Create board');
    expect(createBtn?.querySelector('mat-icon')?.textContent).toContain('add');
  });

  it('clicking Create opens BoardEditorDialog in create mode', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(BOARDS_URL(7)).flush(paginated([sampleBoard(1, 'Sprint 42')]));
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = TestBed.inject(MatDialog);
    const openSpy = vi.spyOn(dialog, 'open');

    const createBtn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="create-board-button"]',
    )!;
    createBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(openSpy).toHaveBeenCalled();
    const boardDialogCall = openSpy.mock.calls.find((call) => call[0] === BoardEditorDialog);
    expect(boardDialogCall).toBeDefined();
    const data = boardDialogCall![1]?.data as BoardEditorDialogData;
    expect(data.mode).toBe('create');
    expect(data.projectId).toBe(7);
    // S4: dialog data carries taskId so the editor can thread it into
    // the canonical URL chain without reading it from BoardsStore.
    expect(data.taskId).toBe(TASK_ID);
  });

  it('submitting create calls writeApi.createBoard and navigates to new board', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(BOARDS_URL(7)).flush(paginated([sampleBoard(1, 'Sprint 42')]));
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = TestBed.inject(MatDialog);
    const dialogRef: Partial<MatDialogRef<unknown, unknown>> = {
      afterClosed: () => of({ action: 'saved', name: 'Sprint 99' } as BoardEditorDialogResult),
      close: () => undefined,
    };
    vi.spyOn(dialog, 'open').mockReturnValue(dialogRef as MatDialogRef<unknown, unknown>);

    const writeApi = TestBed.inject(KanbanWriteApi);
    const createSpy = vi.spyOn(writeApi, 'createBoard');

    const router = (
      fixture.componentInstance as unknown as {
        router: { navigate: (cmds: unknown[]) => Promise<boolean> };
      }
    ).router;
    const navSpy = vi.spyOn(router, 'navigate');

    const createBtn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="create-board-button"]',
    )!;
    createBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    // Allow the async dialog subscribe to drain.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(createSpy).toHaveBeenCalledWith(7, 9, { name: 'Sprint 99' });

    const createReq = httpMock.expectOne(BOARDS_URL(7));
    expect(createReq.request.method).toBe('POST');
    expect(createReq.request.body).toEqual({ name: 'Sprint 99' });
    createReq.flush({ data: sampleBoard(99, 'Sprint 99') });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navSpy).toHaveBeenCalledWith([
      '/modules/kanban/projects',
      7,
      'tasks',
      9,
      'boards',
      99,
    ]);
  });

  it('per-card menu has Rename and Delete items', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush(paginated([sampleBoard(1, 'Sprint 42'), sampleBoard(2, 'Sprint 43')]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const menuTriggers = host.querySelectorAll('[data-testid="board-menu-trigger"]');
    expect(menuTriggers.length).toBe(2);
    // Open the first card's menu and look in the document overlay portal.
    (menuTriggers[0] as HTMLElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const renameItem = document.body.querySelector('[data-testid="board-menu-rename"]');
    const deleteItem = document.body.querySelector('[data-testid="board-menu-delete"]');
    expect(renameItem).not.toBeNull();
    expect(deleteItem).not.toBeNull();
  });

  it('clicking Rename opens dialog in rename mode and submit calls updateBoard', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(BOARDS_URL(7)).flush(paginated([sampleBoard(1, 'Sprint 42')]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog);
    const dialogRef: Partial<MatDialogRef<unknown, unknown>> = {
      afterClosed: () => of({ action: 'saved', name: 'Sprint 99' } as BoardEditorDialogResult),
      close: () => undefined,
    };
    const openSpy = vi
      .spyOn(dialog, 'open')
      .mockReturnValue(dialogRef as MatDialogRef<unknown, unknown>);

    const writeApi = TestBed.inject(KanbanWriteApi);
    const updateSpy = vi.spyOn(writeApi, 'updateBoard');

    const menuTrigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="board-menu-trigger"]',
    )!;
    menuTrigger.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const renameItem = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="board-menu-rename"]',
    )!;
    renameItem.click();
    await fixture.whenStable();
    fixture.detectChanges();
    // Allow async afterClosed subscribe.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const boardCall = openSpy.mock.calls.find((call) => call[0] === BoardEditorDialog);
    expect(boardCall).toBeDefined();
    const data = boardCall![1]?.data as BoardEditorDialogData;
    expect(data.mode).toBe('rename');
    expect(data.boardId).toBe(1);
    expect(data.initialName).toBe('Sprint 42');
    // S4: dialog data carries taskId for rename-mode as well.
    expect(data.taskId).toBe(TASK_ID);

    expect(updateSpy).toHaveBeenCalledWith(7, 9, 1, { name: 'Sprint 99' });

    const req = httpMock.expectOne(`${BOARDS_URL(7)}/1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ data: sampleBoard(1, 'Sprint 99') });
  });

  it('clicking Delete confirms and calls deleteBoard; 409 opens conflict dialog', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(BOARDS_URL(7)).flush(paginated([sampleBoard(1, 'Sprint 42')]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const writeApi = TestBed.inject(KanbanWriteApi);
    const deleteSpy = vi.spyOn(writeApi, 'deleteBoard').mockReturnValue(of(undefined));

    const menuTrigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="board-menu-trigger"]',
    )!;
    menuTrigger.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const deleteItem = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="board-menu-delete"]',
    )!;
    deleteItem.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith(7, 9, 1);

    // 409 conflict path: invoke the page method directly with the API
    // configured to return a typed conflict error. The page must open
    // BoardConflictDialog with `entityType: 'board'`.
    const conflictError = {
      kind: 'conflict',
      status: 409,
      code: 'board_has_contents',
      message: 'This board still has columns.',
    } as const;
    deleteSpy.mockReset();
    deleteSpy.mockImplementation(() => throwError(() => conflictError));

    const dialog = TestBed.inject(MatDialog);
    const openSpy = vi.spyOn(dialog, 'open');

    const instance = fixture.componentInstance as unknown as {
      openDeleteBoardConfirm: (board: { id: number; name: string }) => void;
    };
    instance.openDeleteBoardConfirm({ id: 1, name: 'Sprint 42' });
    await fixture.whenStable();
    fixture.detectChanges();
    // Allow the async catch branch to fire.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const conflictCalls = openSpy.mock.calls.filter(
      (call) => (call[1]?.data as { entityType?: string } | undefined)?.entityType === 'board',
    );
    expect(conflictCalls.length).toBeGreaterThanOrEqual(1);
    // S4: the conflict dialog's navigateTarget must use buildBoardRoute()
    // so the URL chain carries the taskId segment. The legacy
    // `projects/{p}/boards/{b}` shape is no longer used anywhere in the
    // client.
    const conflictData = conflictCalls[0]?.[1]?.data as
      | { navigateTarget: readonly (string | number)[] | null }
      | undefined;
    expect(conflictData?.navigateTarget).toEqual([
      '/modules/kanban/projects',
      7,
      'tasks',
      TASK_ID,
      'boards',
      1,
    ]);
  });

  it('selection checkbox toggles the selection set', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush(paginated([sampleBoard(1, 'Sprint 42'), sampleBoard(2, 'Sprint 43')]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const checkboxes = host.querySelectorAll<HTMLElement>('mat-checkbox');
    expect(checkboxes.length).toBe(2);

    const page = fixture.componentInstance as unknown as {
      _selection: () => ReadonlySet<number>;
    };
    expect(page._selection().size).toBe(0);

    // Trigger via the page's toggleSelection directly: clicking a mat-checkbox
    // wrapper fires `(change)` on the inner input — easier to invoke the
    // handler the same way the template does.
    const instance = fixture.componentInstance as unknown as {
      toggleSelection: (id: number) => void;
    };
    instance.toggleSelection(1);
    fixture.detectChanges();
    expect(page._selection().has(1)).toBe(true);
    expect(page._selection().size).toBe(1);

    instance.toggleSelection(1);
    fixture.detectChanges();
    expect(page._selection().size).toBe(0);
  });

  it('BulkActionsBar renders when selection.size > 0', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush(paginated([sampleBoard(1, 'Sprint 42'), sampleBoard(2, 'Sprint 43')]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-bulk-actions-bar')).toBeNull();

    const instance = fixture.componentInstance as unknown as {
      toggleSelection: (id: number) => void;
    };
    instance.toggleSelection(1);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-bulk-actions-bar')).not.toBeNull();
  });

  it('bulk delete calls writeApi.bulkDeleteBoards and refreshes the list', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush(paginated([sampleBoard(1, 'Sprint 42'), sampleBoard(2, 'Sprint 43')]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const writeApi = TestBed.inject(KanbanWriteApi);
    const bulkSpy = vi.spyOn(writeApi, 'bulkDeleteBoards').mockReturnValue(
      of({
        results: [
          { id: 1, status: 204 },
          { id: 2, status: 204 },
        ],
        summary: { total: 2, ok: 2, failed: 0 },
      }),
    );

    const instance = fixture.componentInstance as unknown as {
      toggleSelection: (id: number) => void;
    };
    instance.toggleSelection(1);
    fixture.detectChanges();

    const page = fixture.componentInstance as unknown as {
      runBulkDelete: () => void;
    };
    page.runBulkDelete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(bulkSpy).toHaveBeenCalled();
    const calledWith = bulkSpy.mock.calls[0]?.[0] as readonly number[];
    expect(calledWith).toContain(1);

    // After bulk delete, the page refetches the boards list.
    const refreshReq = httpMock.expectOne(BOARDS_URL(7));
    expect(refreshReq.request.method).toBe('GET');
    refreshReq.flush(paginated([]));
  });

  it('empty state shows a "Create your first board" CTA opening the editor dialog', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(BOARDS_URL(7)).flush(paginated([]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.state-empty')?.textContent).not.toContain('future update');
    const cta = host.querySelector<HTMLButtonElement>('[data-testid="empty-state-create-board"]');
    expect(cta).not.toBeNull();

    const dialog = TestBed.inject(MatDialog);
    const openSpy = vi.spyOn(dialog, 'open');

    cta!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const boardCall = openSpy.mock.calls.find((call) => call[0] === BoardEditorDialog);
    expect(boardCall).toBeDefined();
    expect((boardCall![1]?.data as BoardEditorDialogData).mode).toBe('create');
  });
});
