import { Component, inject, signal } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import type { Task, TaskPatch } from '../../../../core/tasks/task.model';

export interface TaskEditorDialogData { readonly task?: Task; }
export interface TaskEditorDialogResult { readonly action: 'saved' | 'cancel'; readonly task?: TaskPatch & Pick<Task, 'name'>; }
interface TaskFormModel { name: string; description: string; status: Task['status']; }

export function normalizeTaskDescription(value: string): string | null { const normalized = value.trim(); return normalized || null; }

@Component({
  selector: 'app-task-editor-dialog',
  imports: [FormField, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.task ? 'Edit task' : 'Create task' }}</h2>
    <form mat-dialog-content (submit)="save($event)">
      <mat-form-field><mat-label>Name</mat-label><input matInput [formField]="taskForm.name" autocomplete="off"><mat-error>Name is required.</mat-error></mat-form-field>
      <mat-form-field><mat-label>Description</mat-label><textarea matInput [formField]="taskForm.description" rows="4"></textarea></mat-form-field>
      <mat-form-field><mat-label>Status</mat-label><mat-select [formField]="taskForm.status"><mat-option value="open">Open</mat-option><mat-option value="in_progress">In progress</mat-option><mat-option value="done">Done</mat-option></mat-select></mat-form-field>
    </form>
    <mat-dialog-actions align="end"><button mat-button type="button" (click)="cancel()">Cancel</button><button mat-flat-button type="submit" form="task-form" (click)="save($event)">Save</button></mat-dialog-actions>
  `,
})
export class TaskEditorDialog {
  protected readonly data = inject<TaskEditorDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<TaskEditorDialog, TaskEditorDialogResult>>(MatDialogRef);
  protected readonly taskForm = form(signal<TaskFormModel>({
    name: this.data.task?.name ?? '', description: this.data.task?.description ?? '', status: this.data.task?.status ?? 'open',
  }), (path) => required(path.name, { message: 'Name is required.' }));

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.taskForm, async () => {
      const name = this.taskForm.name().value().trim();
      const description = normalizeTaskDescription(this.taskForm.description().value());
      const status = this.taskForm.status().value();
      this.ref.close({ action: 'saved', task: { name, description, status } });
    });
  }
  protected cancel(): void { this.ref.close({ action: 'cancel' }); }
}
