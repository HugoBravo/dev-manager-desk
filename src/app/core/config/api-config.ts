import { InjectionToken, type Provider } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Single source of truth for the API base URL and versioned prefix.
 *
 * Auth endpoints compose URLs as `${apiBaseUrl}/auth/...` and `${apiBaseUrl}/user`
 * (the Laravel app already shares the `/api` root for v1 resources). Kanban
 * clients compose URLs as `${apiBaseUrl}${apiPrefix}/...`.
 */
export interface ApiConfig {
  readonly apiBaseUrl: string;
  readonly apiPrefix: string;
}

export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG');

/**
 * Factory provider that binds {@link API_CONFIG} from the active environment.
 * Wired into `app.config.ts` before any service is constructed.
 */
export function apiConfigProvider(config: ApiConfig = environment): Provider {
  return { provide: API_CONFIG, useValue: config };
}
