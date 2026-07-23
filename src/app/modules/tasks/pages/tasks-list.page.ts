import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ProjectService } from '../../../core/projects/project.service';
import { TasksService } from '../../../core/tasks/tasks.service';
import type { Task, TaskStatus } from '../../../core/tasks/task.model';
import { buildBoardRoute } from '../../kanban/utils/build-board-route';
import {
  TaskEditorDialog,
  type TaskEditorDialogData,
  type TaskEditorDialogResult,
} from '../components/task-editor-dialog/task-editor-dialog';

export type TaskFilter = TaskStatus | 'all';

export function filterTasks(tasks: readonly Task[], status: TaskFilter): readonly Task[] {
  return status === 'all' ? tasks : tasks.filter((task) => task.status === status);
}

@Component({
  selector: 'app-tasks-list-page',
  imports: [MatButtonModule, MatCardModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule],
  template: `
    <section class="tasks-page" aria-labelledby="tasks-title">
      <header class="tasks-header">
        <div class="tasks-header__text">
          <h1 id="tasks-title">Tasks</h1>
          <p>Select a task to open its Kanban board.</p>
        </div>
        <button mat-flat-button type="button" color="primary" class="tasks-header__cta" (click)="openEditor()">Create task</button>
      </header>

      <div class="tasks-toolbar">
        <mat-form-field appearance="outline" class="tasks-toolbar__filter">
          <mat-label>Status</mat-label>
          <mat-select [value]="status()" (selectionChange)="status.set($event.value)">
            <mat-option value="all">All</mat-option>
            <mat-option value="open">Open</mat-option>
            <mat-option value="in_progress">In progress</mat-option>
            <mat-option value="done">Done</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      @if (loading()) {
        <div role="status" class="tasks-state">Loading tasks…</div>
      } @else if (error()) {
        <p role="alert" class="tasks-state">
          Could not load tasks.
          <button mat-button type="button" (click)="reload()">Retry</button>
        </p>
      } @else if (visibleTasks().length === 0) {
        <mat-card class="tasks-empty">
          <mat-card-content>No tasks found. Create a task to start.</mat-card-content>
        </mat-card>
      } @else {
        <ul class="task-list" role="list">
          @for (task of visibleTasks(); track task.id) {
            <li class="task-item" role="listitem">
              <mat-card class="task-card">
                <mat-card-header>
                  <mat-card-title class="task-card__title">{{ task.name }}</mat-card-title>
                  <mat-card-subtitle class="task-card__status">{{ task.status }}</mat-card-subtitle>
                </mat-card-header>
                <mat-card-content class="task-card__body">
                  <p>{{ task.description || 'No description' }}</p>
                </mat-card-content>
                <mat-card-actions class="task-card__actions">
                  <button mat-flat-button type="button" color="primary" (click)="select(task)">Open Kanban</button>
                  <button mat-button type="button" (click)="openEditor(task)">Edit</button>
                </mat-card-actions>
              </mat-card>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      :host { display: block; }
      .tasks-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
      .tasks-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 1rem; }
      .tasks-header__text h1 { margin: 0 0 0.25rem; font-size: 1.75rem; }
      .tasks-header__text p { margin: 0; color: rgba(255, 255, 255, 0.7); }
      .tasks-header__cta { flex-shrink: 0; align-self: flex-start; }
      .tasks-toolbar { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
      .tasks-toolbar__filter { width: 220px; }
      .tasks-state { padding: 1.5rem; border-radius: 8px; background: rgba(255, 255, 255, 0.05); }
      .tasks-empty { padding: 1rem 1.5rem; }
      .task-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
      .task-item { display: block; }
      .task-card { height: 100%; display: flex; flex-direction: column; }
      .task-card__title { font-weight: 600; }
      .task-card__status { text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
      .task-card__body { flex: 1 1 auto; }
      .task-card__body p { margin: 0; color: rgba(255, 255, 255, 0.75); }
      .task-card__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0.5rem 1rem 1rem; }
    `,
  ],
  host: { '[attr.aria-busy]': 'loading()' },
})
export class TasksListPage {
  readonly projectId = input<string>();
  private readonly projects = inject(ProjectService);
  private readonly service = inject(TasksService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  protected readonly tasks = this.service.tasks;
  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly status = signal<TaskFilter>('all');
  protected readonly visibleTasks = computed(() => filterTasks(this.tasks(), this.status()));

  constructor() {
    effect(() => {
      const id = Number(this.projectId() ?? this.projects.currentId());
      if (Number.isInteger(id) && id > 0) void this.service.bootstrap(id);
    });
  }

  protected reload(): void {
    const id = Number(this.projectId() ?? this.projects.currentId());
    if (id > 0) void this.service.bootstrap(id);
  }

  protected select(task: Task): void {
    const projectId = task.project_id;
    if (this.projects.currentId() !== projectId) {
      this.projects.setActive({ id: projectId } as never);
    }
    this.service.setActive(task);
    void this.router.navigate(buildBoardRoute(projectId, task.id));
  }

  protected openEditor(task?: Task): void {
    const ref = this.dialog.open<TaskEditorDialog, TaskEditorDialogData, TaskEditorDialogResult>(TaskEditorDialog, { data: { task } });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result || result.action === 'cancel') return;
      const projectId = Number(this.projectId() ?? this.projects.currentId());
      if (result.action === 'saved' && result.task) {
        if (task) void this.service.update(projectId, task.id, result.task);
        else void this.service.create(projectId, result.task);
        return;
      }
      if (result.action === 'archived' && task) {
        void this.service.archive(projectId, task.id);
      }
    });
  }
}
