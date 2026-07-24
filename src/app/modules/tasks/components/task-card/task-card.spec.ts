import { TestBed } from '@angular/core/testing';

import type { Task } from '../../../../core/tasks/task.model';
import { TaskCard } from './task-card';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 1,
  project_id: 7,
  name: 'Default',
  slug: 'default',
  description: 'A task description',
  status: 'open',
  priority: 'HIGH',
  archived_at: null,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('TaskCard', () => {
  it('renders the task name, status, description, and accessible priority chip', async () => {
    await TestBed.configureTestingModule({ imports: [TaskCard] }).compileComponents();
    const fixture = TestBed.createComponent(TaskCard);
    fixture.componentRef.setInput('task', task());
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const chip = host.querySelector<HTMLElement>('[data-testid="task-priority"]');

    expect(host.querySelector('[data-testid="task-name"]')?.textContent?.trim()).toBe('Default');
    expect(host.querySelector('[data-testid="task-status"]')?.textContent?.trim()).toBe('open');
    expect(host.querySelector('[data-testid="task-description"]')?.textContent?.trim()).toBe('A task description');
    expect(chip?.textContent).toContain('High');
    expect(chip?.querySelector('mat-icon')?.textContent?.trim()).toBe('priority_high');
    expect(chip?.getAttribute('aria-label')).toBe('Priority High');
  });

  it('keeps the card content visible for unnamed-description tasks and renders each priority variant', async () => {
    await TestBed.configureTestingModule({ imports: [TaskCard] }).compileComponents();
    const fixture = TestBed.createComponent(TaskCard);
    fixture.componentRef.setInput(
      'task',
      task({ name: 'Other task', description: null, status: 'done', priority: 'LOW' }),
    );
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const chip = host.querySelector<HTMLElement>('[data-testid="task-priority"]');

    expect(host.querySelector('[data-testid="task-name"]')?.textContent?.trim()).toBe('Other task');
    expect(host.querySelector('[data-testid="task-status"]')?.textContent?.trim()).toBe('done');
    expect(host.querySelector('[data-testid="task-description"]')?.textContent?.trim()).toBe('No description');
    expect(chip?.textContent).toContain('Low');
    expect(chip?.querySelector('mat-icon')?.textContent?.trim()).toBe('low_priority');
    expect(chip?.getAttribute('aria-label')).toBe('Priority Low');
  });
});
