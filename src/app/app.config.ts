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
    provideAppInitializer(async () => {
      const auth = inject(AuthService);
      await firstValueFrom(auth.bootstrap());
      const projects = inject(ProjectService);
      await projects.bootstrap();
    }),
  ],
};
