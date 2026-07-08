import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { API_CONFIG } from '../../../core/config/api-config';
import { AuthService } from '../../../core/auth/auth.service';
import { CommentsStore, COMMENT_EDIT_WINDOW_MS } from './comments.store';
import type { KanbanComment } from '../models';

const API_BASE_URL = 'http://localhost:8000/api';

const sampleComment = (overrides: Partial<KanbanComment> = {}): KanbanComment => ({
  id: 311,
  card_id: 87,
  parent_id: null,
  author_id: 1,
  body: 'Looks good.',
  created_at: '2026-07-07T15:42:18.000000Z',
  updated_at: '2026-07-07T15:42:18.000000Z',
  ...overrides,
});

/**
 * Build a TestBed that wires the CommentsStore with a controllable
 * AuthService stub. Returns the store + the stub so individual tests can
 * mutate the auth signal as needed.
 */
function setupStore(authUser: unknown): {
  store: CommentsStore;
  authStub: { user: ReturnType<typeof signal<unknown>> };
  httpMock: HttpTestingController;
} {
  const authStub = { user: signal<unknown>(authUser) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      CommentsStore,
      { provide: AuthService, useValue: authStub },
    ],
  });
  const store = TestBed.inject(CommentsStore);
  const httpMock = TestBed.inject(HttpTestingController);
  return { store, authStub, httpMock };
}

describe('CommentsStore — canEdit()', () => {
  let now: number;
  beforeEach(() => {
    // Stub `Date.now` so the window-boundary tests are deterministic.
    now = Date.parse('2026-07-07T16:00:00.000000Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns true when the user is the author AND the comment was updated < 15 min ago', () => {
    const { store } = setupStore({ id: 1, email: 'me@example.com', name: 'Me', email_verified_at: null });
    const comment = sampleComment({
      author_id: 1,
      updated_at: '2026-07-07T15:46:00.000000Z', // 14 min before "now" (16:00)
    });
    expect(store.canEdit(comment)).toBe(true);
  });

  it('returns false when the user is NOT the author (regardless of time)', () => {
    const { store } = setupStore({ id: 1, email: 'me@example.com', name: 'Me', email_verified_at: null });
    const comment = sampleComment({
      author_id: 2,
      updated_at: '2026-07-07T15:50:00.000000Z', // 10 min ago — within window
    });
    expect(store.canEdit(comment)).toBe(false);
  });

  it('returns false at exactly 15 min after updated_at (window is strict <)', () => {
    const { store } = setupStore({ id: 1, email: 'me@example.com', name: 'Me', email_verified_at: null });
    // 14 min 59 s 999 ms before now: INSIDE the window
    const justInside = sampleComment({
      author_id: 1,
      updated_at: '2026-07-07T15:45:00.001000Z',
    });
    expect(store.canEdit(justInside)).toBe(true);
    // 15 min exactly before now: OUTSIDE (strict <)
    const exactlyAt = sampleComment({
      author_id: 1,
      updated_at: '2026-07-07T15:45:00.000000Z',
    });
    expect(store.canEdit(exactlyAt)).toBe(false);
    // Well outside
    const wellOutside = sampleComment({
      author_id: 1,
      updated_at: '2026-07-07T15:30:00.000000Z', // 30 min ago
    });
    expect(store.canEdit(wellOutside)).toBe(false);
  });

  it('returns false when there is no current user', () => {
    const { store } = setupStore(null);
    const comment = sampleComment({
      author_id: 1,
      updated_at: '2026-07-07T15:55:00.000000Z', // 5 min ago
    });
    expect(store.canEdit(comment)).toBe(false);
  });

  it('compares author_id as string (user.id can be number OR string per auth.types)', () => {
    const { store } = setupStore({ id: '42', email: 'a@b.com', name: 'X', email_verified_at: null });
    const comment = sampleComment({
      author_id: 42,
      updated_at: '2026-07-07T15:55:00.000000Z',
    });
    expect(store.canEdit(comment)).toBe(true);
  });

  it('returns false for an unparseable updated_at (defensive)', () => {
    const { store } = setupStore({ id: 1, email: 'me@example.com', name: 'Me', email_verified_at: null });
    const comment = sampleComment({
      author_id: 1,
      updated_at: 'not-a-date',
    });
    expect(store.canEdit(comment)).toBe(false);
  });

  it('uses COMMENT_EDIT_WINDOW_MS = 15 minutes (export constant guard)', () => {
    expect(COMMENT_EDIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe('CommentsStore — groupThreads (thread-per-author)', () => {
  it('groups a top-level comment + same-author reply into the same thread', async () => {
    const { store, httpMock } = setupStore({ id: 1, email: 'me@example.com', name: 'Me', email_verified_at: null });
    const comments = [
      sampleComment({ id: 311, parent_id: null, author_id: 1, body: 'A1' }),
      sampleComment({ id: 312, parent_id: 311, author_id: 1, body: 'A2' }),
    ];
    const loadPromise = store.load(7, 4, 12, 87);
    const req = httpMock.expectOne(
      'http://localhost:8000/api/v1/projects/7/kanban/boards/4/columns/12/cards/87/comments',
    );
    req.flush({ data: comments });
    await loadPromise;
    const threads = store.threads();
    expect(threads).toHaveLength(1);
    expect(threads[0]).toHaveLength(2);
    expect(threads[0]?.[0]?.id).toBe(311);
    expect(threads[0]?.[1]?.id).toBe(312);
    httpMock.verify();
  });

  it('starts a new thread for a different-author comment (api-doc §14)', async () => {
    const { store, httpMock } = setupStore({ id: 1, email: 'me@example.com', name: 'Me', email_verified_at: null });
    const comments = [
      sampleComment({ id: 311, parent_id: null, author_id: 1, body: 'A1' }),
      sampleComment({ id: 312, parent_id: null, author_id: 2, body: 'B1' }),
    ];
    const loadPromise = store.load(7, 4, 12, 87);
    const req = httpMock.expectOne(
      'http://localhost:8000/api/v1/projects/7/kanban/boards/4/columns/12/cards/87/comments',
    );
    req.flush({ data: comments });
    await loadPromise;
    const threads = store.threads();
    expect(threads).toHaveLength(2);
    httpMock.verify();
  });
});