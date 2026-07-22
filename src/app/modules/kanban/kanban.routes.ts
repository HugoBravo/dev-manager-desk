import type { Routes } from '@angular/router';

import { projectRequiredGuard } from './guards/project-required.guard';

/**
 * Kanban routes. The URL chain reflects the kanban-per-task backend:
 * `/modules/kanban/projects/:projectId/tasks/:taskId/boards[/...]`. The
 * `:taskId` segment threads through every project-scoped route because the
 * backend now requires it on the URL (`/api/v1/projects/{p}/tasks/{t}/kanban/...`).
 *
 * Routes registered here:
 *  - `''`                       — bare Kanban landing (`KanbanPage`)
 *  - `'projects'`               — empty state when no project is selected
 *  - `'projects/:projectId/tasks/:taskId/boards'`
 *                              — boards list (`BoardsListPage`)
 *  - `'projects/:projectId/tasks/:taskId/boards/trash'`
 *                              — trashed boards (`BoardTrashPage`)
 *  - `'projects/:projectId/tasks/:taskId/boards/:boardId'`
 *                              — board detail (`BoardDetailPage`)
 *
 * The `:taskId` segment is bound into each page via
 * `withComponentInputBinding()` (configured in `modules.routes.ts`); pages
 * expose `taskId = input.required<string>()` and read it from there.
 */
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
    path: 'projects/:projectId/tasks/:taskId/boards',
    canActivate: [projectRequiredGuard],
    loadComponent: () => import('./pages/boards-list.page').then((m) => m.BoardsListPage),
  },
  {
    path: 'projects/:projectId/tasks/:taskId/boards/trash',
    canActivate: [projectRequiredGuard],
    loadComponent: () => import('./pages/board-trash.page').then((m) => m.BoardTrashPage),
  },
  {
    path: 'projects/:projectId/tasks/:taskId/boards/:boardId',
    canActivate: [projectRequiredGuard],
    loadComponent: () => import('./pages/board-detail.page').then((m) => m.BoardDetailPage),
  },
];
