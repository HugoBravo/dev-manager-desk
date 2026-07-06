import type { Routes } from '@angular/router';

export const KANBAN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./kanban.page').then((m) => m.KanbanPage),
  },
];