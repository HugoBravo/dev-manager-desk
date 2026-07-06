import { inject } from '@angular/core';
import {
  Router,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};