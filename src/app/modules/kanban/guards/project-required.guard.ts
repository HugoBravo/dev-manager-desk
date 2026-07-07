import { inject } from '@angular/core';
import {
  Router,
  type CanActivateFn,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';

import { ProjectService } from '../../../core/projects/project.service';
import { ErrorNormalizer } from '../../../core/errors/error-normalizer';

/**
 * Functional route guard for kanban pages that require a project context.
 *
 * Contract (spec `project-selection` F6 + kanban-read F5):
 * - If `ProjectService.currentId()` matches the `:projectId` route param →
 *   allow.
 * - If `currentId()` is null OR differs from the route param → redirect to
 *   `/modules/kanban/projects` with a `returnUrl` so the user can resume
 *   where they were.
 *
 * Reading the route param from the `ActivatedRouteSnapshot` keeps the
 * guard decoupled from `withComponentInputBinding()` ordering — works
 * regardless of whether the binding has been wired.
 */
export const projectRequiredGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const projectService = inject(ProjectService);
  const router = inject(Router);

  const currentId = projectService.currentId();
  const routeParam = readProjectIdParam(route);

  if (currentId !== null && routeParam !== null && currentId === routeParam) {
    return true;
  }

  return router.createUrlTree(['/modules/kanban/projects'], {
    queryParams: { returnUrl: state.url },
  });
};

/**
 * Helper for the rare case where neither `currentId()` nor the route param is
 * a usable project id. Throws a typed `notFound` `ApiError` so the kanban
 * pages can rely on a single error shape across guards and pages. Used by
 * pages that need to bail out without a navigation redirect (e.g. when
 * computing a derived signal during render).
 */
export function requireProjectId(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw ErrorNormalizer.fromSynthetic(
      'notFound',
      'No active project. Pick one from the toolbar before navigating here.',
    );
  }
  return value;
}

/**
 * Read the `:projectId` param from the URL. Returns `null` if it is missing
 * or not a positive integer. Routes that need different keys can pass them
 * in via `route.paramMap.get('projectId')` directly.
 */
function readProjectIdParam(route: ActivatedRouteSnapshot): number | null {
  const raw = route.paramMap.get('projectId');
  if (raw === null) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
