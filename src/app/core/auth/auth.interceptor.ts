import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthService } from './auth.service';

/**
 * Attaches `Authorization: Bearer <token>` to every outgoing request when a
 * token is present in {@link AuthService}. Sanctum does not need this header
 * on the auth endpoints themselves, but sending it harmlessly is simpler than
 * maintaining an allow-list.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();

  if (!token) {
    return next(req);
  }

  const authed = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
  return next(authed);
};