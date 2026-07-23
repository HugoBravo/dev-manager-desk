import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { normalizeTaskDescription, TaskEditorDialog } from './task-editor-dialog';
import type { Task } from '../../../../core/tasks/task.model';

const sampleTask: Task = {
  id: 42,
  project_id: 7,
  name: 'Ship release',
  slug: 'ship-release',
  description: 'Cut the v1 build',
  status: 'in_progress',
  archived_at: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

describe('normalizeTaskDescription', () => {
  it('trims text and converts blank descriptions to null', () => {
    expect(normalizeTaskDescription('  Notes  ')).toBe('Notes');
    expect(normalizeTaskDescription('   ')).toBeNull();
  });
});

describe('TaskEditorDialog', () => {
  function mount(task?: Task): { dialog: TaskEditorDialog; ref: { close: ReturnType<typeof vi.fn> } } {
    const ref = { close: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TaskEditorDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { task } },
        { provide: MatDialogRef, useValue: ref },
      ],
    });
    const fixture = TestBed.createComponent(TaskEditorDialog);
    fixture.detectChanges();
    return { dialog: fixture.componentInstance, ref };
  }

  it('renders a Create-task title when no task is provided', () => {
    const { dialog } = mount();
    const title = (dialog as unknown as { data: { task?: Task } }).data.task;
    expect(title).toBeUndefined();
  });

  it('renders an Edit-task title when a task is provided', () => {
    const { dialog } = mount(sampleTask);
    const data = (dialog as unknown as { data: { task?: Task } }).data;
    expect(data.task?.id).toBe(42);
  });

  it('seeds the form with the existing task values', () => {
    const { dialog } = mount(sampleTask);
    const form = (dialog as unknown as { taskForm: { name: () => { value: () => string }; description: () => { value: () => string }; status: () => { value: () => string } } }).taskForm;
    expect(form.name().value()).toBe('Ship release');
    expect(form.description().value()).toBe('Cut the v1 build');
    expect(form.status().value()).toBe('in_progress');
  });

  it('seeds an empty form when creating a new task', () => {
    const { dialog } = mount();
    const form = (dialog as unknown as { taskForm: { name: () => { value: () => string }; description: () => { value: () => string }; status: () => { value: () => string } } }).taskForm;
    expect(form.name().value()).toBe('');
    expect(form.description().value()).toBe('');
    expect(form.status().value()).toBe('open');
  });

  it('updates the status signal when setStatus is called', () => {
    const { dialog } = mount(sampleTask);
    const form = (dialog as unknown as { taskForm: { status: () => { value: () => string } } }).taskForm;
    expect(form.status().value()).toBe('in_progress');
    (dialog as unknown as { setStatus: (s: Task['status']) => void }).setStatus('done');
    expect(form.status().value()).toBe('done');
  });

  it('exposes three status options with icons and descriptions', () => {
    const { dialog } = mount();
    const options = (dialog as unknown as { statusOptions: ReadonlyArray<{ value: string; icon: string; description: string }> }).statusOptions;
    expect(options.map((o) => o.value)).toEqual(['open', 'in_progress', 'done']);
    expect(options.every((o) => typeof o.icon === 'string' && o.icon.length > 0)).toBe(true);
    expect(options.every((o) => typeof o.description === 'string' && o.description.length > 0)).toBe(true);
  });

  it('returns the current status helper', () => {
    const { dialog } = mount(sampleTask);
    const current = (dialog as unknown as { currentStatus: () => { value: string } }).currentStatus();
    expect(current.value).toBe('in_progress');
  });

  it('cancel() closes the dialog with action cancel', () => {
    const { dialog, ref } = mount();
    (dialog as unknown as { cancel: () => void }).cancel();
    expect(ref.close).toHaveBeenCalledWith({ action: 'cancel' });
  });

  it('archive() closes the dialog with action archived (only for existing tasks)', () => {
    const { dialog, ref } = mount(sampleTask);
    (dialog as unknown as { archive: () => void }).archive();
    expect(ref.close).toHaveBeenCalledWith({ action: 'archived' });
  });

  it('save() submits when required field is valid and closes with normalised payload', async () => {
    const { dialog, ref } = mount({
      ...sampleTask,
      name: '  Existing task  ',
      description: '   ',
      status: 'open',
    });
    const save = (dialog as unknown as { save: (e: Event) => Promise<void> }).save.bind(dialog);
    await save(new Event('submit'));
    expect(ref.close).toHaveBeenCalledWith({
      action: 'saved',
      task: { name: 'Existing task', description: null, status: 'open' },
    });
  });
});
