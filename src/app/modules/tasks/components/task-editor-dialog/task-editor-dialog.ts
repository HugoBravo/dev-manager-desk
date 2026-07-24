import { Component, ElementRef, inject, signal, viewChild, viewChildren } from '@angular/core';
import { FormField, form, required, submit, validate, maxLength } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import type { Task, TaskPatch, TaskPriority } from '../../../../core/tasks/task.model';

export interface TaskEditorDialogData { readonly task?: Task; }
export interface TaskEditorDialogResult { readonly action: 'saved' | 'cancel' | 'archived'; readonly task?: TaskPatch & Pick<Task, 'name'>; }
interface TaskFormModel { name: string; description: string; status: Task['status']; priority: TaskPriority; }

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

export function normalizeTaskDescription(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

@Component({
  selector: 'app-task-editor-dialog',
  imports: [FormField, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule],
  template: `
    <header class="task-editor__header" mat-dialog-title>
      <div class="task-editor__icon" aria-hidden="true">
        <mat-icon>{{ data.task ? 'edit_note' : 'add_task' }}</mat-icon>
      </div>
      <div class="task-editor__titles">
        <h2 id="task-editor-title">{{ data.task ? 'Edit task' : 'Create task' }}</h2>
        <p id="task-editor-subtitle">{{ data.task ? 'Update the task details.' : 'Give the task a clear name, status, and priority.' }}</p>
      </div>
      <button mat-icon-button type="button" class="task-editor__close" aria-label="Close dialog" (click)="cancel()">
        <mat-icon>close</mat-icon>
      </button>
    </header>

    <form id="task-form" class="task-editor__form" mat-dialog-content (submit)="save($event)">
      <mat-form-field appearance="outline" class="task-editor__field">
        <mat-label>Name</mat-label>
        <input #nameInput matInput type="text" [formField]="taskForm.name" autocomplete="off" aria-describedby="task-name-hint" />
        <mat-icon matIconSuffix aria-hidden="true">title</mat-icon>
        <mat-hint id="task-name-hint" align="end">{{ taskForm.name().value().length }}/{{ NAME_MAX }}</mat-hint>
        <mat-error>A name is required (max {{ NAME_MAX }} characters).</mat-error>
      </mat-form-field>

      <mat-form-field appearance="outline" class="task-editor__field">
        <mat-label>Description</mat-label>
        <textarea matInput [formField]="taskForm.description" rows="4" placeholder="What is this task about?"></textarea>
        <mat-icon matIconPrefix aria-hidden="true">notes</mat-icon>
        <mat-hint align="end">{{ taskForm.description().value().length }}/{{ DESCRIPTION_MAX }}</mat-hint>
      </mat-form-field>

      <div class="task-editor__status">
        <p class="task-editor__status-label" id="task-status-label">Status</p>
        <div class="task-editor__status-options" role="radiogroup" aria-labelledby="task-status-label">
          @for (option of statusOptions; track option.value) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="taskForm.status().value() === option.value"
              [class.is-active]="taskForm.status().value() === option.value"
              class="task-editor__status-chip"
              (click)="setStatus(option.value)"
              [attr.tabindex]="taskForm.status().value() === option.value ? 0 : -1"
            >
              <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
              <span>{{ option.label }}</span>
            </button>
          }
        </div>
        <p class="task-editor__status-hint" aria-live="polite">
          <mat-icon aria-hidden="true">{{ currentStatus().icon }}</mat-icon>
          <span>{{ currentStatus().description }}</span>
        </p>
      </div>

      <div class="task-editor__priority">
        <p class="task-editor__priority-label" id="task-priority-label">Priority</p>
        <div
          class="task-editor__priority-options"
          role="radiogroup"
          aria-labelledby="task-priority-label"
          data-testid="task-priority-group"
          (keydown)="onPriorityKeydown($event)"
        >
          @for (option of priorityOptions; track option.value; let i = $index) {
            <button
              #priorityBtn
              type="button"
              role="radio"
              [attr.data-priority]="option.value"
              [attr.aria-checked]="taskForm.priority().value() === option.value"
              [class.is-active]="taskForm.priority().value() === option.value"
              class="task-editor__priority-chip"
              (click)="setPriority(option.value)"
              (focus)="onPriorityFocus(i)"
              [attr.tabindex]="taskForm.priority().value() === option.value ? 0 : -1"
              [attr.aria-label]="option.label + ' priority'"
            >
              <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
              <span>{{ option.label }}</span>
            </button>
          }
        </div>
        <p class="task-editor__priority-hint" aria-live="polite">
          <mat-icon aria-hidden="true">{{ currentPriority().icon }}</mat-icon>
          <span>{{ currentPriority().description }}</span>
        </p>
      </div>
    </form>

    <footer mat-dialog-actions class="task-editor__actions" align="end">
      @if (data.task) {
        <button mat-button type="button" color="warn" class="task-editor__archive" (click)="archive()" [disabled]="saving()">
          <mat-icon>archive</mat-icon> Archive
        </button>
      }
      <span class="task-editor__spacer"></span>
      <button mat-button type="button" class="task-editor__cancel" (click)="cancel()" [disabled]="saving()">Cancel</button>
      <button mat-flat-button color="primary" type="submit" form="task-form" class="task-editor__save" [disabled]="saving()" (click)="save($event)">
        @if (saving()) {
          <ng-container>
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Saving task"></mat-progress-spinner>
            <span>Saving…</span>
          </ng-container>
        } @else {
          <ng-container>
            <mat-icon aria-hidden="true">check</mat-icon>
            <span>{{ data.task ? 'Save changes' : 'Create task' }}</span>
          </ng-container>
        }
      </button>
    </footer>
  `,
  styles: [
    `
      :host { display: block; min-width: min(480px, 92vw); max-width: 560px; }
      .task-editor__header { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; margin: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
      .task-editor__icon { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; background: rgba(33, 150, 243, 0.16); color: #64b5f6; flex-shrink: 0; }
      .task-editor__titles { flex: 1 1 auto; min-width: 0; }
      .task-editor__titles h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
      .task-editor__titles p { margin: 0.125rem 0 0; color: rgba(255, 255, 255, 0.7); font-size: 0.875rem; }
      .task-editor__close { flex-shrink: 0; }

      .task-editor__form { display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem !important; }
      .task-editor__field { width: 100%; }
      .task-editor__field textarea { resize: vertical; min-height: 96px; }

      .task-editor__status { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.25rem; }
      .task-editor__status-label { margin: 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255, 255, 255, 0.6); }
      .task-editor__status-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
      .task-editor__status-chip { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.625rem 0.5rem; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.04); color: rgba(255, 255, 255, 0.85); cursor: pointer; font: inherit; transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
      .task-editor__status-chip:hover:not(.is-active) { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); }
      .task-editor__status-chip.is-active { background: rgba(33, 150, 243, 0.18); border-color: rgba(33, 150, 243, 0.5); color: #64b5f6; }
      .task-editor__status-chip:focus-visible { outline: 2px solid #64b5f6; outline-offset: 2px; }
      .task-editor__status-chip mat-icon { font-size: 1.125rem; width: 1.125rem; height: 1.125rem; }
      .task-editor__status-hint { display: flex; align-items: center; gap: 0.375rem; margin: 0; font-size: 0.8125rem; color: rgba(255, 255, 255, 0.6); min-height: 1.25rem; }

      .task-editor__priority { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.25rem; }
      .task-editor__priority-label { margin: 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255, 255, 255, 0.6); }
      .task-editor__priority-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
      .task-editor__priority-chip { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.625rem 0.5rem; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.04); color: rgba(255, 255, 255, 0.85); cursor: pointer; font: inherit; transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
      .task-editor__priority-chip:hover:not(.is-active) { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); }
      .task-editor__priority-chip[data-priority="HIGH"].is-active { background: rgba(244, 67, 54, 0.18); border-color: rgba(244, 67, 54, 0.55); color: #ef9a9a; }
      .task-editor__priority-chip[data-priority="MEDIUM"].is-active { background: rgba(255, 152, 0, 0.18); border-color: rgba(255, 152, 0, 0.55); color: #ffb74d; }
      .task-editor__priority-chip[data-priority="LOW"].is-active { background: rgba(76, 175, 80, 0.18); border-color: rgba(76, 175, 80, 0.55); color: #81c784; }
      .task-editor__priority-chip:focus-visible { outline: 2px solid #90caf9; outline-offset: 2px; }
      .task-editor__priority-chip mat-icon { font-size: 1.125rem; width: 1.125rem; height: 1.125rem; }
      .task-editor__priority-hint { display: flex; align-items: center; gap: 0.375rem; margin: 0; font-size: 0.8125rem; color: rgba(255, 255, 255, 0.6); min-height: 1.25rem; }

      .task-editor__actions { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.25rem !important; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 0; }
      .task-editor__spacer { flex: 1 1 auto; }
      .task-editor__save mat-progress-spinner { display: inline-block; margin-right: 0.5rem; vertical-align: middle; }
      .task-editor__save { display: inline-flex; align-items: center; gap: 0.375rem; min-width: 140px; justify-content: center; }
      .task-editor__archive mat-icon { margin-right: 0.25rem; }
      .task-editor__cancel { margin-left: 0; }
    `,
  ],
  host: { '[attr.aria-labelledby]': "'task-editor-title'", '[attr.aria-describedby]': "'task-editor-subtitle'" },
})
export class TaskEditorDialog {
  protected readonly data = inject<TaskEditorDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<TaskEditorDialog, TaskEditorDialogResult>>(MatDialogRef);
  protected readonly saving = signal(false);
  protected readonly NAME_MAX = NAME_MAX;
  protected readonly DESCRIPTION_MAX = DESCRIPTION_MAX;
  protected readonly statusOptions: ReadonlyArray<{ readonly value: Task['status']; readonly label: string; readonly icon: string; readonly description: string }> = [
    { value: 'open', label: 'Open', icon: 'radio_button_unchecked', description: 'Not started — the task is fresh and waiting.' },
    { value: 'in_progress', label: 'In progress', icon: 'autorenew', description: 'Actively being worked on right now.' },
    { value: 'done', label: 'Done', icon: 'check_circle', description: 'Completed — ready to close or archive.' },
  ];
  protected readonly priorityOptions: ReadonlyArray<{ readonly value: TaskPriority; readonly label: string; readonly icon: string; readonly description: string }> = [
    { value: 'HIGH', label: 'High', icon: 'priority_high', description: 'Critical — needs immediate attention.' },
    { value: 'MEDIUM', label: 'Medium', icon: 'drag_handle', description: 'Normal — schedule in the current sprint.' },
    { value: 'LOW', label: 'Low', icon: 'low_priority', description: 'Backlog — pick up when capacity allows.' },
  ];
  protected readonly currentStatus = () => this.statusOptions.find((o) => o.value === this.taskForm.status().value()) ?? this.statusOptions[0];
  protected readonly currentPriority = () => this.priorityOptions.find((o) => o.value === this.taskForm.priority().value()) ?? this.priorityOptions[1];
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly priorityButtons = viewChildren<ElementRef<HTMLButtonElement>>('priorityBtn');

  protected readonly taskForm = form<TaskFormModel>(
    signal<TaskFormModel>({
      name: this.data.task?.name ?? '',
      description: this.data.task?.description ?? '',
      status: this.data.task?.status ?? 'open',
      priority: this.data.task?.priority ?? 'MEDIUM',
    }),
    (path) => {
      required(path.name, { message: 'A name is required.' });
      validate(path.name, (ctx) => (ctx.value().trim().length === 0 ? { kind: 'required', message: 'A name is required.' } : null));
      maxLength(path.name, NAME_MAX, { message: `Use ${NAME_MAX} characters or fewer.` });
      maxLength(path.description, DESCRIPTION_MAX, { message: `Use ${DESCRIPTION_MAX} characters or fewer.` });
    },
  );

  constructor() {
    queueMicrotask(() => this.nameInput()?.nativeElement?.focus());
  }

  protected setStatus(status: Task['status']): void {
    this.taskForm.status().value.set(status);
  }

  protected setPriority(priority: TaskPriority): void {
    this.taskForm.priority().value.set(priority);
  }

  /**
   * Tracks which priority option most recently received DOM focus so
   * `onPriorityKeydown` can resolve the focused option by index. We only
   * need this to keep arrow-key navigation consistent: the selected
   * option always carries `tabindex="0"`, so a Tab into the group lands
   * on the selected one, and arrows move selection AND focus together.
   */
  private readonly focusedPriorityIndex = signal<number>(this.initialPriorityIndex());

  private initialPriorityIndex(): number {
    const initial = this.taskForm.priority().value();
    const idx = this.priorityOptions.findIndex((o) => o.value === initial);
    return idx >= 0 ? idx : 1;
  }

  protected onPriorityFocus(index: number): void {
    this.focusedPriorityIndex.set(index);
  }

  /**
   * Roving tabindex keyboard navigation for the priority radiogroup:
   * arrows move focus AND selection (per WAI-ARIA radio group pattern),
   * Home/End jump to the first/last option, and Space/Enter are ignored
   * so the browser's default activation (click → setPriority) runs.
   */
  protected onPriorityKeydown(event: KeyboardEvent): void {
    const total = this.priorityOptions.length;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = (this.focusedPriorityIndex() + 1) % total;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        next = (this.focusedPriorityIndex() - 1 + total) % total;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = total - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const buttons = this.priorityButtons();
    const target = buttons[next]?.nativeElement;
    if (!target) return;
    this.focusedPriorityIndex.set(next);
    target.focus();
    this.setPriority(this.priorityOptions[next].value);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await submit(this.taskForm, async () => {
        const name = this.taskForm.name().value().trim();
        const description = normalizeTaskDescription(this.taskForm.description().value());
        const status = this.taskForm.status().value();
        const priority = this.taskForm.priority().value();
        this.ref.close({ action: 'saved', task: { name, description, status, priority } });
      });
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close({ action: 'cancel' });
  }

  protected archive(): void {
    this.ref.close({ action: 'archived' });
  }
}
