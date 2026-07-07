import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { ProjectService } from '../../../core/projects/project.service';

/**
 * Empty state shown when the user lands on `/modules/kanban/projects` without
 * having selected a project. Tells them to use the toolbar picker.
 */
@Component({
  selector: 'app-projects-empty-page',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './projects-empty.page.html',
  styleUrl: './projects-empty.page.scss',
})
export class ProjectsEmptyPage {
  private readonly projectService = inject(ProjectService);
  protected readonly current = this.projectService.current;
}
