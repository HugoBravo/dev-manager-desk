import { InjectionToken, type Provider } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Single source of truth for the API base URL.
 *
 * The `/api` root is BAKED INTO `apiBaseUrl` (e.g.
 * `http://localhost:8000/api` in dev, `https://api.example.com/api` in prod).
 * Every client composes its own static version prefix on top:
 *
 * - `AuthApi` → `${apiBaseUrl}/auth/...` and `${apiBaseUrl}/user` (Sanctum)
 * - `ProjectsApi` → `${apiBaseUrl}/v1/projects`
 * - `KanbanApi` / `KanbanWriteApi` → `${apiBaseUrl}/v1/...`
 *
 * There is no shared `apiPrefix` field: keeping the v1 path on each client
 * makes the URL composition obvious at the call site and prevents accidental
 * double-prefixing (`/api/api/v1/...`).
 */
export interface ApiConfig {
  readonly apiBaseUrl: string;
}

export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG');

/**
 * Factory provider that binds {@link API_CONFIG} from the active environment.
 * Wired into `app.config.ts` before any service is constructed.
 */
export function apiConfigProvider(config: ApiConfig = environment): Provider {
  return { provide: API_CONFIG, useValue: config };
}