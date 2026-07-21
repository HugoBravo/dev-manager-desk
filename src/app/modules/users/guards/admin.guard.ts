import { inject } from '@angular/core';
import {
  Router,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type RouterStateSnapshot,
} from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';

/**
 * Functional route guard for the user-administration feature.
 *
 * Contract:
 * - No bearer token → redirect to /auth/login with returnUrl.
 * - An authenticated session refreshes `AuthService.me()` before deciding.
 * - Refreshed `user.is_admin === true` → allow.
 * - Refreshed non-admin editing SELF → allow.
 * - Refreshed non-admin on the list or another user → /modules/projects.
 * - Refresh failure or null response → /modules/projects.
 *
 * Why `/modules/projects` and not `/modules/kanban`? Bare
 * `/modules/kanban` is NOT a stable landing — `ToolbarProjectPickerComponent`
 * expands it to `/modules/kanban/projects/:id/boards` the moment a project
 * becomes active. That would put denied users on what looks like the
 * main shell entry but is actually a single project board, hiding the
 * denial. Projects is the stable, project-agnostic landing.
 *
 * Defence in depth: the backend's UserPolicy still rejects any cross-user
 * action with 403 even if a stale SPA shell tries to bypass this guard.
 */
export const adminUserGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.token() === null) {
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  const targetId = readUserIdParam(route);
  const denied = router.createUrlTree(['/modules/projects']);

  return auth.me().pipe(
    map((user) => {
      if (user?.is_admin === true) {
        return true;
      }

      if (user !== null && targetId !== null && String(targetId) === String(user.id)) {
        return true;
      }

      return denied;
    }),
    catchError(() => of(denied)),
  );
};

function readUserIdParam(route: ActivatedRouteSnapshot): number | null {
  const raw = route.paramMap.get('id');
  if (raw === null) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
