import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import { CommentsApi } from './comments.api';

const API_BASE_URL = 'http://localhost:8000/api';
const FULL_PREFIX = `${API_BASE_URL}/v1`;
const commentsBase = (p: number, t: number, b: number, c: number, card: number) =>
  `${FULL_PREFIX}/projects/${p}/tasks/${t}/kanban/boards/${b}/columns/${c}/cards/${card}/comments`;

describe('CommentsApi', () => {
  let httpMock: HttpTestingController;
  let api: CommentsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        CommentsApi,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    api = TestBed.inject(CommentsApi);
  });

  afterEach(() => httpMock.verify());

  it('listComments GETs the comments endpoint and unwraps data (task-scoped URL chain)', async () => {
    const promise = firstValueFrom(api.listComments(7, 9, 4, 12, 87));
    const req = httpMock.expectOne(commentsBase(7, 9, 4, 12, 87));
    expect(req.request.method).toBe('GET');
    req.flush({
      data: [
        {
          id: 311,
          card_id: 87,
          parent_id: null,
          author_id: 1,
          body: 'Looks good.',
          created_at: '2026-07-07T15:42:18.000000Z',
          updated_at: '2026-07-07T15:42:18.000000Z',
        },
      ],
      links: {},
      meta: {},
    });
    const list = await promise;
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(311);
  });

  it('createComment POSTs the body to the comments endpoint (task-scoped URL chain)', async () => {
    const promise = firstValueFrom(
      api.createComment(7, 9, 4, 12, 87, { body: 'new comment' }),
    );
    const req = httpMock.expectOne(commentsBase(7, 9, 4, 12, 87));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'new comment' });
    req.flush({
      id: 312,
      card_id: 87,
      parent_id: null,
      author_id: 1,
      body: 'new comment',
      created_at: '2026-07-07T15:42:18.000000Z',
      updated_at: '2026-07-07T15:42:18.000000Z',
    });
    const created = await promise;
    expect(created.body).toBe('new comment');
  });

  it('updateComment PATCHes the body under the task-scoped URL chain', async () => {
    const promise = firstValueFrom(
      api.updateComment(7, 9, 4, 12, 87, 311, { body: 'edited' }),
    );
    const req = httpMock.expectOne(`${commentsBase(7, 9, 4, 12, 87)}/311`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ body: 'edited' });
    req.flush({
      id: 311,
      card_id: 87,
      parent_id: null,
      author_id: 1,
      body: 'edited',
      created_at: '2026-07-07T15:42:18.000000Z',
      updated_at: '2026-07-07T15:46:18.000000Z',
    });
    const updated = await promise;
    expect(updated.id).toBe(311);
    expect(updated.body).toBe('edited');
  });

  it('deleteComment DELETEs the comment endpoint under the task-scoped URL chain', async () => {
    const promise = firstValueFrom(api.deleteComment(7, 9, 4, 12, 87, 311));
    const req = httpMock.expectOne(`${commentsBase(7, 9, 4, 12, 87)}/311`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;
  });

  it('403 on PATCH /comments/{id} surfaces as forbidden + edit_window_expired (URL heuristic)', async () => {
    const promise = firstValueFrom(
      api.updateComment(7, 9, 4, 12, 87, 311, { body: 'edited' }),
    );
    const req = httpMock.expectOne(`${commentsBase(7, 9, 4, 12, 87)}/311`);
    req.flush(
      { message: 'This action is unauthorized.' },
      { status: 403, statusText: 'Forbidden' },
    );
    await expect(promise).rejects.toEqual(
      expect.objectContaining({
        kind: 'forbidden',
        status: 403,
        code: 'edit_window_expired',
      }),
    );
  });

  it('403 on DELETE /comments/{id} surfaces as forbidden + edit_window_expired', async () => {
    const promise = firstValueFrom(api.deleteComment(7, 9, 4, 12, 87, 311));
    const req = httpMock.expectOne(`${commentsBase(7, 9, 4, 12, 87)}/311`);
    req.flush(
      { message: 'This action is unauthorized.' },
      { status: 403, statusText: 'Forbidden' },
    );
    await expect(promise).rejects.toEqual(
      expect.objectContaining({
        kind: 'forbidden',
        status: 403,
        code: 'edit_window_expired',
      }),
    );
  });
});

function firstValueFrom<T>(source: import('rxjs').Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.subscribe({ next: resolve, error: reject });
  });
}