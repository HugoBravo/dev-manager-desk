import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./core/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'modules',
    loadChildren: () =>
      import('./modules/modules.routes').then((m) => m.MODULES_ROUTES),
  },
  { path: '', pathMatch: 'full', redirectTo: 'modules' },
  { path: '**', redirectTo: 'modules' },
];