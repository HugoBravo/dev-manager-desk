import { firstValueFrom, of } from 'rxjs';

import { paginate, paginateOnce } from './paginate';

describe('paginate', () => {
  const envelope = {
    data: [{ id: 1 }, { id: 2 }],
    links: {
      first: 'http://api/v1/projects?page=1',
      last: 'http://api/v1/projects?page=4',
      prev: null,
      next: 'http://api/v1/projects?page=2',
    },
    meta: {
      current_page: 1,
      from: 1,
      last_page: 4,
      per_page: 25,
      to: 25,
      total: 87,
      path: 'http://api/v1/projects',
    },
  };

  it('paginateOnce() unwraps data, links, and meta', () => {
    const result = paginateOnce<{ id: number }>(envelope);
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.links.next).toBe('http://api/v1/projects?page=2');
    expect(result.meta.current_page).toBe(1);
    expect(result.meta.last_page).toBe(4);
    expect(result.meta.per_page).toBe(25);
    expect(result.meta.total).toBe(87);
  });

  it('paginate() exposes the envelope as a typed Observable', async () => {
    const result = await firstValueFrom(
      paginate<{ id: number }>(of(envelope)),
    );
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.meta.total).toBe(87);
  });

  it('throws on missing data', () => {
    expect(() => paginateOnce({})).toThrow(/data/);
  });
});
