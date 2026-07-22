import { HttpErrorResponse } from '@angular/common/http';

import { ErrorNormalizer } from './error-normalizer';

describe('ErrorNormalizer', () => {
  describe('status matrix', () => {
    it('401 -> unauthorized', () => {
      const r = ErrorNormalizer.normalize(401, { message: 'Unauthenticated.' });
      expect(r.kind).toBe('unauthorized');
      if (r.kind === 'unauthorized') expect(r.message).toBe('Unauthenticated.');
    });

    it('0 (network) -> network with fallback', () => {
      const r = ErrorNormalizer.normalize(0, { message: '' });
      expect(r.kind).toBe('network');
      if (r.kind === 'network') expect(r.message.length).toBeGreaterThan(0);
    });

    it('429 -> http (rate-limited)', () => {
      const r = ErrorNormalizer.normalize(429, { message: 'Too many' });
      expect(r.kind).toBe('http');
      if (r.kind === 'http') expect(r.status).toBe(429);
    });

    it('5xx -> http', () => {
      const r = ErrorNormalizer.normalize(503, { message: 'down' });
      expect(r.kind).toBe('http');
      if (r.kind === 'http') expect(r.status).toBe(503);
    });

    it('unknown 4xx -> http', () => {
      const r = ErrorNormalizer.normalize(418, null);
      expect(r.kind).toBe('http');
    });
  });

  describe('404 collapse (existence-leak prevention)', () => {
    it('collapses missing-resource 404', () => {
      const r = ErrorNormalizer.normalize(404, { message: 'No model 99' });
      expect(r.kind).toBe('notFound');
    });

    it('collapses cross-owner 404 identically', () => {
      const r = ErrorNormalizer.normalize(
        404,
        { message: '' },
        { url: 'http://localhost:8000/api/v1/projects/999/kanban/boards/42' },
      );
      expect(r.kind).toBe('notFound');
    });

    it('produces INDISTINGUISHABLE notFound for both cases (same toUserMessage)', () => {
      const missing = ErrorNormalizer.normalize(404, { message: 'whatever' });
      const cross = ErrorNormalizer.normalize(
        404,
        { message: 'leaky' },
        { url: 'http://localhost:8000/api/v1/projects/999/kanban/boards/42' },
      );
      expect(ErrorNormalizer.toUserMessage(missing)).toBe(
        ErrorNormalizer.toUserMessage(cross),
      );
    });
  });

  describe('403 special-case (edit_window_expired)', () => {
    const commentUrl =
      'http://localhost:8000/api/v1/projects/1/kanban/boards/4/columns/12/cards/87/comments/311';
    const boardUrl =
      'http://localhost:8000/api/v1/projects/1/kanban/boards/4';

    it('PATCH /comments/{id} -> edit_window_expired', () => {
      const r = ErrorNormalizer.normalize(403, { message: 'Forbidden' }, { url: commentUrl });
      if (r.kind !== 'forbidden') throw new Error('expected forbidden');
      expect(r.code).toBe('edit_window_expired');
    });

    it('DELETE /comments/{id} -> edit_window_expired', () => {
      const r = ErrorNormalizer.normalize(403, { message: 'Forbidden' }, { url: commentUrl });
      if (r.kind !== 'forbidden') throw new Error('expected forbidden');
      expect(r.code).toBe('edit_window_expired');
    });

    it('non-comment 403 -> forbidden (no code)', () => {
      const r = ErrorNormalizer.normalize(403, { message: 'Forbidden' }, { url: boardUrl });
      if (r.kind !== 'forbidden') throw new Error('expected forbidden');
      expect(r.code).toBeUndefined();
    });

    // RED GUARD (kanban-per-task S0): the comment edit-window discriminator
    // must recognize the new task-scoped chain. The path-segment matcher
    // inspects only the last two segments, so this should already pass with
    // the current implementation — but the test is locked in BEFORE any
    // URL-shape refactor so a regression in S1+ cannot silently drop
    // task-scoped comments out of the edit_window_expired branch.
    it('task-scoped /tasks/{id}/kanban/.../comments/{id} -> edit_window_expired', () => {
      const taskScopedCommentUrl =
        'http://localhost:8000/api/v1/projects/1/tasks/1/kanban/boards/1/comments/9';
      const r = ErrorNormalizer.normalize(
        403,
        { message: 'Forbidden' },
        { url: taskScopedCommentUrl },
      );
      if (r.kind !== 'forbidden') throw new Error('expected forbidden');
      expect(r.code).toBe('edit_window_expired');
    });

    it('prefers X-Kanban-Realm: comment header over URL heuristic', () => {
      const r = ErrorNormalizer.normalize(
        403,
        { message: 'Forbidden' },
        { url: boardUrl, headers: { 'X-Kanban-Realm': 'comment' } },
      );
      if (r.kind !== 'forbidden') throw new Error('expected forbidden');
      expect(r.code).toBe('edit_window_expired');
    });
  });

  describe('409 typed codes', () => {
    it('preserves board_has_contents', () => {
      const r = ErrorNormalizer.normalize(409, {
        message: 'Board has columns; cannot delete.',
        code: 'board_has_contents',
      });
      if (r.kind !== 'conflict') throw new Error('expected conflict');
      expect(r.code).toBe('board_has_contents');
    });

    it('preserves column_has_contents', () => {
      const r = ErrorNormalizer.normalize(409, {
        message: '...',
        code: 'column_has_contents',
      });
      if (r.kind !== 'conflict') throw new Error('expected conflict');
      expect(r.code).toBe('column_has_contents');
    });

    it('untyped 409 still maps to conflict', () => {
      const r = ErrorNormalizer.normalize(409, { message: 'Conflict' });
      expect(r.kind).toBe('conflict');
    });

    it('untyped 409 leaves `code` undefined (no leaked `board_has_contents`)', () => {
      // Spec F1 + scenario 7: an arbitrary 409 must NOT carry a typed
      // code; the UI must fall back to a generic message. Previously the
      // normalizer force-narrowed to `'board_has_contents'`, which misled
      // users into "move columns first" copy for unrelated conflicts.
      const r = ErrorNormalizer.normalize(409, { message: 'Conflict' });
      if (r.kind !== 'conflict') throw new Error('expected conflict');
      expect(r.code).toBeUndefined();
      expect(r.message).toBe('Conflict');
    });

    it('untyped 409 toUserMessage falls back to generic conflict copy', () => {
      const r = ErrorNormalizer.normalize(409, { message: 'Conflict' });
      expect(ErrorNormalizer.toUserMessage(r)).toBe(
        'This action conflicts with the current state.',
      );
    });
  });

  describe('422 typed codes', () => {
    it('preserves attachment_mime_blocked with fieldErrors', () => {
      const r = ErrorNormalizer.normalize(422, {
        message: '...',
        errors: { file: ['type not allowed'] },
        code: 'attachment_mime_blocked',
      });
      if (r.kind !== 'validation') throw new Error('expected validation');
      expect(r.code).toBe('attachment_mime_blocked');
      expect(r.fieldErrors).toEqual({ file: ['type not allowed'] });
    });

    it('preserves position_exhausted with empty fieldErrors', () => {
      const r = ErrorNormalizer.normalize(422, {
        message: '...',
        code: 'position_exhausted',
      });
      if (r.kind !== 'validation') throw new Error('expected validation');
      expect(r.code).toBe('position_exhausted');
      expect(r.fieldErrors).toEqual({});
    });

    it('generic 422 -> validation (no code)', () => {
      const r = ErrorNormalizer.normalize(422, {
        message: '...',
        errors: { title: ['required'] },
      });
      if (r.kind !== 'validation') throw new Error('expected validation');
      expect(r.code).toBeUndefined();
      expect(r.fieldErrors).toEqual({ title: ['required'] });
    });
  });

  describe('HttpErrorResponse integration', () => {
    it('accepts an HttpErrorResponse directly', () => {
      const err = new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        error: { message: 'gone' },
        url: '/api/v1/projects/1/kanban/boards/4',
      });
      const r = ErrorNormalizer.normalize(err);
      expect(r.kind).toBe('notFound');
    });
  });

  describe('toUserMessage', () => {
    it('returns ONE locked notFound message regardless of cause', () => {
      const m1 = ErrorNormalizer.toUserMessage(
        ErrorNormalizer.normalize(404, { message: 'whatever' }),
      );
      const m2 = ErrorNormalizer.toUserMessage(
        ErrorNormalizer.normalize(
          404,
          { message: 'whatever' },
          { url: 'http://localhost:8000/api/v1/projects/999/kanban/boards/42' },
        ),
      );
      expect(m1).toBe(m2);
      expect(m1).toBe('Not found or you do not have access.');
    });

    it('edit_window_expired -> distinct copy', () => {
      const r = ErrorNormalizer.normalize(
        403,
        { message: 'Forbidden' },
        { url: 'http://localhost:8000/api/v1/projects/1/kanban/boards/4/columns/1/cards/1/comments/1' },
      );
      expect(ErrorNormalizer.toUserMessage(r)).toContain('edit window');
    });

    it('generic 403 -> forbidden copy', () => {
      const r = ErrorNormalizer.normalize(403, { message: 'Forbidden' });
      expect(ErrorNormalizer.toUserMessage(r)).toBe(
        'You are not allowed to perform this action.',
      );
    });

    it('board_has_contents -> column-mention copy', () => {
      const r = ErrorNormalizer.normalize(409, { code: 'board_has_contents', message: '...' });
      expect(ErrorNormalizer.toUserMessage(r)).toContain('columns');
    });

    it('429 -> rate-limited copy', () => {
      const r = ErrorNormalizer.normalize(429, { message: '...' });
      expect(ErrorNormalizer.toUserMessage(r)).toContain('Too many');
    });
  });
});
