import type { Routes } from '@angular/router';

import { projectRequiredGuard } from './guards/project-required.guard';

export const KANBAN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./kanban.page').then((m) => m.KanbanPage),
  },
  {
    path: 'projects',
    loadComponent: () => import('./pages/projects-empty.page').then((m) => m.ProjectsEmptyPage),
  },
  {
    path: 'projects/:projectId/boards',
    canActivate: [projectRequiredGuard],
    loadComponent: () => import('./pages/boards-list.page').then((m) => m.BoardsListPage),
  },
  {
    path: 'projects/:projectId/boards/trash',
    canActivate: [projectRequiredGuard],
    loadComponent: () => import('./pages/board-trash.page').then((m) => m.BoardTrashPage),
  },
  {
    path: 'projects/:projectId/boards/:boardId',
    canActivate: [projectRequiredGuard],
    loadComponent: () => import('./pages/board-detail.page').then((m) => m.BoardDetailPage),
  },
];
