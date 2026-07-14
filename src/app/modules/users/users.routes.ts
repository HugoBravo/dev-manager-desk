import type { Routes } from '@angular/router';

import { authGuard } from '../../core/auth/auth.guard';
import { adminUserGuard } from './guards/admin.guard';

/**
 * Routes for the `/modules/users` feature. Lazy-loaded from
 * `modules.routes.ts`.
 *
 * - `/modules/users` → list page (admin only; non-admins are redirected
 *   by {@link adminUserGuard}).
 * - `/modules/users/:id` → edit page (admin or self).
 */
export const USERS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, adminUserGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./pages/users-list.page').then((m) => m.UsersListPage),
      },
      {
        path: ':id',
        loadComponent: () => import('./pages/user-edit.page').then((m) => m.UserEditPage),
      },
    ],
  },
];
