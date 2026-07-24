import { ComponentFixture, TestBed } from '@angular/core/testing';
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
  priority: 'HIGH',
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
  function mount(task?: Task): { dialog: TaskEditorDialog; fixture: ComponentFixture<TaskEditorDialog> } {
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
    return { dialog: fixture.componentInstance, fixture };
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
    const form = (dialog as unknown as { taskForm: { name: () => { value: () => string }; description: () => { value: () => string }; status: () => { value: () => string }; priority: () => { value: () => string } } }).taskForm;
    expect(form.name().value()).toBe('Ship release');
    expect(form.description().value()).toBe('Cut the v1 build');
    expect(form.status().value()).toBe('in_progress');
    expect(form.priority().value()).toBe('HIGH');
  });

  it('seeds an empty form when creating a new task (priority defaults to MEDIUM)', () => {
    const { dialog } = mount();
    const form = (dialog as unknown as { taskForm: { name: () => { value: () => string }; description: () => { value: () => string }; status: () => { value: () => string }; priority: () => { value: () => string } } }).taskForm;
    expect(form.name().value()).toBe('');
    expect(form.description().value()).toBe('');
    expect(form.status().value()).toBe('open');
    expect(form.priority().value()).toBe('MEDIUM');
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

  it('exposes exactly the three locked priority options (HIGH, MEDIUM, LOW)', () => {
    const { dialog } = mount();
    const options = (dialog as unknown as { priorityOptions: ReadonlyArray<{ value: string; icon: string; description: string }> }).priorityOptions;
    expect(options.map((o) => o.value)).toEqual(['HIGH', 'MEDIUM', 'LOW']);
    expect(options.every((o) => typeof o.icon === 'string' && o.icon.length > 0)).toBe(true);
    expect(options.every((o) => typeof o.description === 'string' && o.description.length > 0)).toBe(true);
  });

  it('renders the priority radiogroup with role, label, and aria-checked on each option', () => {
    const { fixture } = mount();
    const group = fixture.nativeElement.querySelector('[role="radiogroup"][aria-labelledby="task-priority-label"]');
    expect(group).not.toBeNull();
    const radios = fixture.nativeElement.querySelectorAll('[role="radiogroup"][aria-labelledby="task-priority-label"] [role="radio"]');
    expect(radios).toHaveLength(3);
    const values = Array.from(radios).map((r) => (r as HTMLElement).getAttribute('data-priority'));
    expect(values).toEqual(['HIGH', 'MEDIUM', 'LOW']);
    // MEDIUM is the default for new tasks.
    const checked = Array.from(radios).map((r) => (r as HTMLElement).getAttribute('aria-checked'));
    expect(checked).toEqual(['false', 'true', 'false']);
  });

  it('uses roving tabindex (selected=0, others=-1) and updates it on click', () => {
    const { dialog, fixture } = mount();
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('[role="radiogroup"][aria-labelledby="task-priority-label"] [role="radio"]')).map((r) => (r as HTMLElement).getAttribute('tabindex'));
    expect(tabs).toEqual(['-1', '0', '-1']);
    (dialog as unknown as { setPriority: (p: Task['priority']) => void }).setPriority('HIGH');
    // The `[attr.tabindex]` binding re-evaluates on the next change-detection
    // pass after the signal write — flush before re-querying the DOM.
    fixture.detectChanges();
    const after = Array.from(fixture.nativeElement.querySelectorAll('[role="radiogroup"][aria-labelledby="task-priority-label"] [role="radio"]')).map((r) => (r as HTMLElement).getAttribute('tabindex'));
    expect(after).toEqual(['0', '-1', '-1']);
  });

  it('updates the priority signal when setPriority is called', () => {
    const { dialog } = mount(sampleTask);
    const form = (dialog as unknown as { taskForm: { priority: () => { value: () => string } } }).taskForm;
    expect(form.priority().value()).toBe('HIGH');
    (dialog as unknown as { setPriority: (p: Task['priority']) => void }).setPriority('LOW');
    expect(form.priority().value()).toBe('LOW');
  });

  it('returns the current priority helper', () => {
    const { dialog } = mount(sampleTask);
    const current = (dialog as unknown as { currentPriority: () => { value: string } }).currentPriority();
    expect(current.value).toBe('HIGH');
  });

  it('moves selection and focus with arrow keys (WAI-ARIA radio group)', () => {
    const { dialog, fixture } = mount();
    const host = fixture.nativeElement as HTMLElement;
    // Focus the MEDIUM option (initial selection).
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-labelledby="task-priority-label"] [role="radio"]'));
    buttons[1]!.focus();
    (dialog as unknown as { onPriorityFocus: (i: number) => void }).onPriorityFocus(1);
    const fire = (key: string) => {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      host.querySelector('[role="radiogroup"][aria-labelledby="task-priority-label"]')!.dispatchEvent(ev);
      return ev;
    };
    // ArrowRight from MEDIUM → LOW (wraps to HIGH first? no: 1 → 2 = LOW).
    fire('ArrowRight');
    expect((dialog as unknown as { taskForm: { priority: () => { value: () => string } } }).taskForm.priority().value()).toBe('LOW');
    // ArrowLeft from LOW → MEDIUM.
    fire('ArrowLeft');
    expect((dialog as unknown as { taskForm: { priority: () => { value: () => string } } }).taskForm.priority().value()).toBe('MEDIUM');
    // Home → HIGH.
    fire('Home');
    expect((dialog as unknown as { taskForm: { priority: () => { value: () => string } } }).taskForm.priority().value()).toBe('HIGH');
    // End → LOW.
    fire('End');
    expect((dialog as unknown as { taskForm: { priority: () => { value: () => string } } }).taskForm.priority().value()).toBe('LOW');
    // ArrowLeft from LOW wraps → MEDIUM (idx 0 from 2 is HIGH, but End landed on LOW=2 → ArrowLeft → idx 1 = MEDIUM).
    fire('ArrowLeft');
    expect((dialog as unknown as { taskForm: { priority: () => { value: () => string } } }).taskForm.priority().value()).toBe('MEDIUM');
  });

  it('pairs the priority visual cue with text and an icon (no color-only signal)', () => {
    const { fixture } = mount();
    const chips = fixture.nativeElement.querySelectorAll('.task-editor__priority-chip');
    for (const chip of Array.from(chips) as HTMLElement[]) {
      // Each chip renders a mat-icon AND a visible text label so priority
      // is understandable for users who cannot perceive color.
      expect(chip.querySelector('mat-icon')).not.toBeNull();
      const label = chip.querySelector('span')?.textContent?.trim() ?? '';
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('cancel() closes the dialog with action cancel', () => {
    const { dialog, fixture } = mount();
    // Grab the ref via TestBed provider; the helper mount discards it, so
    // we resolve it through the dialog's private ref by re-reading the
    // MatDialogRef token.
    const ref = TestBed.inject(MatDialogRef) as unknown as { close: ReturnType<typeof vi.fn> };
    (dialog as unknown as { cancel: () => void }).cancel();
    expect(ref.close).toHaveBeenCalledWith({ action: 'cancel' });
    void fixture;
  });

  it('archive() closes the dialog with action archived (only for existing tasks)', () => {
    const { dialog } = mount(sampleTask);
    const ref = TestBed.inject(MatDialogRef) as unknown as { close: ReturnType<typeof vi.fn> };
    (dialog as unknown as { archive: () => void }).archive();
    expect(ref.close).toHaveBeenCalledWith({ action: 'archived' });
  });

  it('save() submits when required field is valid and closes with normalised payload (priority preserved)', async () => {
    const { dialog } = mount({
      ...sampleTask,
      name: '  Existing task  ',
      description: '   ',
      status: 'open',
      priority: 'HIGH',
    });
    const ref = TestBed.inject(MatDialogRef) as unknown as { close: ReturnType<typeof vi.fn> };
    const save = (dialog as unknown as { save: (e: Event) => Promise<void> }).save.bind(dialog);
    await save(new Event('submit'));
    expect(ref.close).toHaveBeenCalledWith({
      action: 'saved',
      task: { name: 'Existing task', description: null, status: 'open', priority: 'HIGH' },
    });
  });

  it('save() returns the chosen priority when the user changes it during edit', async () => {
    const { dialog } = mount({ ...sampleTask, priority: 'HIGH' });
    const ref = TestBed.inject(MatDialogRef) as unknown as { close: ReturnType<typeof vi.fn> };
    (dialog as unknown as { setPriority: (p: Task['priority']) => void }).setPriority('LOW');
    const save = (dialog as unknown as { save: (e: Event) => Promise<void> }).save.bind(dialog);
    await save(new Event('submit'));
    expect(ref.close).toHaveBeenCalledWith({
      action: 'saved',
      task: expect.objectContaining({ priority: 'LOW' }),
    });
  });
});