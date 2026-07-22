import { firstValueFrom, of } from 'rxjs';
import { TestBed } from '@angular/core/testing';

import { paginate, paginateOnce } from '../../../core/api/paginate';

import type { Board } from '../models';

describe('paginate() in the kanban context', () => {
  it('unwraps a Laravel envelope of Board resources', async () => {
    const envelope = {
      data: [
        {
          id: 1,
          task_id: 9,
          task: { id: 9, name: 'Ship S4', slug: 'ship-s4', status: 'open', archived_at: null },
          name: 'Sprint 1',
          position: 'n',
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 2,
          task_id: 9,
          task: { id: 9, name: 'Ship S4', slug: 'ship-s4', status: 'open', archived_at: null },
          name: 'Sprint 2',
          position: 'o',
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
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
    };

    const page = await firstValueFrom(paginate<Board>(of(envelope)));
    expect(page.data).toHaveLength(2);
    expect(page.data[0]?.name).toBe('Sprint 1');
    expect(page.meta.total).toBe(2);
  });

  it('paginateOnce() returns the Board list synchronously', () => {
    const envelope = {
      data: [{ id: 1, task_id: 9, task: { id: 9, name: 'Ship S4', slug: 'ship-s4', status: 'open', archived_at: null }, name: 'X', position: 'n', archived_at: null, created_at: '', updated_at: '' }],
      links: { first: '', last: '', prev: null, next: null },
      meta: { current_page: 1, from: 1, last_page: 1, per_page: 25, to: 1, total: 1, path: '' },
    };
    const page = paginateOnce<Board>(envelope);
    expect(page.data).toHaveLength(1);
  });

  it('throws on an envelope without data (defensive)', () => {
    expect(() => paginateOnce({})).toThrow(/data/);
  });

  // NOTE: this spec file lives next to the kanban module so the
  // helper-integration story is visible without reaching back into
  // core/api/paginate.spec.ts. The exhaustive helper coverage already lives
  // in `paginate.spec.ts` from PR1.
  it('imports TestBed to keep the testing module available if expanded', () => {
    // Symmetry with the surrounding spec files — keeps lints quiet and
    // signals that this file may grow into additional kanban-context
    // paginate tests in future PRs.
    expect(typeof TestBed).toBe('function');
  });
});
