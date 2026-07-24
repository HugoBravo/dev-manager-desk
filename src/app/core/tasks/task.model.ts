export type TaskStatus = 'open' | 'in_progress' | 'done';

export type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export const TASK_PRIORITIES: readonly TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW'];

/** Uppercase wire values — `URGENT` and lowercase inputs are rejected by the backend. */
export interface Task {
  readonly id: number;
  readonly project_id: number;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Writable fields. `priority` is optional so callers can omit it on
 * create (the backend defaults to `MEDIUM`) and on update (which then
 * preserves the current value).
 */
export type TaskPatch = Partial<Pick<Task, 'name' | 'description' | 'status' | 'priority'>>;

export type TaskSummary = Pick<
  Task,
  'id' | 'name' | 'slug' | 'status' | 'priority' | 'archived_at'
>;