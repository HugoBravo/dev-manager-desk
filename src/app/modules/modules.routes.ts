import type { Routes } from '@angular/router';

import { authGuard } from '../core/auth/auth.guard';

export const MODULES_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./modules-shell/modules-shell.page').then((m) => m.ModulesShellPage),
    children: [
      {
        path: 'projects',
        loadChildren: () => import('./projects/projects.routes').then((m) => m.PROJECTS_ROUTES),
      },
      {
        path: 'kanban',
        loadChildren: () => import('./kanban/kanban.routes').then((m) => m.KANBAN_ROUTES),
      },
      {
        path: 'secrets',
        loadChildren: () => import('./secrets/secrets.routes').then((m) => m.SECRETS_ROUTES),
      },
      {
        path: 'users',
        loadChildren: () => import('./users/users.routes').then((m) => m.USERS_ROUTES),
      },
      { path: '', pathMatch: 'full', redirectTo: 'kanban' },
    ],
  },
];
