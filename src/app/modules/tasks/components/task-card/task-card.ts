import { Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import type { Task, TaskPriority } from '../../../../core/tasks/task.model';

export interface PriorityChip {
  readonly value: TaskPriority;
  readonly label: string;
  readonly icon: string;
}

const PRIORITY_CHIP: Readonly<Record<TaskPriority, PriorityChip>> = {
  HIGH: { value: 'HIGH', label: 'High', icon: 'priority_high' },
  MEDIUM: { value: 'MEDIUM', label: 'Medium', icon: 'drag_handle' },
  LOW: { value: 'LOW', label: 'Low', icon: 'low_priority' },
};

export function priorityChip(priority: TaskPriority): PriorityChip {
  return PRIORITY_CHIP[priority];
}

@Component({
  selector: 'app-task-card',
  imports: [MatCardModule, MatIconModule],
  template: `
    @if (task(); as currentTask) {
      <mat-card class="task-card">
        <mat-card-header>
          <mat-card-title class="task-card__title" data-testid="task-name">{{ currentTask.name }}</mat-card-title>
          <mat-card-subtitle class="task-card__status" data-testid="task-status">{{ currentTask.status }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="task-card__body">
          <span
            class="task-card__priority"
            [class.task-card__priority--high]="currentTask.priority === 'HIGH'"
            [class.task-card__priority--medium]="currentTask.priority === 'MEDIUM'"
            [class.task-card__priority--low]="currentTask.priority === 'LOW'"
            data-testid="task-priority"
            [attr.data-priority]="currentTask.priority"
            [attr.aria-label]="'Priority ' + priority().label"
          >
            <mat-icon aria-hidden="true" class="task-card__priority-icon">{{ priority().icon }}</mat-icon>
            <span class="task-card__priority-label">{{ priority().label }}</span>
          </span>
          <p data-testid="task-description">{{ currentTask.description || 'No description' }}</p>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    :host { display: block; height: 100%; }
    .task-card { height: 100%; display: flex; flex-direction: column; }
    .task-card__title { font-weight: 600; }
    .task-card__status { text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
    .task-card__body { flex: 1 1 auto; display: flex; flex-direction: column; gap: 0.75rem; }
    .task-card__body p { margin: 0; color: var(--mat-sys-on-surface-variant); }
    .task-card__priority { display: inline-flex; align-items: center; gap: 0.375rem; align-self: flex-start; padding: 0.25rem 0.625rem; border-radius: 999px; border: 1px solid var(--mat-sys-outline-variant); background: var(--mat-sys-surface-container-high); color: var(--mat-sys-on-surface); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
    .task-card__priority-icon { font-size: 0.875rem; width: 0.875rem; height: 0.875rem; line-height: 0.875rem; }
    .task-card__priority--high { background: var(--mat-sys-error-container); border-color: var(--mat-sys-error); color: var(--mat-sys-on-error-container); }
    .task-card__priority--medium { background: var(--mat-sys-tertiary-container); border-color: var(--mat-sys-tertiary); color: var(--mat-sys-on-tertiary-container); }
    .task-card__priority--low { background: var(--mat-sys-secondary-container); border-color: var(--mat-sys-secondary); color: var(--mat-sys-on-secondary-container); }
  `,
})
export class TaskCard {
  readonly task = input<Task | undefined>(undefined);
  protected readonly priority = computed(() => {
    const currentTask = this.task();
    return priorityChip(currentTask?.priority ?? 'MEDIUM');
  });
}
