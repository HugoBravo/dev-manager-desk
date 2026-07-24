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
 * the feature they were on. The features that share the shell:
 *
 * - `projects` lives at `/modules/projects` (no `:projectId` segment —
 *   it's the project list/index).
 * - `tasks` lives under `/modules/tasks/projects/:projectId/tasks...`
 *   (S2 — task list lives between projects and kanban).
 * - `kanban` lives under `/modules/kanban/projects/:projectId/tasks/:taskId/boards...`
 *   (S2 — the chain now carries `:taskId`).
 * - `secrets` lives under `/modules/secrets/projects/:projectId...`
 * - `users` lives at `/modules/users/:id?...` (project-agnostic — the
 *   picker keeps the URL on `/modules/users` regardless of the active
 *   project; only `users` route param changes).
 *
 * Anything else (the bare `/modules/kanban` landing, unknown routes)
 * falls through as `unknown` and the picker defaults to the `tasks`
 * list for the active project — that's the "bare project" landing the
 * S2 spec mandates (S3 adds the tasks module UI).
 */
export type PickerFeature = 'projects' | 'tasks' | 'kanban' | 'secrets' | 'users' | 'unknown';

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
 *    tasks list (S2) — the picker cannot pick a taskId on the user's
 *    behalf, so it routes through the tasks list where the user picks
 *    a task. The legacy behavior jumped to the boards list directly,
 *    which broke once boards required `:taskId` in the URL.
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
      // The toolbar MUST NOT bounce the user out of a canonical Kanban
      // task URL that's already scoped to the active project.
      // `TasksListPage.select` navigates here directly from the tasks
      // list; without this guard the picker would route the user right
      // back to `/modules/tasks/projects/:projectId/tasks` on the
      // NavigationEnd that fires after the kanban navigation lands.
      if (isCanonicalKanbanUrlFor(url, project.id)) {
        return;
      }
      const target = targetFor(classifyFeature(url), project.id);
      if (url.startsWith(target.url)) {
        return;
      }
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
  if (normalized === '/modules/tasks' || normalized.startsWith('/modules/tasks/')) {
    return 'tasks';
  }
  if (normalized === '/modules/kanban' || normalized.startsWith('/modules/kanban/')) {
    return 'kanban';
  }
  if (normalized === '/modules/users' || normalized.startsWith('/modules/users/')) {
    return 'users';
  }
  return 'unknown';
}

/**
 * Whether the URL is a canonical task-scoped Kanban URL for the active
 * project. When `true`, the picker's effect MUST leave the URL alone —
 * navigating away would yank the user out of the board they just opened
 * from the tasks list.
 *
 * Canonical form: `/modules/kanban/projects/:projectId/tasks/:taskId/boards[/...]`.
 * The `:projectId` segment must match the active project. A `:taskId`
 * segment is required (S4 — boards are task-scoped in the URL).
 */
export function isCanonicalKanbanUrlFor(url: string, projectId: number): boolean {
  if (classifyFeature(url) !== 'kanban') {
    return false;
  }
  const normalized = stripTrailingSlash(url);
  const match = /^\/modules\/kanban\/projects\/(\d+)\/tasks\/(\d+)\/boards(?:\/|$)/.exec(
    normalized,
  );
  if (!match) {
    return false;
  }
  return Number(match[1]) === projectId;
}

/**
 * Resolve the per-project landing for the given feature. Projects and
 * users themselves have no `:projectId` route — the active project lives
 * on `ProjectService` and is reflected in the picker/UI. Returning the
 * bare feature URL keeps the user where they were when they switched
 * projects.
 *
 * S2: kanban and unknown both land on the tasks list for the project
 * because the picker doesn't have a taskId in scope — the user picks
 * one from the tasks list (S3 UI) before drilling into a board. This
 * also matches the S2 spec's "bare project lands on
 * /modules/tasks/projects/{p}/tasks" requirement.
 */
export function targetFor(feature: PickerFeature, projectId: number): PickerTarget {
  switch (feature) {
    case 'projects':
      return { feature, url: '/modules/projects' };
    case 'tasks':
      return { feature, url: `/modules/tasks/projects/${projectId}/tasks` };
    case 'secrets':
      return { feature, url: `/modules/secrets/projects/${projectId}` };
    case 'kanban':
      // S2: route the picker through the tasks list for the new project.
      // Without a taskId in scope the picker cannot pick a board, and
      // guessing one would either 404 (race) or land the user on the
      // wrong task's boards. The tasks list lets the user pick the task.
      return { feature: 'tasks', url: `/modules/tasks/projects/${projectId}/tasks` };
    case 'users':
      // USERS is project-agnostic — never carry a `:projectId` segment,
      // otherwise admin users would be silently bounced out of the
      // module on project switch (regression: USERS sidebar link).
      return { feature, url: '/modules/users' };
    case 'unknown':
    default:
      // S2: a bare project (no feature in URL) lands on the tasks list
      // for the active project. This is the canonical entry into the
      // per-project Kanban workflow — pick a task, then a board.
      return { feature: 'tasks', url: `/modules/tasks/projects/${projectId}/tasks` };
  }
}

function stripTrailingSlash(url: string): string {
  if (url.length > 1 && url.endsWith('/')) {
    return url.slice(0, -1);
  }
  return url;
}
