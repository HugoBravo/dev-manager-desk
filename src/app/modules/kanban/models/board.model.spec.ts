import type { Board } from './board.model';
import type { TaskSummary } from '../../../core/tasks/task.model';

/**
 * S4 contract: a `Board` is now owned by a `Task` (not directly by a
 * `Project`). The wire shape carries the task id on the FK column AND
 * embeds the lightweight `TaskSummary` so the UI can render the board
 * header without an extra round-trip.
 *
 * Runtime assertions here exercise the structural contract; the
 * TypeScript compiler enforces it at build time.
 */
describe('Board model (kanban-per-task ownership)', () => {
  const sampleTask: TaskSummary = {
    id: 9,
    name: 'Ship S4',
    slug: 'ship-s4',
    status: 'open',
    priority: 'MEDIUM',
    archived_at: null,
  };

  it('carries task_id (the foreign key to tasks)', () => {
    const board: Board = {
      id: 4,
      task_id: 9,
      task: sampleTask,
      name: 'Sprint 42',
      position: 'n',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    expect(board.task_id).toBe(9);
  });

  it('embeds a TaskSummary so the UI does not need a second round-trip', () => {
    const board: Board = {
      id: 4,
      task_id: 9,
      task: sampleTask,
      name: 'Sprint 42',
      position: 'n',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    expect(board.task).toEqual(sampleTask);
    expect(board.task.id).toBe(9);
    expect(board.task.name).toBe('Ship S4');
  });

  it('NO LONGER carries a project_id (board belongs to task, not project)', () => {
    // Structural assertion: a Board is not assignable from a value that
    // carries `project_id` instead of `task_id`. We use a dummy branch
    // guarded at runtime so the type-system check is enforced by
    // TypeScript: if `project_id` were still allowed, the assignment
    // would compile, and this assertion would be trivially true. By
    // keeping the type explicit we lock the wire shape.
    const board: Board = {
      id: 4,
      task_id: 9,
      task: sampleTask,
      name: 'Sprint 42',
      position: 'n',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    // @ts-expect-error — `project_id` is not part of the S4 Board shape
    void board.project_id;
    expect(true).toBe(true);
  });
});
