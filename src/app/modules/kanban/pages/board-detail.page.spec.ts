import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { API_CONFIG } from '../../../core/config/api-config';
import { KanbanApi } from '../api/kanban.api';
import { BoardDetailPage } from './board-detail.page';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/api/v1';
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
      imports: [BoardDetailPage, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: API_CONFIG,
          useValue: { apiBaseUrl: API_BASE_URL, apiPrefix: API_PREFIX },
        },
        KanbanApi,
      ],
    }).compileComponents();
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
    fixture.detectChanges();
    await promise;

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
});
