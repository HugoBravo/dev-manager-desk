import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { ProjectService } from '../../../core/projects/project.service';

/**
 * Empty state shown when the user lands on `/modules/secrets/projects`
 * without having selected a project. Mirror of `projects-empty` in the
 * kanban feature — same copy contract.
 */
@Component({
  selector: 'app-secrets-empty-page',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './secrets-empty.page.html',
  styleUrl: './secrets-empty.page.scss',
})
export class SecretsEmptyPage {
  private readonly projectService = inject(ProjectService);
  protected readonly current = this.projectService.current;
}
