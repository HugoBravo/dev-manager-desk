import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  inject,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
} from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideSignalFormsConfig } from '@angular/forms/signals';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/auth/auth.interceptor';
import { authErrorInterceptor } from './core/auth/auth-error.interceptor';
import { apiBaseInterceptor } from './core/api/api-headers.interceptor';
import { apiConfigProvider } from './core/config/api-config';
import { ProjectService } from './core/projects/project.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimationsAsync(),
    provideSignalFormsConfig({}),
    apiConfigProvider(),
    provideHttpClient(
      withInterceptors([
        // Order matters. The auth header is set first so apiBaseInterceptor can
        // see it on the cloned request and add Accept without clobbering it.
        authInterceptor,
        apiBaseInterceptor,
        authErrorInterceptor,
      ]),
    ),
    // Single boot path: hydrate the session AND the project list before the
    // router activates so the auth guard, the project picker, and any future
    // ProjectRequiredGuard never see a stale state.
    //
    // Both services MUST be injected in the same synchronous frame as the
    // initializer registration. Once the function awaits, the injection context
    // is lost and a second `inject()` call (e.g., for ProjectService after
    // awaiting auth.bootstrap()) throws NG0203. Capture them up front and
    // compose the bootstraps with Promise.all.
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      const projects = inject(ProjectService);
      return Promise.all([
        firstValueFrom(auth.bootstrap()),
        projects.bootstrap(),
      ]);
    }),
  ],
};
