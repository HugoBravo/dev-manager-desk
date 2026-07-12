import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter, Router, type Routes } from '@angular/router';
import { Location } from '@angular/common';

import { API_CONFIG } from '../../../../core/config/api-config';
import { ProjectsPage } from './projects-page';
import { PROJECTS_ROUTES } from '../../projects.routes';

const API_BASE_URL = 'http://localhost:8000/api';

describe('projects routing', () => {
  let router: Router;
  let location: Location;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
    // Use the real `PROJECTS_ROUTES` plus a minimal kanban-shaped stub
    // route for the sibling test (`/modules/kanban/projects/42/boards`).
    // We do NOT pull in the real `KANBAN_ROUTES` here because that
    // brings a full dependency graph we don't need to verify routing.
    const stubRoutes: Routes = [
      { path: 'projects', children: PROJECTS_ROUTES },
      {
        path: 'kanban',
        children: [
          {
            path: 'projects',
            loadComponent: () =>
              import('../../../kanban/pages/projects-empty.page').then(
                (m) => m.ProjectsEmptyPage,
              ),
          },
          {
            path: 'projects/:projectId/boards',
            loadComponent: () =>
              import('../../../kanban/pages/boards-list.page').then(
                (m) => m.BoardsListPage,
              ),
          },
        ],
      },
    ];

    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(stubRoutes),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
  });

  afterEach(() => window.localStorage.clear());

  it('navigates /modules/projects to ProjectsPage (not the parametric kanban route)', async () => {
    // The ProjectsPage component requires a working bootstrap. Stub
    // out the HTTP request so the page can render.
    await router.navigate(['/projects']);
    expect(location.path()).toBe('/projects');
    // `root.firstChild` is the `/projects` parent (no component, just
    // children); the leaf with the actual component is one level deeper.
    const leaf = router.routerState.snapshot.root.firstChild?.firstChild;
    expect(leaf?.component).toBe(ProjectsPage);
  });

  it('does not shadow /modules/kanban/projects/42/boards (parametric route still resolves)', async () => {
    await router.navigate(['/kanban/projects', '42', 'boards']);
    // Should land on the parametric route, not be redirected to
    // /modules/projects (which would happen if the static `/projects`
    // sibling were incorrectly matching the prefix).
    expect(location.path()).toBe('/kanban/projects/42/boards');
    // The parametric route resolves to BoardsListPage; the static
    // ProjectsPage would have been the wrong answer.
    const leaf = router.routerState.snapshot.root.firstChild?.firstChild;
    expect(leaf?.component).not.toBe(ProjectsPage);
  });
});