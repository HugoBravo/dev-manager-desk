import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import { KanbanApi } from '../api/kanban.api';
import type { Board, BoardDetail, KanbanCard, KanbanColumn } from '../models';
import { BoardsStore } from './boards.store';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;
const PROJECT_ID = 7;
const TASK_ID = 9;

const sampleCard = (id: number, columnId: number, position = 'k'): KanbanCard => ({
  id,
  column_id: columnId,
  title: `Card ${id}`,
  body: null,
  due_date: null,
  archived_at: null,
  position,
  labels: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const sampleLabel = (id: number, name: string, color: string) => ({
  id,
  name,
  color,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const sampleDetail: BoardDetail = {
  board: {
    id: 4,
    task_id: TASK_ID,
    task: {
      id: TASK_ID,
      name: 'Ship S4',
      slug: 'ship-s4',
      status: 'open',
      priority: 'MEDIUM',
      archived_at: null,
    },
    name: 'Sprint 42',
    position: 'n',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  columns: [
    {
      id: 12,
      board_id: 4,
      name: 'In Progress',
      position: 'u',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 15,
      board_id: 4,
      name: 'Done',
      position: 'v',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  cardsByColumnId: {
    '12': [sampleCard(87, 12), sampleCard(88, 12)],
    '15': [sampleCard(89, 15)],
  },
};

describe('BoardsStore', () => {
  let store: BoardsStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: API_CONFIG,
          useValue: { apiBaseUrl: API_BASE_URL },
        },
        KanbanApi,
        BoardsStore,
      ],
    });
    store = TestBed.inject(BoardsStore);
    httpMock = TestBed.inject(HttpTestingController);
    // S1: bind the store to a taskId before triggering any URL-scoped load.
    // Real pages set this from the route param (S2); specs set it directly.
    store.setTaskId(TASK_ID);
  });

  afterEach(() => httpMock.verify());

  it('exposes initial empty state', () => {
    expect(store.boards()).toEqual([]);
    expect(store.currentBoard()).toBeNull();
    expect(store.loading()).toBe('idle');
    expect(store.error()).toBeNull();
  });

  it('loadBoard() fetches detail and writes to currentBoard()', async () => {
    const promise = store.loadBoard(7, 4);
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4`).flush({
      id: 4,
      task_id: TASK_ID,
      task: {
        id: TASK_ID,
        name: 'Ship S4',
        slug: 'ship-s4',
        status: 'open',
        priority: 'MEDIUM',
        archived_at: null,
      },
      name: 'Sprint 42',
      position: 'n',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns`).flush({
      data: sampleDetail.columns,
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
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/12/cards`).flush({
      data: sampleDetail.cardsByColumnId['12'],
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
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/15/cards`).flush({
      data: sampleDetail.cardsByColumnId['15'],
      links: { first: '', last: '', prev: null, next: null },
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        per_page: 25,
        to: 1,
        total: 1,
        path: '',
      },
    });

    const detail = await promise;
    expect(detail).not.toBeNull();
    expect(detail?.board.id).toBe(4);
    expect(store.currentBoard()?.board.name).toBe('Sprint 42');
    expect(store.cardsFor(12).map((c) => c.id)).toEqual([87, 88]);
  });

  describe('applyCardMutation', () => {
    beforeEach(async () => {
      // Pre-load the store with the sample detail via a direct write.
      // We do this via `loadBoard()` (tested above) for realism.
      const promise = store.loadBoard(7, 4);
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4`).flush(sampleDetail.board);
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns`).flush({
        data: sampleDetail.columns,
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
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/12/cards`).flush({
        data: sampleDetail.cardsByColumnId['12'],
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
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/15/cards`).flush({
        data: sampleDetail.cardsByColumnId['15'],
        links: { first: '', last: '', prev: null, next: null },
        meta: {
          current_page: 1,
          from: 1,
          last_page: 1,
          per_page: 25,
          to: 1,
          total: 1,
          path: '',
        },
      });
      await promise;
    });

    it('updates a card within the same column (no column change)', () => {
      // Within-column reorder: card 87 stays in column 12, position changes.
      const updated: KanbanCard = { ...sampleCard(87, 12), position: 'z' };
      store.applyCardMutation(updated);

      const columnCards = store.cardsFor(12);
      expect(columnCards).toHaveLength(2);
      expect(columnCards.find((c) => c.id === 87)?.position).toBe('z');
      expect(store.cardsFor(15)).toHaveLength(1);
    });

    it('moves a card across columns on the server-returned position', () => {
      // Cross-column move: card 87 moves from column 12 → 15.
      const moved: KanbanCard = { ...sampleCard(87, 15), position: 'z' };
      store.applyCardMutation(moved);

      // Source column lost the card.
      expect(store.cardsFor(12).map((c) => c.id)).toEqual([88]);
      // Target column gained the card with the server position.
      const targetCards = store.cardsFor(15);
      expect(targetCards).toHaveLength(2);
      expect(targetCards.find((c) => c.id === 87)?.position).toBe('z');
    });

    it('does NOT call the API — server response is the only input', () => {
      // Mutating without issuing a request: confirms the store is a pure
      // cache and does not auto-fetch.
      const before = httpMock.match(() => true).length;
      store.applyCardMutation({ ...sampleCard(87, 15), position: 'z' });
      const after = httpMock.match(() => true).length;
      expect(after).toBe(before);
    });

    it('moves a card even when the cache had it in the wrong column', () => {
      // Regression: a previous bug had findPreviousColumn return the wrong
      // column when the cache had drifted from the server (e.g. an earlier
      // move that did not finish). The card would stay stuck in the wrong
      // column. The store must now trust the server-returned column_id
      // unconditionally and place the card there.
      //
      // Simulate the drift: put card 87 in column 15 in the cache, even
      // though the server will return it in column 15 anyway. The cache
      // is already in sync — but now mutate as if a previous call had
      // mistakenly placed it in column 12 too. We seed by hand.
      const before = store.cardsFor(12).map((c) => c.id);
      const beforeTarget = store.cardsFor(15).map((c) => c.id);
      // Card 87 is in 12 originally (per sampleDetail); force the cache
      // to also list it under 15 so it appears in two columns.
      const current = store.currentBoard();
      if (current === null) {
        throw new Error('expected currentBoard to be seeded');
      }
      const drifted = {
        ...current,
        cardsByColumnId: {
          ...current.cardsByColumnId,
          '15': [...current.cardsByColumnId['15']!, sampleCard(87, 15, 'u')],
        },
      };
      (
        store as unknown as { _currentBoard: { set: (v: typeof drifted) => void } }
      )._currentBoard.set(drifted);

      // Now the server says card 87 is in column 15 (canonical).
      store.applyCardMutation({ ...sampleCard(87, 15), position: 'u' });

      // Card 87 must appear EXACTLY ONCE in column 15, never in column 12.
      expect(store.cardsFor(12).map((c) => c.id)).toEqual(before.filter((id) => id !== 87));
      const targetIds = store.cardsFor(15).map((c) => c.id);
      expect(targetIds.filter((id) => id === 87)).toHaveLength(1);
      expect(targetIds).toEqual([...beforeTarget, 87]);
    });

    it('inserts the card at its server-returned column even when it is missing from the cache', () => {
      // Edge case: the cache may not contain the card at all (e.g. a fresh
      // page load racing with a stale move). Trust the server response and
      // place the card under its column_id.
      const current = store.currentBoard();
      if (current === null) {
        throw new Error('expected currentBoard to be seeded');
      }
      const stripped = {
        ...current,
        cardsByColumnId: {
          ...current.cardsByColumnId,
          '12': current.cardsByColumnId['12']!.filter((c) => c.id !== 87),
        },
      };
      (
        store as unknown as { _currentBoard: { set: (v: typeof stripped) => void } }
      )._currentBoard.set(stripped);

      store.applyCardMutation({ ...sampleCard(87, 15), position: 'r' });

      expect(store.cardsFor(12).map((c) => c.id)).not.toContain(87);
      expect(store.cardsFor(15).map((c) => c.id)).toContain(87);
    });
  });

  it('pruneLabelFromCards() strips a label from every card that carried it', async () => {
    const bug = sampleLabel(1, 'bug', '#ef4444');
    const p1 = sampleLabel(2, 'p1', '#f59e0b');
    // Seed a board whose cards carry the labels.
    await loadSampleDetailWithLabels(store, httpMock, [
      {
        columnId: 12,
        cards: [
          { ...sampleCard(87, 12), labels: [bug, p1] },
          { ...sampleCard(88, 12), labels: [bug] },
        ],
      },
      { columnId: 15, cards: [{ ...sampleCard(89, 15), labels: [p1] }] },
    ]);

    store.pruneLabelFromCards(bug.id);

    expect(store.cardsFor(12)[0]?.labels.map((l) => l.id)).toEqual([p1.id]);
    expect(store.cardsFor(12)[1]?.labels).toEqual([]);
    // Column 15's card did not carry `bug`; it must be untouched.
    expect(store.cardsFor(15)[0]?.labels.map((l) => l.id)).toEqual([p1.id]);
  });

  it('pruneLabelFromCards() is a no-op when no card carried the label', async () => {
    const bug = sampleLabel(1, 'bug', '#ef4444');
    await loadSampleDetailWithLabels(store, httpMock, [
      { columnId: 12, cards: [sampleCard(87, 12)] },
    ]);

    const before = JSON.stringify(store.currentBoard());
    store.pruneLabelFromCards(bug.id);
    const after = JSON.stringify(store.currentBoard());
    expect(after).toBe(before);
  });

  it('pruneLabelFromCards() is a no-op when no board is loaded', () => {
    // currentBoard is null before loadBoard is called.
    expect(store.currentBoard()).toBeNull();
    // No throw, no state change.
    store.pruneLabelFromCards(99);
    expect(store.currentBoard()).toBeNull();
  });

  it('applyCardRemoved() drops the card from its column', async () => {
    const promise = store.loadBoard(7, 4);
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4`).flush(sampleDetail.board);
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns`).flush({
      data: sampleDetail.columns,
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
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/12/cards`).flush({
      data: sampleDetail.cardsByColumnId['12'],
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
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/15/cards`).flush({
      data: sampleDetail.cardsByColumnId['15'],
      links: { first: '', last: '', prev: null, next: null },
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        per_page: 25,
        to: 1,
        total: 1,
        path: '',
      },
    });
    await promise;

    store.applyCardRemoved(87);
    expect(store.cardsFor(12).map((c) => c.id)).toEqual([88]);
    // Other column untouched.
    expect(store.cardsFor(15).map((c) => c.id)).toEqual([89]);
  });

  // --- Column mutation helpers (commit 3) ---

  /** Render a fresh `KanbanColumn` with the given overrides. */
  const sampleColumn = (overrides: Partial<KanbanColumn> = {}): KanbanColumn => ({
    id: 99,
    board_id: 4,
    name: 'New column',
    position: 'n',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  /** Drive a standard `loadBoard()` so the store has data to mutate. */
  async function loadSampleDetail(): Promise<void> {
    const promise = store.loadBoard(7, 4);
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4`).flush(sampleDetail.board);
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns`).flush({
      data: sampleDetail.columns,
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
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/12/cards`).flush({
      data: sampleDetail.cardsByColumnId['12'],
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
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/15/cards`).flush({
      data: sampleDetail.cardsByColumnId['15'],
      links: { first: '', last: '', prev: null, next: null },
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        per_page: 25,
        to: 1,
        total: 1,
        path: '',
      },
    });
    await promise;
  }

  describe('applyColumnCreated()', () => {
    it('appends the column and seeds an empty card map entry', async () => {
      await loadSampleDetail();
      const created = sampleColumn({ id: 99, name: 'Backlog' });
      store.applyColumnCreated(created);

      const detail = store.currentBoard();
      expect(detail).not.toBeNull();
      expect(detail!.columns.map((c) => c.id)).toEqual([12, 15, 99]);
      expect(detail!.columns[2]?.name).toBe('Backlog');
      // New column has no cards.
      expect(store.cardsFor(99)).toEqual([]);
    });

    it('is idempotent — repeat calls do not duplicate the column', async () => {
      await loadSampleDetail();
      const column = sampleColumn({ id: 12, name: 'In Progress' });
      store.applyColumnCreated(column);
      // Existing column was updated, not duplicated.
      expect(store.currentBoard()!.columns.map((c) => c.id)).toEqual([12, 15]);
      expect(store.currentBoard()!.columns[0]?.name).toBe('In Progress');
    });

    it('is a no-op when no board is loaded', () => {
      expect(store.currentBoard()).toBeNull();
      store.applyColumnCreated(sampleColumn());
      expect(store.currentBoard()).toBeNull();
    });
  });

  describe('applyColumnUpdated()', () => {
    it('replaces the matching column in place by id', async () => {
      await loadSampleDetail();
      const renamed = sampleColumn({ id: 12, name: 'Doing' });
      store.applyColumnUpdated(renamed);

      const cols = store.currentBoard()!.columns;
      expect(cols.find((c) => c.id === 12)?.name).toBe('Doing');
      // Order preserved.
      expect(cols.map((c) => c.id)).toEqual([12, 15]);
    });

    it('is a no-op when the column id is unknown (refetch instead)', async () => {
      await loadSampleDetail();
      const before = JSON.stringify(store.currentBoard());
      store.applyColumnUpdated(sampleColumn({ id: 999 }));
      const after = JSON.stringify(store.currentBoard());
      expect(after).toBe(before);
    });

    it('is a no-op when no board is loaded', () => {
      expect(store.currentBoard()).toBeNull();
      store.applyColumnUpdated(sampleColumn());
      expect(store.currentBoard()).toBeNull();
    });
  });

  describe('applyColumnRemoved()', () => {
    it('removes the column and its card map entry', async () => {
      await loadSampleDetail();
      store.applyColumnRemoved(12);
      const cols = store.currentBoard()!.columns;
      expect(cols.map((c) => c.id)).toEqual([15]);
      // 12's card map is gone — 15's is preserved.
      expect(store.cardsFor(12)).toEqual([]);
      expect(store.cardsFor(15).map((c) => c.id)).toEqual([89]);
    });

    it('is a no-op when the column id is unknown', async () => {
      await loadSampleDetail();
      const before = JSON.stringify(store.currentBoard());
      store.applyColumnRemoved(999);
      const after = JSON.stringify(store.currentBoard());
      expect(after).toBe(before);
    });

    it('is a no-op when no board is loaded', () => {
      expect(store.currentBoard()).toBeNull();
      store.applyColumnRemoved(99);
      expect(store.currentBoard()).toBeNull();
    });
  });

  describe('replaceColumnOrder()', () => {
    it('replaces the column array and preserves card maps untouched', async () => {
      await loadSampleDetail();
      const newOrder = [
        sampleColumn({ id: 15, name: 'Done (reordered)', position: 'a' }),
        sampleColumn({ id: 12, name: 'In Progress (reordered)', position: 'b' }),
      ];
      store.replaceColumnOrder(newOrder);

      const cols = store.currentBoard()!.columns;
      expect(cols.map((c) => c.id)).toEqual([15, 12]);
      expect(cols[0]?.name).toBe('Done (reordered)');
      // Cards under 12 / 15 are still there.
      expect(store.cardsFor(12).map((c) => c.id)).toEqual([87, 88]);
      expect(store.cardsFor(15).map((c) => c.id)).toEqual([89]);
    });

    it('is a no-op when no board is loaded', () => {
      expect(store.currentBoard()).toBeNull();
      store.replaceColumnOrder([sampleColumn()]);
      expect(store.currentBoard()).toBeNull();
    });
  });

  // --- Board lifecycle helpers (Task 2.3, api-doc §16/§17) ---

  /** Render a fresh `Board` with the given overrides. */
  const sampleBoardFn = (overrides: Partial<Board> = {}): Board => ({
    id: 99,
    task_id: TASK_ID,
    task: {
      id: TASK_ID,
      name: 'Ship S4',
      slug: 'ship-s4',
      status: 'open',
      priority: 'MEDIUM',
      archived_at: null,
    },
    name: 'New board',
    position: 'v',
    archived_at: null,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  describe('applyBoardCreated()', () => {
    it('pushes the new board and sorts by position ASC', () => {
      // Seed with one board at position 'n'.
      store.boardsCache.set([sampleBoardFn({ id: 1, name: 'Alpha', position: 'n' })]);
      store.applyBoardCreated(sampleBoardFn({ id: 2, name: 'Bravo', position: 'r' }));
      store.applyBoardCreated(sampleBoardFn({ id: 3, name: 'Charlie', position: 'k' }));

      const ids = store.boards().map((b) => b.id);
      expect(ids).toEqual([3, 1, 2]);
    });

    it('is a no-op when boards cache is empty (the new board becomes the first element)', () => {
      expect(store.boards()).toEqual([]);
      store.applyBoardCreated(sampleBoardFn({ id: 1, position: 'n' }));
      expect(store.boards().map((b) => b.id)).toEqual([1]);
    });
  });

  describe('applyBoardRemoved()', () => {
    it('filters out the matching id from the boards cache', () => {
      store.boardsCache.set([
        sampleBoardFn({ id: 1, position: 'n' }),
        sampleBoardFn({ id: 2, position: 'r' }),
        sampleBoardFn({ id: 3, position: 'v' }),
      ]);
      store.applyBoardRemoved(2);
      expect(store.boards().map((b) => b.id)).toEqual([1, 3]);
    });

    it('is idempotent — second call leaves the cache unchanged', () => {
      store.boardsCache.set([
        sampleBoardFn({ id: 1, position: 'n' }),
        sampleBoardFn({ id: 2, position: 'r' }),
      ]);
      store.applyBoardRemoved(99);
      const before = JSON.stringify(store.boards());
      store.applyBoardRemoved(99);
      const after = JSON.stringify(store.boards());
      expect(after).toBe(before);
      expect(store.boards().map((b) => b.id)).toEqual([1, 2]);
    });

    it('is a no-op when the boards cache is empty', () => {
      expect(store.boards()).toEqual([]);
      store.applyBoardRemoved(42);
      expect(store.boards()).toEqual([]);
    });
  });

  describe('applyBoardRestored()', () => {
    it('pushes the restored board and sorts by position ASC', () => {
      store.boardsCache.set([
        sampleBoardFn({ id: 1, name: 'Alpha', position: 'n' }),
        sampleBoardFn({ id: 2, name: 'Bravo', position: 'r' }),
      ]);
      store.applyBoardRestored(sampleBoardFn({ id: 3, name: 'Charlie', position: 'k' }));
      expect(store.boards().map((b) => b.id)).toEqual([3, 1, 2]);
    });
  });

  describe('applyBoardCloned()', () => {
    it('pushes the new board and sorts by position; source is untouched', () => {
      const source = sampleBoardFn({ id: 1, name: 'Sprint Template', position: 'n' });
      store.boardsCache.set([source]);
      const cloned = sampleBoardFn({
        id: 2,
        name: 'Sprint Template (Copy)',
        position: 'p',
      });
      store.applyBoardCloned(cloned);

      const ids = store.boards().map((b) => b.id);
      expect(ids).toEqual([1, 2]);
      // Source untouched: same name, position, updated_at.
      const sourceAfter = store.boards().find((b) => b.id === 1);
      expect(sourceAfter).toEqual(source);
    });

    it('is a no-op when the source is not in the cache (only the clone is added)', () => {
      expect(store.boards()).toEqual([]);
      const cloned = sampleBoardFn({ id: 2, name: 'Clone', position: 'n' });
      store.applyBoardCloned(cloned);
      expect(store.boards().map((b) => b.id)).toEqual([2]);
    });
  });

  describe('applyBoardUpdated()', () => {
    it('replaces the matching board by id (existing helper)', () => {
      store.boardsCache.set([
        sampleBoardFn({ id: 1, name: 'Alpha', position: 'n' }),
        sampleBoardFn({ id: 2, name: 'Bravo', position: 'r' }),
      ]);
      store.applyBoardUpdated(sampleBoardFn({ id: 2, name: 'Bravo (renamed)', position: 'r' }));
      expect(store.boards().find((b) => b.id === 2)?.name).toBe('Bravo (renamed)');
      expect(store.boards().map((b) => b.id)).toEqual([1, 2]);
    });

    it('is a no-op when no board matches the id', () => {
      store.boardsCache.set([sampleBoardFn({ id: 1, name: 'Alpha', position: 'n' })]);
      const before = JSON.stringify(store.boards());
      store.applyBoardUpdated(sampleBoardFn({ id: 999, name: 'Ghost' }));
      expect(JSON.stringify(store.boards())).toBe(before);
    });
  });

  describe('applyTrashBoardRemoved()', () => {
    it('drops the matching board from the trash signal', async () => {
      // Seed the trash via loadTrash().
      const load = store.loadTrash(7);
      const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/trashed`);
      req.flush({
        data: [
          {
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
            name: 'Trash A',
            position: 'n',
            archived_at: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            deleted_at: '2026-07-04T10:00:00.000000Z',
          },
          {
            id: 2,
            task_id: TASK_ID,
            task: {
              id: TASK_ID,
              name: 'Ship S4',
              slug: 'ship-s4',
              status: 'open',
              priority: 'MEDIUM',
              archived_at: null,
            },
            name: 'Trash B',
            position: 'r',
            archived_at: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            deleted_at: '2026-07-04T11:00:00.000000Z',
          },
        ],
      });
      await load;
      expect(store.trash().map((b) => b.id)).toEqual([1, 2]);

      store.applyTrashBoardRemoved(1);
      expect(store.trash().map((b) => b.id)).toEqual([2]);
    });

    it('is a no-op when no trashed board matches the id', () => {
      store.applyTrashBoardRemoved(999);
      expect(store.trash()).toEqual([]);
    });
  });

  describe('trash signal', () => {
    it('starts empty and not loading', () => {
      expect(store.trash()).toEqual([]);
      expect(store.trashLoading()).toBe(false);
    });

    it('loadTrash() populates the trash signal and clears the loading flag', async () => {
      const promise = store.loadTrash(7);
      // Loading flips on while in flight.
      expect(store.trashLoading()).toBe(true);

      const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/trashed`);
      req.flush({
        data: [
          {
            data: sampleBoardFn({ id: 11, name: 'Old board', deleted_at: '2026-07-10T00:00:00Z' }),
          },
        ],
        links: { first: '', last: '', prev: null, next: null },
        meta: {
          current_page: 1,
          from: 1,
          last_page: 1,
          per_page: 25,
          to: 1,
          total: 1,
          path: '',
        },
      });
      await promise;

      expect(store.trashLoading()).toBe(false);
      expect(store.trash()).toHaveLength(1);
      expect(store.trash()[0]?.id).toBe(11);
      expect(store.trash()[0]?.deleted_at).toBe('2026-07-10T00:00:00Z');
    });

    it('loadTrash() sets store.error and returns null on failure', async () => {
      const promise = store.loadTrash(7);
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/trashed`)
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });

      const result = await promise;
      expect(result).toBeNull();
      expect(store.error()).not.toBeNull();
      expect(store.trash()).toEqual([]);
      expect(store.trashLoading()).toBe(false);
    });

    it('loadTrash() appends ?page=N when page > 1', async () => {
      const promise = store.loadTrash(7, 2);
      const req = httpMock.expectOne((r) => r.params.get('page') === '2');
      req.flush({
        data: [],
        links: { first: '', last: '', prev: null, next: null },
        meta: {
          current_page: 2,
          from: null,
          last_page: 1,
          per_page: 25,
          to: null,
          total: 0,
          path: '',
        },
      });
      await promise;
      expect(store.trash()).toEqual([]);
    });
  });
});

/**
 * Helper used by the `pruneLabelFromCards()` tests. Drives the standard
 * `loadBoard` flow with the given per-column card lists. Every column
 * in `sampleDetail.columns` is flushed — columns not present in the
 * `perColumn` argument are flushed with an empty card list. This
 * mirrors the real `getBoardDetail` fan-out (one request per column).
 */
async function loadSampleDetailWithLabels(
  s: BoardsStore,
  mock: HttpTestingController,
  perColumn: ReadonlyArray<{ columnId: number; cards: KanbanCard[] }>,
): Promise<void> {
  const cardsByColumnId = new Map(perColumn.map((p) => [p.columnId, p.cards]));
  const promise = s.loadBoard(7, 4);
  mock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4`).flush(sampleDetail.board);
  mock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns`).flush({
    data: sampleDetail.columns,
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
  for (const column of sampleDetail.columns) {
    const cards = cardsByColumnId.get(column.id) ?? [];
    mock.expectOne(`${FULL_PREFIX}/projects/7/tasks/9/kanban/boards/4/columns/${column.id}/cards`).flush({
      data: cards,
      links: { first: '', last: '', prev: null, next: null },
      meta: {
        current_page: 1,
        from: cards.length > 0 ? 1 : null,
        last_page: 1,
        per_page: 25,
        to: cards.length > 0 ? cards.length : null,
        total: cards.length,
        path: '',
      },
    });
  }
  await promise;
}
