import type { Routes } from '@angular/router';

export const TASKS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/tasks-list.page').then((m) => m.TasksListPage),
  },
  {
    path: 'projects/:projectId/tasks',
    loadComponent: () => import('./pages/tasks-list.page').then((m) => m.TasksListPage),
  },
];
