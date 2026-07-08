import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import { KanbanApi } from '../api/kanban.api';
import type { BoardDetail, KanbanCard } from '../models';
import { BoardsStore } from './boards.store';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;

const sampleCard = (
  id: number,
  columnId: number,
  position = 'k',
): KanbanCard => ({
  id,
  column_id: columnId,
  title: `Card ${id}`,
  body: null,
  due_date: null,
  archived_at: null,
  position,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const sampleDetail: BoardDetail = {
  board: {
    id: 4,
    project_id: 7,
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
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`).flush({
      id: 4,
      project_id: 7,
      name: 'Sprint 42',
      position: 'n',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    httpMock
      .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns`)
      .flush({
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
    httpMock
      .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards`)
      .flush({
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
    httpMock
      .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/15/cards`)
      .flush({
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
      httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`).flush(
        sampleDetail.board,
      );
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns`)
        .flush({
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
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards`)
        .flush({
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
      httpMock
        .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/15/cards`)
        .flush({
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
  });

  it('applyCardRemoved() drops the card from its column', async () => {
    const promise = store.loadBoard(7, 4);
    httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4`).flush(
      sampleDetail.board,
    );
    httpMock
      .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns`)
      .flush({
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
    httpMock
      .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards`)
      .flush({
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
    httpMock
      .expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/15/cards`)
      .flush({
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
});