export type TaskStatus = 'open' | 'in_progress' | 'done';

export interface Task {
  readonly id: number;
  readonly project_id: number;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export type TaskPatch = Partial<Pick<Task, 'name' | 'description' | 'status'>>;

export type TaskSummary = Pick<
  Task,
  'id' | 'name' | 'slug' | 'status' | 'archived_at'
>;
