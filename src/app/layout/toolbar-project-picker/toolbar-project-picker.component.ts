import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { ProjectService } from '../../core/projects/project.service';

/**
 * Identifies the active feature behind the current URL — drives the
 * picker's per-project target route so we never yank the user out of
 * the feature they were on. Three features share the shell:
 *
 * - `projects` lives at `/modules/projects` (no `:projectId` segment —
 *   it's the project list/index).
 * - `kanban` lives under `/modules/kanban/projects/:projectId/boards...`
 * - `secrets` lives under `/modules/secrets/projects/:projectId...`
 *
 * Anything else (the bare `/modules/kanban` landing, unknown routes)
 * falls through as `unknown` and the picker defaults to the highest
 * shell feature (`projects`) rather than assuming `kanban`, which was
 * the prior behavior and broke the Projects link.
 */
export type PickerFeature = 'projects' | 'kanban' | 'secrets' | 'unknown';

/**
 * Feature-scoped per-project route. Each branch corresponds to the
 * real route registered in `modules.routes.ts` so the picker only
 * navigates to URLs the router can resolve.
 */
export interface PickerTarget {
  readonly feature: PickerFeature;
  readonly url: string;
}

/**
 * Toolbar-mounted project picker. Subscribes to {@link ProjectService} and
 * exposes a Material `mat-select` for the active project. Shows a skeleton
 * placeholder while `bootstrap()` is in flight.
 *
 * When the active project changes, this component navigates the router to
 * the per-project landing of the feature the user is currently on. Navigation
 * is driven by an `effect()` on `current()` — NOT by the `mat-select`
 * selectionChange event. Reason: when a single project is auto-selected on
 * bootstrap, the picker mounts with `[value]` already matching `current().id`,
 * and Angular Material does NOT fire `selectionChange` when the user picks the
 * already-selected value, so navigation would never trigger on first load.
 *
 * The effect classifies the current URL with {@link classifyFeature} and
 * picks the matching feature target. Three guarantees follow from that:
 *
 * 1. Switching projects while on `/modules/projects` keeps the user on
 *    `/modules/projects` (Projects has no per-project sub-route — the
 *    active project is owned by `ProjectService`, not the URL).
 * 2. Switching projects while on Kanban navigates to the new project's
 *    boards list (the regression-fix behavior).
 * 3. Switching projects while on Secrets navigates to the new project's
 *    secrets list (the regression-fix behavior).
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
   * when we're already on the target route. Seeded from the router
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
      const target = targetFor(classifyFeature(url), project.id);
      // Skip when we're already on the target route for this project.
      // Covers initial bootstrap (no history entry) and any back/forward
      // navigation that already lands on the right URL.
      if (url.startsWith(target.url)) {
        return;
      }
      // Explicit switch: the URL is for a DIFFERENT project (or a
      // landing route). Replace it with the target feature-scoped
      // route so the per-project route param updates and the page's
      // `projectId` effect re-fetches.
      void this.router.navigateByUrl(target.url);
    });
  }

  protected onSelectionChange(projectId: number): void {
    const project = this.projects().find((p) => p.id === projectId) ?? null;
    this.projectService.setActive(project);
    // The `effect()` above handles the navigation. No navigation here.
  }
}

/**
 * Classify the current URL into the feature the user is on. Exported for
 * unit tests so the routing policy is exercised independently from the
 * component. Order matters: more-specific branches are checked first so
 * `/modules/secrets/projects/1` doesn't get caught by anything else.
 */
export function classifyFeature(url: string): PickerFeature {
  const normalized = stripTrailingSlash(url);
  if (normalized === '/modules/projects' || normalized.startsWith('/modules/projects/')) {
    return 'projects';
  }
  if (normalized === '/modules/secrets' || normalized.startsWith('/modules/secrets/')) {
    return 'secrets';
  }
  if (normalized === '/modules/kanban' || normalized.startsWith('/modules/kanban/')) {
    return 'kanban';
  }
  return 'unknown';
}

/**
 * Resolve the per-project landing for the given feature. Projects itself
 * has no `:projectId` route — the active project lives on `ProjectService`
 * and is reflected in the picker/UI. Returning the bare `/modules/projects`
 * URL keeps the user where they were when they switched projects.
 */
export function targetFor(feature: PickerFeature, projectId: number): PickerTarget {
  switch (feature) {
    case 'projects':
      return { feature, url: '/modules/projects' };
    case 'secrets':
      return { feature, url: `/modules/secrets/projects/${projectId}` };
    case 'kanban':
      return { feature, url: `/modules/kanban/projects/${projectId}/boards` };
    case 'unknown':
    default:
      // No active feature in the URL — default to Projects (the shell's
      // top-level entry) instead of forcing a Kanban redirect. This is
      // the safer default because Projects is reachable from any
      // unauthenticated-bootstrapping URL state, and never steals the
      // user away from a deliberately visited `/modules/projects`.
      return { feature: 'projects', url: '/modules/projects' };
  }
}

function stripTrailingSlash(url: string): string {
  if (url.length > 1 && url.endsWith('/')) {
    return url.slice(0, -1);
  }
  return url;
}
