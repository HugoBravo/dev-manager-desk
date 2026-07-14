import type { Routes } from '@angular/router';

import { authGuard } from '../../core/auth/auth.guard';
import { secretsProjectRequiredGuard } from './guards/secrets-project-required.guard';

/**
 * Routes for the `/modules/secrets` feature. Lazy-loaded from
 * `modules.routes.ts`.
 *
 * - `/modules/secrets` → project picker fallback (mirrors the kanban
 *   empty state).
 * - `/modules/secrets/projects/:projectId` → project-scoped list of
 *   secrets. Guarded by {@link secretsProjectRequiredGuard} so the URL
 *   can never carry a stale `:projectId` that differs from the toolbar
 *   selection.
 */
export const SECRETS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'projects' },
      {
        path: 'projects',
        loadComponent: () => import('./pages/secrets-empty.page').then((m) => m.SecretsEmptyPage),
      },
      {
        path: 'projects/:projectId',
        canActivate: [secretsProjectRequiredGuard],
        loadComponent: () => import('./pages/secrets-list.page').then((m) => m.SecretsListPage),
      },
    ],
  },
];
