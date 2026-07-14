import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import type { User } from '../../../core/auth/auth.types';
import { adminUserGuard } from './admin.guard';

const makeUser = (id: number | string, isAdmin: boolean): User => ({
  id,
  name: 'Jane',
  email: 'jane@example.com',
  email_verified_at: null,
  is_admin: isAdmin,
});

class AuthServiceStub {
  user(): User | null {
    return this._user;
  }
  setUser(user: User | null): void {
    this._user = user;
  }
  private _user: User | null = null;
}

describe('adminUserGuard', () => {
  let auth: AuthServiceStub;

  beforeEach(() => {
    auth = new AuthServiceStub();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: { createUrlTree: vi.fn() } },
      ],
    });
  });

  function run(routeId: string | null, user: User | null): boolean | UrlTree {
    auth.setUser(user);
    return TestBed.runInInjectionContext(() => {
      const route = {
        paramMap: { get: (key: string) => (key === 'id' ? routeId : null) },
      } as unknown as ActivatedRouteSnapshot;
      const state = { url: '/modules/users/' + (routeId ?? '') } as RouterStateSnapshot;
      return adminUserGuard(route, state);
    }) as boolean | UrlTree;
  }

  it('redirects unauthenticated users', () => {
    const result = run('1', null);
    expect(result).not.toBe(true);
  });

  it('allows admins on any URL', () => {
    expect(run('7', makeUser(99, true))).toBe(true);
  });

  it('allows non-admins editing their OWN record', () => {
    expect(run('3', makeUser(3, false))).toBe(true);
  });

  it('redirects non-admins editing another user', () => {
    const result = run('7', makeUser(3, false));
    expect(result).not.toBe(true);
  });

  it('redirects non-admins on the list page', () => {
    const result = run(null, makeUser(3, false));
    expect(result).not.toBe(true);
  });
});
