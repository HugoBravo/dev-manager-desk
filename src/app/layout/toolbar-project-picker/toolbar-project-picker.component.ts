import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { ProjectService } from '../../core/projects/project.service';

/**
 * Toolbar-mounted project picker. Subscribes to {@link ProjectService} and
 * exposes a Material `mat-select` for the active project. Shows a skeleton
 * placeholder while `bootstrap()` is in flight.
 *
 * On selection, the picker both persists the new project via the service AND
 * navigates the router to the kanban boards list for that project. Without
 * that navigation, the user would stay on the kanban landing page and see
 * only the "Boards will appear in a future update" placeholder.
 *
 * Accessibility:
 *  - `aria-label="Project"` on the trigger.
 *  - `aria-live="polite"` on the wrapper so changes are announced.
 *  - `aria-busy` mirrors the bootstrap state.
 *  - Keyboard navigation is inherited from Material.
 */
@Component({
  selector: 'app-toolbar-project-picker',
  imports: [
    MatFormFieldModule,
    MatOptionModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  templateUrl: './toolbar-project-picker.component.html',
  styleUrl: './toolbar-project-picker.component.scss',
  host: {
    class: 'toolbar-project-picker',
    '[attr.aria-busy]': 'isBusy()',
  },
})
export class ToolbarProjectPickerComponent {
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);

  protected readonly projects = this.projectService.projects;
  protected readonly current = this.projectService.current;
  protected readonly isBootstrapped = this.projectService.isBootstrapped;
  protected readonly isBusy = computed(() => !this.isBootstrapped());

  protected onSelectionChange(projectId: number): void {
    const project =
      this.projects().find((p) => p.id === projectId) ?? null;
    this.projectService.setActive(project);

    // Navigate to the kanban boards list for the selected project. Skip the
    // navigation if the user clears the picker (null) — the guard handles
    // the redirect to the project picker in that case.
    if (project !== null) {
      void this.router.navigate(['/modules/kanban', 'projects', project.id, 'boards']);
    }
  }
}
