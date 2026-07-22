/**
 * Re-export of the canonical `Task` types from `core/tasks`. The kanban
 * module references these shapes through the local barrel so consumers
 * can keep using `import { Task } from '@modules/kanban/models'` (the
 * established PR1 convention — see {@link Project}).
 *
 * The upstream model is the single source of truth: do not duplicate the
 * shape here. If a future task surface adds a kanban-specific field, add
 * it to `core/tasks/task.model.ts` and re-export through here.
 */
export type { Task, TaskPatch, TaskStatus, TaskSummary } from '../../../core/tasks/task.model';
