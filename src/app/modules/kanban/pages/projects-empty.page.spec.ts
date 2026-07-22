import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { ProjectService } from '../../../core/projects/project.service';
import { TasksService } from '../../../core/tasks/tasks.service';
import { ProjectsEmptyPage } from './projects-empty.page';

/**
 * S4: the Kanban empty landing page must redirect to the tasks list when
 * no active task is selected. The legacy "pick a project first" empty
 * state was the gateway to project-level Kanban; under kanban-per-task
 * the gateway is task selection. Bare `/modules/kanban/projects` with
 * no task is dead-end UX — bounce the user into the tasks module where
 * the canonical task picker lives.
 */
describe('ProjectsEmptyPage', () => {
  const currentTaskId = signal<number | null>(null);

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProjectsEmptyPage, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        {
          provide: ProjectService,
          useValue: { current: signal<unknown>(null) },
        },
        {
          provide: TasksService,
          useValue: { currentId: currentTaskId },
        },
      ],
    }).compileComponents();
  });

  it('redirects to /modules/tasks when no active task is selected', async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(ProjectsEmptyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navSpy).toHaveBeenCalled();
    const navArgs = navSpy.mock.calls[0]?.[0] as readonly unknown[];
    expect(navArgs).toEqual(['/modules/tasks']);
  });

  it('renders the empty-state card when an active task IS selected', async () => {
    currentTaskId.set(9);
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(ProjectsEmptyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // No redirect when a task is already selected.
    expect(navSpy).not.toHaveBeenCalled();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.empty-card')).not.toBeNull();
  });
});
