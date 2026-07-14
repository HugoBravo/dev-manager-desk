import { inject } from '@angular/core';
import {
  Router,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

/**
 * Functional route guard for the user-administration feature.
 *
 * Contract:
 * - `AuthService.user()` is null → redirect to /auth/login with returnUrl.
 * - `user().is_admin === true` → allow.
 * - Non-admin editing SELF (`:id` matches their own id and they are not
 *   admin) → allow (self-service profile).
 * - Non-admin editing ANOTHER user (`:id` differs from their own id) →
 *   redirect to /modules/kanban.
 *
 * Defence in depth: the backend's UserPolicy still rejects any cross-user
 * action with 403 even if a stale SPA shell tries to bypass this guard.
 */
export const adminUserGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.user();

  if (user === null) {
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  if (user.is_admin === true) {
    return true;
  }

  // Self-service profile edit is always allowed for the authenticated user.
  const targetId = readUserIdParam(route);
  if (targetId !== null && String(targetId) === String(user.id)) {
    return true;
  }

  return router.createUrlTree(['/modules/kanban']);
};

function readUserIdParam(route: ActivatedRouteSnapshot): number | null {
  const raw = route.paramMap.get('id');
  if (raw === null) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
