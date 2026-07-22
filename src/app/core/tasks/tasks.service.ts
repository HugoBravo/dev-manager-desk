import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { Task, TaskPatch, TaskStatus } from './task.model';
import { TasksApi } from './tasks.api';

const STORAGE_KEY = 'dev-manager-desk:task:selected';

@Service()
export class TasksService {
  private readonly api = inject(TasksApi);
  private readonly _tasks = signal<readonly Task[]>([]);
  private readonly _currentId = signal<number | null>(this.readStoredId());
  private readonly _projectId = signal<number | null>(null);
  private readonly _bootstrapped = signal(false);
  private readonly _loading = signal(false);
  private readonly _error = signal<unknown>(null);

  readonly tasks = this._tasks.asReadonly();
  readonly currentId = this._currentId.asReadonly();
  readonly current = computed(() =>
    this._tasks().find((task) => task.id === this._currentId()) ?? null,
  );
  readonly isBootstrapped = this._bootstrapped.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  async bootstrap(projectId: number, includeArchived = false): Promise<void> {
    if (this._projectId() === projectId && this._bootstrapped()) {
      return;
    }
    this._projectId.set(projectId);
    this._bootstrapped.set(false);
    this._loading.set(true);
    this._error.set(null);
    try {
      const tasks = await firstValueFrom(this.api.list(projectId, includeArchived));
      this._tasks.set(tasks);
      const selectedId = this._currentId();
      if (selectedId !== null && !tasks.some((task) => task.id === selectedId)) {
        this.setActive(null);
      }
    } catch (error) {
      this._error.set(error);
    } finally {
      this._loading.set(false);
      this._bootstrapped.set(true);
    }
  }

  setActive(task: Task | null): void {
    this._currentId.set(task?.id ?? null);
    this.persistId(task?.id ?? null);
  }

  async create(projectId: number, input: TaskPatch & Pick<Task, 'name'>): Promise<Task> {
    const task = await firstValueFrom(this.api.create(projectId, input));
    this._tasks.update((tasks) => [task, ...tasks]);
    this.setActive(task);
    return task;
  }

  async update(projectId: number, taskId: number, patch: TaskPatch): Promise<Task> {
    const task = await firstValueFrom(this.api.update(projectId, taskId, patch));
    this.replace(task);
    return task;
  }

  async archive(projectId: number, taskId: number): Promise<Task> {
    const task = await firstValueFrom(this.api.archive(projectId, taskId));
    this._tasks.update((tasks) => tasks.filter((item) => item.id !== taskId));
    if (this._currentId() === taskId) {
      this.setActive(null);
    }
    return task;
  }

  async restore(projectId: number, taskId: number): Promise<Task> {
    const task = await firstValueFrom(this.api.restore(projectId, taskId));
    this._tasks.update((tasks) => [task, ...tasks.filter((item) => item.id !== taskId)]);
    return task;
  }

  filter(status: TaskStatus | 'all'): readonly Task[] {
    return status === 'all' ? this._tasks() : this._tasks().filter((task) => task.status === status);
  }

  private replace(task: Task): void {
    this._tasks.update((tasks) => tasks.map((item) => (item.id === task.id ? task : item)));
  }

  private readStoredId(): number | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = Number(raw);
    return raw !== null && Number.isInteger(value) && value > 0 ? value : null;
  }

  private persistId(id: number | null): void {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  }
}
