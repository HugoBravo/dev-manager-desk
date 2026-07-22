import { buildBoardRoute } from './build-board-route';

describe('buildBoardRoute', () => {
  it('builds the canonical boards-list route', () => {
    expect(buildBoardRoute(7, 2)).toEqual([
      '/modules/kanban/projects',
      7,
      'tasks',
      2,
      'boards',
    ]);
  });

  it('appends board path segments without aliases', () => {
    expect(buildBoardRoute(7, 2, 11, 'trash')).toEqual([
      '/modules/kanban/projects',
      7,
      'tasks',
      2,
      'boards',
      11,
      'trash',
    ]);
  });
});
