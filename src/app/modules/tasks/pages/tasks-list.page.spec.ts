import { filterTasks } from './tasks-list.page';
import type { Task } from '../../../core/tasks/task.model';

const tasks: Task[] = [
  { id: 1, project_id: 7, name: 'Open', slug: 'open', description: null, status: 'open', archived_at: null, created_at: '', updated_at: '' },
  { id: 2, project_id: 7, name: 'Done', slug: 'done', description: null, status: 'done', archived_at: null, created_at: '', updated_at: '' },
];

describe('filterTasks', () => {
  it('returns only tasks matching the selected status', () => {
    expect(filterTasks(tasks, 'done')).toEqual([tasks[1]]);
  });

  it('returns every task for the all filter', () => {
    expect(filterTasks(tasks, 'all')).toEqual(tasks);
  });
});
