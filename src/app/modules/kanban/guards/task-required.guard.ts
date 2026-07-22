import { inject } from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  Router,
  type RouterStateSnapshot,
} from '@angular/router';

import { TasksService } from '../../../core/tasks/tasks.service';

export const taskRequiredGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const tasks = inject(TasksService);
  const router = inject(Router);
  const projectId = readPositiveId(route, 'projectId');
  const taskId = readPositiveId(route, 'taskId');

  if (taskId !== null && tasks.currentId() === taskId) {
    return true;
  }

  return router.createUrlTree(['/modules/tasks/projects', projectId, 'tasks'], {
    queryParams: { returnUrl: state.url },
  });
};

function readPositiveId(route: ActivatedRouteSnapshot, key: string): number | null {
  const value = Number(route.paramMap.get(key));
  return Number.isInteger(value) && value > 0 ? value : null;
}
