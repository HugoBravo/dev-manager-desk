import { TestBed } from '@angular/core/testing';
import { effect } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../core/config/api-config';
import { KanbanApi } from '../api/kanban.api';
import { KanbanWriteApi } from '../api/kanban-write.api';
import { BoardsStore } from '../stores/boards.store';
import { BoardDetailPage } from './board-detail.page';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;

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

const sampleCard = (id: number, columnId: number, title = `Card ${id}`, body = null as string | null) => ({
  id,
  column_id: columnId,
  title,
  body,
  due_date: null,
  archived_at: null,
  position: 'k',
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

function createComponent(projectId = '7', boardId = '4') {
  const fixture = TestBed.createComponent(BoardDetailPage);
  fixture.componentRef.setInput('projectId', projectId);
  fixture.componentRef.setInput('boardId', boardId);
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
    .expectOne(`${FULL_PREFIX}/projects/${projectId}/kanban/boards/${boardId}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flush(boardResult as any);
  // The page always issues a columns request (even when the response is
  // empty) — flush unconditionally so httpMock.verify() at afterEach is
  // satisfied.
  httpMock
    .expectOne(
      `${FULL_PREFIX}/projects/${projectId}/kanban/boards/${boardId}/columns`,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flush(paginated(columns) as any);
  for (const column of columns) {
    const cards = cardsByColumnId[column.id] ?? [];
    httpMock
      .expectOne(
        `${FULL_PREFIX}/projects/${projectId}/kanban/boards/${boardId}/columns/${column.id}/cards`,
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flush(paginated(cards) as any);
  }
}

describe('BoardDetailPage', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [
        BoardDetailPage,
        MatDialogModule,
        MatSnackBarModule,
        NoopAnimationsModule,
      ],
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
    TestBed.inject(MatDialog);
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
    await flushDetail(
      httpMock,
      7,
      4,
      sampleBoard(),
      [sampleColumn(12), sampleColumn(13)],
      {
        12: [sampleCard(87, 12, 'Implement login form', 'a long body preview')],
        13: [],
      },
    );
    fixture.detectChanges();
    await promise;

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.board-title')?.textContent).toContain(
      'Sprint 42',
    );
    const cols = host.querySelectorAll('.column');
    expect(cols.length).toBe(2);
    expect(host.querySelectorAll('.card').length).toBe(1);
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
    expect(host.querySelector('.state-empty-board')?.textContent).toContain(
      'no columns',
    );
  });

  it('renders a per-column empty state when the column has no cards', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(
      httpMock,
      7,
      4,
      sampleBoard(),
      [sampleColumn(12)],
      { 12: [] },
    );
    fixture.detectChanges();
    await promise;

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.column-empty')).not.toBeNull();
    expect(host.querySelector('.column-empty')?.textContent).toContain(
      'No cards',
    );
  });

  it('renders the error state when the API fails', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    // Flush a synthetic 404 — no columns flush is needed because forkJoin
    // cancels the sibling when board$ errors.
    httpMock
      .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`)
      .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
    httpMock.expectOne(
      `${FULL_PREFIX}/projects/7/kanban/boards/4/columns`,
    );
    await promise;
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Not found',
    );
  });

  it('truncates long card bodies to a plain-text preview (no markdown)', async () => {
    const longBody = 'a'.repeat(500);
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    const promise = fixture.whenStable();
    await flushDetail(
      httpMock,
      7,
      4,
      sampleBoard(),
      [sampleColumn(12)],
      {
        12: [sampleCard(87, 12, 'Long', longBody)],
      },
    );
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
    const moveBaseUrl = `${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards/87/move`;

    const promise = fixture.whenStable();
    await flushDetail(
      httpMock,
      7,
      4,
      sampleBoard(),
      [sampleColumn(12), sampleColumn(13)],
      { 12: [sampleCard(87, 12, 'Implement login form')], 13: [] },
    );
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
    (fixture.componentInstance as unknown as {
      onCardDrop: (e: typeof dropEvent) => void;
    }).onCardDrop(dropEvent);

    const moveReq = httpMock.expectOne(moveBaseUrl);
    expect(moveReq.request.method).toBe('POST');
    expect(moveReq.request.body).toEqual({ target_column_id: 13 });

    // 422 position_exhausted must surface through W3 so the page can branch.
    moveReq.flush(
      { message: 'Server ran out of room to position items.', errors: {}, code: 'position_exhausted' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    // Page MUST refetch: board + columns + cards per column.
    const refetchBoardReq = httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`);
    const refetchColumnsReq = httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns`);
    refetchBoardReq.flush(sampleBoard());
    refetchColumnsReq.flush(paginated([sampleColumn(12), sampleColumn(13)]));
    // Spin so the inner forkJoin (cards per column) sets up its HTTP.
    for (let i = 0; i < 5; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }

    const refetchCardReqs = httpMock.match((req) =>
      req.url.includes('/columns/') && req.url.endsWith('/cards'),
    );
    expect(refetchCardReqs.length).toBe(2);
    const refetchCards12 = refetchCardReqs.find((r) => r.request.url.endsWith('/columns/12/cards'))!;
    const refetchCards13 = refetchCardReqs.find((r) => r.request.url.endsWith('/columns/13/cards'))!;

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
});
