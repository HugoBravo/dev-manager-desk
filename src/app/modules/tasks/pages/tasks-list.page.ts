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
        <div><h1 id="tasks-title">Tasks</h1><p>Select a task to open its Kanban board.</p></div>
        <button mat-flat-button type="button" (click)="openEditor()">Create task</button>
      </header>
      <mat-form-field appearance="outline"><mat-label>Status</mat-label>
        <mat-select [value]="status()" (selectionChange)="status.set($event.value)">
          <mat-option value="all">All</mat-option><mat-option value="open">Open</mat-option>
          <mat-option value="in_progress">In progress</mat-option><mat-option value="done">Done</mat-option>
        </mat-select>
      </mat-form-field>
      @if (loading()) { <div role="status">Loading tasks…</div> }
      @else if (error()) { <p role="alert">Could not load tasks. <button mat-button type="button" (click)="reload()">Retry</button></p> }
      @else if (visibleTasks().length === 0) { <mat-card><mat-card-content>No tasks found. Create a task to start.</mat-card-content></mat-card> }
      @else { <div class="task-list" role="list">
        @for (task of visibleTasks(); track task.id) {
          <mat-card role="listitem"><mat-card-header><mat-card-title>{{ task.name }}</mat-card-title></mat-card-header>
            <mat-card-content><p>{{ task.description || 'No description' }}</p><span>{{ task.status }}</span></mat-card-content>
            <mat-card-actions><button mat-button type="button" (click)="select(task)">Open Kanban</button><button mat-button type="button" (click)="openEditor(task)">Edit</button></mat-card-actions>
          </mat-card>
        }
      </div> }
    </section>
  `,
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
      if (!result || result.action !== 'saved' || !result.task) return;
      const projectId = Number(this.projectId() ?? this.projects.currentId());
      if (task) void this.service.update(projectId, task.id, result.task);
      else void this.service.create(projectId, result.task);
    });
  }
}
