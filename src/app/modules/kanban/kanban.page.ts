import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { ProjectService } from '../../core/projects/project.service';

/**
 * Index page for the kanban module. Renders the placeholder card the project
 * picker will replace in PR2/PR3. When no project is selected, the body tells
 * the user to pick one from the toolbar.
 */
@Component({
  selector: 'app-kanban-page',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './kanban.page.html',
  styles: [
    `
      :host {
        display: block;
      }

      .kanban-placeholder {
        display: flex;
        justify-content: center;
        padding: 32px 16px;
      }

      .kanban-card {
        max-width: 480px;
        width: 100%;
        text-align: center;
      }

      mat-card-header {
        justify-content: center;
      }

      mat-card-content p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-medium);
      }
    `,
  ],
})
export class KanbanPage {
  private readonly projectService = inject(ProjectService);
  protected readonly current = this.projectService.current;
}
