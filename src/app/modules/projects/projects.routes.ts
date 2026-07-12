import type { Routes } from '@angular/router';

/**
 * Routes for the `/modules/projects` feature. Lazy-loads the
 * `ProjectsPage` standalone component.
 *
 * NOTE: this file is NOT registered in `modules.routes.ts` until Task 6
 * of the add-create-project-entry change wires the sidenav link. Until
 * that wiring lands, `/modules/projects` is unreachable from the app.
 */
export const PROJECTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/projects-page/projects-page').then((m) => m.ProjectsPage),
  },
];