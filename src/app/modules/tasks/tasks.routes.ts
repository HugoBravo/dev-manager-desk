import type { Routes } from '@angular/router';

export const TASKS_ROUTES: Routes = [
  {
    path: 'projects/:projectId/tasks',
    loadComponent: () => import('./pages/tasks-list.page').then((m) => m.TasksListPage),
  },
  {
    path: '',
    loadComponent: () => import('./pages/tasks-list.page').then((m) => m.TasksListPage),
  },
];
