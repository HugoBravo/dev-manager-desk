import { TestBed } from '@angular/core/testing';
import { effect } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { API_CONFIG } from '../../../core/config/api-config';
import { KanbanApi } from '../api/kanban.api';
import { KanbanWriteApi } from '../api/kanban-write.api';
import { BoardsStore } from '../stores/boards.store';
import { LabelsStore } from '../stores/labels.store';
import { BoardDetailPage } from './board-detail.page';
import { BoardEditorDialog } from '../components/board-editor-dialog/board-editor-dialog';
import type {
  BoardEditorDialogData,
  BoardEditorDialogResult,
} from '../components/board-editor-dialog/board-editor-dialog';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;
const TASK_ID = 9;

const sampleBoard = () => ({
  id: 4,
  project_id: 7,
  name: 'Sprint 42',
  position: 'n',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const sampleColumn = (id: number) => ({
  id,
  board_id: 4,
  name: 'In Progress',
  position: 'u',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const sampleCard = (
  id: number,
  columnId: number,
  title = `Card ${id}`,
  body = null as string | null,
) => ({
  id,
  column_id: columnId,
  title,
  body,
  due_date: null,
  archived_at: null,
  position: 'k',
  labels: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

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

function createComponent(projectId = '7', boardId = '4', taskId = String(TASK_ID)) {
  const fixture = TestBed.createComponent(BoardDetailPage);
  // Provide the required inputs via the binding the router uses.
  // S2: taskId now flows from the route, not from BoardsStore.setTaskId.
  fixture.componentRef.setInput('projectId', projectId);
  fixture.componentRef.setInput('boardId', boardId);
  fixture.componentRef.setInput('taskId', taskId);
  fixture.detectChanges();
  return fixture;
}

async function flushDetail(
  httpMock: HttpTestingController,
  projectId: number,
  boardId: number,
  boardResult: ReturnType<typeof sampleBoard> | { message: string },
  columns: Array<{ id: number }>,
  cardsByColumnId: Record<number, Array<unknown>>,
): Promise<void> {
  httpMock
    .expectOne(`${FULL_PREFIX}/projects/${projectId}/tasks/${TASK_ID}/kanban/boards/${boardId}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flush(boardResult as any);
  // The page always issues a columns request (even when the response is
  // empty) — flush unconditionally so httpMock.verify() at afterEach is
  // satisfied.
  httpMock
    .expectOne(`${FULL_PREFIX}/projects/${projectId}/tasks/${TASK_ID}/kanban/boards/${boardId}/columns`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flush(paginated(columns) as any);
  for (const column of columns) {
    const cards = cardsByColumnId[column.id] ?? [];
    httpMock
      .expectOne(
        `${FULL_PREFIX}/projects/${projectId}/tasks/${TASK_ID}/kanban/boards/${boardId}/columns/${column.id}/cards`,
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flush(paginated(cards) as any);
  }
}

describe('BoardDetailPage', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await TestBed.configureTestingModule({
      imports: [BoardDetailPage, MatDialogModule, MatSnackBarModule, NoopAnimationsModule],
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
        LabelsStore,
      ],
    }).compileComponents();
    // Silence snackbar dialogs in tests.
    TestBed.inject(MatSnackBar);
    TestBed.inject(MatDialog);
    // S2: BoardsStore is NOT pre-bound with setTaskId. The page must
    // derive its taskId from the route input (`setInput('taskId', ...)`
    // inside `createComponent`) and forward it both to direct API calls
    // and to BoardsStore.setTaskId for the store's internal loads.
  });

  afterEach(() => window.localStorage.clear());

  it('renders the loading state until the responses land', () => {
    const fixture = createComponent();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('mat-progress-spinner')).not.toBeNull();
  });

  it('renders columns and cards on success', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12), sampleColumn(13)], {
      12: [sampleCard(87, 12, 'Implement login form', 'a long body preview')],
      13: [],
    });
    fixture.detectChanges();
    await promise;

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.board-title')?.textContent).toContain('Sprint 42');
    const cols = host.querySelectorAll('.column');
    expect(cols.length).toBe(2);
    expect(host.querySelectorAll('.card').length).toBe(1);
  });

  it('renders a per-column menu trigger and an Add column affordance', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12), sampleColumn(13)], {
      12: [],
      13: [],
    });
    fixture.detectChanges();
    await promise;

    const host = fixture.nativeElement as HTMLElement;
    // One menu trigger per column header.
    const menuTriggers = host.querySelectorAll('.column-menu-trigger');
    expect(menuTriggers.length).toBe(2);
    // Add-column affordance is rendered at the row's tail.
    const addCol = host.querySelector('button[aria-label="Add column"]');
    expect(addCol).not.toBeNull();
  });

  it('opens the ColumnEditorDialog when Add column is clicked', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12)], { 12: [] });
    fixture.detectChanges();
    await promise;

    const addCol = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Add column"]',
    )!;
    addCol.click();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const editorHost = document.body.querySelector('app-column-editor-dialog');
    expect(editorHost).not.toBeNull();
    expect(editorHost?.textContent).toContain('New column');
  });

  it('exposes a Rename entry inside the per-column menu', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12)], { 12: [] });
    fixture.detectChanges();
    await promise;

    // Open the per-column menu by clicking the trigger button.
    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.column-menu-trigger',
    )!;
    trigger.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // The MatMenu overlay portal mounts into the CDK overlay container,
    // which is detached from the host fixture's native element. Look in
    // the whole document for the Rename / Archive / Delete entries.
    const renameItem = document.body.querySelector('button[aria-label="Rename column"]');
    const archiveItem = document.body.querySelector('button[aria-label^="Archive column"]');
    const deleteItem = document.body.querySelector('button[aria-label^="Delete column"]');
    expect(renameItem).not.toBeNull();
    expect(archiveItem).not.toBeNull();
    expect(deleteItem).not.toBeNull();
  });

  it('renders the empty-board message when there are no columns', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [], {});
    fixture.detectChanges();
    await promise;

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.state-empty-board')).not.toBeNull();
    expect(host.querySelector('.state-empty-board')?.textContent).toContain('no columns');
  });

  it('renders a per-column empty state when the column has no cards', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12)], { 12: [] });
    fixture.detectChanges();
    await promise;

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.column-empty')).not.toBeNull();
    expect(host.querySelector('.column-empty')?.textContent).toContain('No cards');
  });

  it('renders the error state when the API fails', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    // Flush a synthetic 404 — no columns flush is needed because forkJoin
    // cancels the sibling when board$ errors.
    httpMock
      .expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4`)
      .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns`);
    await promise;
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Not found');
  });

  it('truncates long card bodies to a plain-text preview (no markdown)', async () => {
    const longBody = 'a'.repeat(500);
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12)], {
      12: [sampleCard(87, 12, 'Long', longBody)],
    });
    fixture.detectChanges();
    await promise;

    const cardBody = (fixture.nativeElement as HTMLElement).querySelector(
      '.card-body',
    )?.textContent;
    expect(cardBody).toBeDefined();
    expect(cardBody!.length).toBeLessThanOrEqual(201); // 200 + ellipsis
    expect(cardBody).not.toContain('<');
    expect(cardBody).not.toContain('h2');
  });

  it('422 position_exhausted triggers store.loadBoard refetch with no local card mutation', async () => {
    // W2 — server-confirmed-reorder contract: on 422 position_exhausted
    // the page MUST refetch the affected scope (no local recomputation).
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(BoardsStore);
    const moveBaseUrl = `${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/12/cards/87/move`;

    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12), sampleColumn(13)], {
      12: [sampleCard(87, 12, 'Implement login form')],
      13: [],
    });
    fixture.detectChanges();
    await promise;
    expect(store.cardsFor(12).map((c) => c.id)).toEqual([87]);

    // Record every emission of currentBoard() to detect any card-cache
    // mutation between the 422 and the refetch.
    const emissions: Array<Record<string, readonly number[]>> = [];
    const recorder = TestBed.runInInjectionContext(() =>
      effect(() => {
        const detail = store.currentBoard();
        if (detail === null) {
          emissions.push({});
          return;
        }
        const snap: Record<string, readonly number[]> = {};
        for (const [columnId, cards] of Object.entries(detail.cardsByColumnId)) {
          snap[columnId] = cards.map((c) => c.id);
        }
        emissions.push(snap);
      }),
    );

    const dropEvent = {
      previousIndex: 0,
      currentIndex: 0,
      item: { data: 87 } as never,
      container: { data: { columnId: 13 } } as never,
      previousContainer: { data: { columnId: 12 } } as never,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    } as CdkDragDrop<unknown, unknown, { columnId: number }>;
    (
      fixture.componentInstance as unknown as {
        onCardDrop: (e: typeof dropEvent) => void;
      }
    ).onCardDrop(dropEvent);

    const moveReq = httpMock.expectOne(moveBaseUrl);
    expect(moveReq.request.method).toBe('POST');
    expect(moveReq.request.body).toEqual({ to_column_id: 13 });

    // 422 position_exhausted must surface through W3 so the page can branch.
    moveReq.flush(
      {
        message: 'Server ran out of room to position items.',
        errors: {},
        code: 'position_exhausted',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    // Page MUST refetch: board + columns + cards per column.
    const refetchBoardReq = httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4`);
    const refetchColumnsReq = httpMock.expectOne(
      `${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns`,
    );
    refetchBoardReq.flush(sampleBoard());
    refetchColumnsReq.flush(paginated([sampleColumn(12), sampleColumn(13)]));
    // Spin so the inner forkJoin (cards per column) sets up its HTTP.
    for (let i = 0; i < 5; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }

    const refetchCardReqs = httpMock.match(
      (req) => req.url.includes('/columns/') && req.url.endsWith('/cards'),
    );
    expect(refetchCardReqs.length).toBe(2);
    const refetchCards12 = refetchCardReqs.find((r) =>
      r.request.url.endsWith('/columns/12/cards'),
    )!;
    const refetchCards13 = refetchCardReqs.find((r) =>
      r.request.url.endsWith('/columns/13/cards'),
    )!;

    // CRITICAL: between the 422 and the refetch response, the card
    // cache must NOT have been mutated locally. If the page had
    // optimistically moved the card, column 13 would already be [87].
    const lastEmissionBeforeRefetch = emissions[emissions.length - 1] ?? {};
    expect(lastEmissionBeforeRefetch['12']).toEqual([87]);
    expect(lastEmissionBeforeRefetch['13']).toEqual([]);

    refetchCards12.flush(paginated([sampleCard(87, 12, 'Implement login form')]));
    refetchCards13.flush(paginated([]));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(store.cardsFor(12).map((c) => c.id)).toEqual([87]);

    recorder.destroy();
    httpMock.verify();
  });

  // --- Batch 6 — Task 2.8 ---

  it('header action menu has Rename board, Delete board, View audit log items', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12)], { 12: [] });
    fixture.detectChanges();
    await promise;
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLButtonElement>('[data-testid="board-menu-trigger"]');
    expect(trigger).not.toBeNull();

    trigger!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.body.querySelector('[data-testid="board-menu-rename"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="board-menu-delete"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="board-menu-audit"]')).not.toBeNull();
  });

  it('clicking View audit log expands the audit panel and calls listBoardAudit', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12)], { 12: [] });
    fixture.detectChanges();
    await promise;
    fixture.detectChanges();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="board-menu-trigger"]',
    )!;
    trigger.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const auditItem = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="board-menu-audit"]',
    )!;
    auditItem.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const auditReq = httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/audit`);
    expect(auditReq.request.method).toBe('GET');
    auditReq.flush(
      paginated([
        {
          id: 1,
          board_id: 4,
          actor_user_id: 1,
          action: 'created',
          payload: {},
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          board_id: 4,
          actor_user_id: 1,
          action: 'renamed',
          payload: { from: 'Old', to: 'New' },
          created_at: '2026-01-02T00:00:00Z',
        },
      ]),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    const panel = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="audit-panel"]',
    );
    expect(panel).not.toBeNull();
    const entries = panel?.querySelectorAll('[data-testid="audit-entry"]');
    expect(entries?.length).toBe(2);
  });

  it('clicking Rename opens BoardEditorDialog in rename mode', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12)], { 12: [] });
    fixture.detectChanges();
    await promise;
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog);
    const openSpy = vi.spyOn(dialog, 'open');

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="board-menu-trigger"]',
    )!;
    trigger.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const renameItem = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="board-menu-rename"]',
    )!;
    renameItem.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const boardCall = openSpy.mock.calls.find((call) => call[0] === BoardEditorDialog);
    expect(boardCall).toBeDefined();
    const data = boardCall![1]?.data as BoardEditorDialogData;
    expect(data.mode).toBe('rename');
    expect(data.boardId).toBe(4);
    expect(data.initialName).toBe('Sprint 42');
  });

  it('clicking Delete confirms then calls deleteBoard; on 204 navigates to the boards list', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(httpMock, 7, 4, sampleBoard(), [sampleColumn(12)], { 12: [] });
    fixture.detectChanges();
    await promise;
    fixture.detectChanges();

    const writeApi = TestBed.inject(KanbanWriteApi);
    const deleteSpy = vi.spyOn(writeApi, 'deleteBoard').mockReturnValue(of(undefined));

    const router = (
      fixture.componentInstance as unknown as {
        router: { navigate: (cmds: unknown[]) => Promise<boolean> };
      }
    ).router;
    const navSpy = vi.spyOn(router, 'navigate');

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="board-menu-trigger"]',
    )!;
    trigger.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const deleteItem = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="board-menu-delete"]',
    )!;
    deleteItem.click();
    await fixture.whenStable();
    fixture.detectChanges();
    // Allow async chain to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith(7, 9, 4);
    expect(navSpy).toHaveBeenCalledWith([
      '/modules/kanban/projects',
      7,
      'tasks',
      9,
      'boards',
    ]);
  });
});
