import { Component, computed, inject } from '@angular/core';
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

  protected readonly projects = this.projectService.projects;
  protected readonly current = this.projectService.current;
  protected readonly isBootstrapped = this.projectService.isBootstrapped;
  protected readonly isBusy = computed(() => !this.isBootstrapped());

  protected onSelectionChange(projectId: number): void {
    const project =
      this.projects().find((p) => p.id === projectId) ?? null;
    this.projectService.setActive(project);
  }
}
