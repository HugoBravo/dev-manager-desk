import { type HttpInterceptorFn } from '@angular/common/http';

/**
 * Attaches `Accept: application/json` to every outgoing request that doesn't
 * already carry an explicit `Accept` header. Laravel returns HTML (or redirects
 * to a login page) on errors when the client does not opt into JSON.
 *
 * Registered AFTER `authInterceptor` in `app.config.ts` so the auth header is
 * already on the cloned request by the time we read it.
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.headers.has('Accept')) {
    return next(req);
  }

  const jsonReq = req.clone({
    setHeaders: { Accept: 'application/json' },
  });
  return next(jsonReq);
};
