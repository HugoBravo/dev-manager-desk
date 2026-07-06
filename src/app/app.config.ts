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

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimationsAsync(),
    provideSignalFormsConfig({}),
    provideHttpClient(
      withInterceptors([authInterceptor, authErrorInterceptor]),
    ),
    // Single boot path: hydrate the session before the router activates, so
    // the auth guard never sees a stale (token-only) state.
    provideAppInitializer(() =>
      firstValueFrom(inject(AuthService).bootstrap()),
    ),
  ],
};