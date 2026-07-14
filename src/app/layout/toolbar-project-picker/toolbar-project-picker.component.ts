import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
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
 * When the active project changes, this component navigates the router to
 * the kanban boards list for that project. Navigation is driven by an
 * `effect()` on `current()` — NOT by the `mat-select` selectionChange event.
 * Reason: when a single project is auto-selected on bootstrap, the picker
 * mounts with `[value]` already matching `current().id`, and Angular Material
 * does NOT fire `selectionChange` when the user picks the already-selected
 * value, so navigation would never trigger on first load.
 *
 * The effect compares the current URL against the target URL before navigating
 * to avoid pushing redundant history entries on every bootstrap cycle.
 *
 * Accessibility:
 *  - `aria-label="Project"` on the trigger.
 *  - `aria-live="polite"` on the wrapper so changes are announced.
 *  - `aria-busy` mirrors the bootstrap state.
 *  - Keyboard navigation is inherited from Material.
 */
@Component({
  selector: 'app-toolbar-project-picker',
  imports: [MatFormFieldModule, MatOptionModule, MatProgressBarModule, MatSelectModule],
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

  /**
   * Current router URL — used by the navigation effect to skip the navigation
   * when we're already on the target board route. Seeded from the router
   * state and kept in sync via `router.events` subscription in the constructor.
   * Manual signal (no `toSignal`) because the `toSignal` overload signatures
   * don't infer cleanly with `initialValue: string | null`.
   */
  private readonly currentUrl = signal<string>(this.router.routerState.snapshot.url ?? '');

  constructor() {
    // Keep currentUrl in sync with the router. Manual subscription avoids the
    // `toSignal` overload-inference mess with `initialValue`.
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.currentUrl.set(e.urlAfterRedirects));

    effect(() => {
      const project = this.current();
      const url = this.currentUrl();
      if (project === null) {
        return;
      }
      // Two landing routes live under the shell: the kanban feature
      // lands at `/modules/kanban/projects/:id/boards`, the secrets
      // feature lands at `/modules/secrets/projects/:id`. Pick the
      // landing that matches the URL the user is already on so we
      // don't yank them out of the feature they were using.
      const targetBase = isSecretsLanding(url)
        ? `/modules/secrets/projects/${project.id}`
        : `/modules/kanban/projects/${project.id}/boards`;
      // Only navigate when we're not already on the target route for
      // this project. Avoids loop on initial bootstrap and avoids
      // pushing history entries on every navigation that lands back
      // on the shell.
      if (url.startsWith(targetBase)) {
        return;
      }
      if (
        url === '/modules/kanban' ||
        url === '/modules/kanban/' ||
        url === '/modules/kanban/projects' ||
        url === '/modules/kanban/projects/' ||
        url === '/modules/secrets' ||
        url === '/modules/secrets/' ||
        url === '/modules/secrets/projects' ||
        url === '/modules/secrets/projects/'
      ) {
        void this.router.navigateByUrl(targetBase);
      }
    });
  }

  protected onSelectionChange(projectId: number): void {
    const project = this.projects().find((p) => p.id === projectId) ?? null;
    this.projectService.setActive(project);
    // The `effect()` above handles the navigation. No navigation here.
  }
}

/**
 * `true` when the current URL is under the secrets feature so the
 * picker picks the secrets landing route (instead of the default kanban
 * boards landing). Detects both the empty landing and the per-project
 * list — anything under `/modules/secrets` is fair game.
 */
function isSecretsLanding(url: string): boolean {
  return (
    url === '/modules/secrets' ||
    url === '/modules/secrets/' ||
    url.startsWith('/modules/secrets/projects')
  );
}
