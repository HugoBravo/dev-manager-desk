import { Component, effect, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { ProjectService } from '../../../core/projects/project.service';
import { TasksService } from '../../../core/tasks/tasks.service';

/**
 * Empty state shown when the user lands on `/modules/kanban/projects` without
 * having selected a project. Tells them to use the toolbar picker.
 *
 * S4 (kanban-per-task): bare `/modules/kanban/projects` with no active
 * task is a dead-end UX — there is no longer a project-level Kanban to
 * fall back to. When `TasksService.currentId()` is null the page
 * redirects to `/modules/tasks` so the user can pick a task first.
 * The legacy "select a project" card stays as the fallback for the
 * case where the user lands here WITH an active task (e.g. via the
 * toolbar picker before navigating).
 */
@Component({
  selector: 'app-projects-empty-page',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './projects-empty.page.html',
  styleUrl: './projects-empty.page.scss',
})
export class ProjectsEmptyPage {
  private readonly projectService = inject(ProjectService);
  private readonly tasks = inject(TasksService);
  private readonly router = inject(Router);

  protected readonly current = this.projectService.current;

  constructor() {
    // Redirect when no active task is selected. We use an `effect` so
    // the redirect fires whenever the active task id changes (e.g. a
    // different tab archive-clears it). Single-flight guard: the
    // router's URL update feeds back into the toolbar's effect, but
    // navigation out of this route naturally prevents re-entry.
    effect(() => {
      const taskId = this.tasks.currentId();
      if (taskId === null) {
        void this.router.navigate(['/modules/tasks']);
      }
    });
  }
}
