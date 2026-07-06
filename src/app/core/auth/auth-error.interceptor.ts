import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Global 401 handler. When any non-auth endpoint returns 401 the session has
 * expired or the token was revoked server-side — we drop local credentials and
 * bounce the user to /auth/login, preserving the attempted URL as returnUrl so
 * they can resume after re-authenticating.
 *
 * Auth endpoints themselves (POST /auth/login, POST /auth/logout) are exempt:
 * the login flow surfaces 422/401 via the LoginResult error variant and the
 * logout endpoint is idempotent.
 */
const AUTH_PATH_PREFIXES = ['/auth/login', '/auth/logout'];

export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isAuthCall = AUTH_PATH_PREFIXES.some((suffix) =>
    req.url.endsWith(suffix),
  );

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        !isAuthCall &&
        error instanceof HttpErrorResponse &&
        error.status === 401
      ) {
        auth.clearSession();
        const returnUrl = router.url || '/';
        router.navigateByUrl(
          `/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`,
        );
      }
      return throwError(() => error);
    }),
  );
};