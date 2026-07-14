import { inject } from '@angular/core';
import {
  Router,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type RouterStateSnapshot,
} from '@angular/router';

import { ProjectService } from '../../../core/projects/project.service';

/**
 * Functional route guard for the secrets feature. Mirrors
 * `projectRequiredGuard` in the kanban feature but redirects to the new
 * secrets entry rather than the kanban projects picker.
 *
 * Contract:
 * - `ProjectService.currentId()` matches the `:projectId` URL param → allow.
 * - `currentId()` is null OR differs from the URL param → redirect to
 *   `/modules/secrets/projects` with `returnUrl` so the user can resume.
 */
export const secretsProjectRequiredGuard: CanActivateFn = (
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

  return router.createUrlTree(['/modules/secrets/projects'], {
    queryParams: { returnUrl: state.url },
  });
};

function readProjectIdParam(route: ActivatedRouteSnapshot): number | null {
  const raw = route.paramMap.get('projectId');
  if (raw === null) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
