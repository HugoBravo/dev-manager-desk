import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';

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
  private cachedUser: User | null = null;
  private sessionToken: string | null = null;
  private refreshResult: Observable<User | null> = of(null);

  readonly me = vi.fn(() => this.refreshResult);

  user(): User | null {
    return this.cachedUser;
  }

  token(): string | null {
    return this.sessionToken;
  }

  setSession(
    cachedUser: User | null,
    refreshResult: Observable<User | null>,
    sessionToken: string | null = 'present-token',
  ): void {
    this.cachedUser = cachedUser;
    this.refreshResult = refreshResult;
    this.sessionToken = sessionToken;
  }
}

describe('adminUserGuard', () => {
  let auth: AuthServiceStub;
  let router: Router;

  beforeEach(() => {
    auth = new AuthServiceStub();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
  });

  async function run(
    routeId: string | null,
    cachedUser: User | null,
    refreshResult: Observable<User | null>,
    sessionToken: string | null = 'present-token',
  ): Promise<boolean | UrlTree> {
    auth.setSession(cachedUser, refreshResult, sessionToken);
    const route = {
      paramMap: { get: (key: string) => (key === 'id' ? routeId : null) },
    } as unknown as ActivatedRouteSnapshot;
    const state = {
      url: routeId === null ? '/modules/users' : `/modules/users/${routeId}`,
    } as RouterStateSnapshot;
    const result = TestBed.runInInjectionContext(() => adminUserGuard(route, state));
    const resolved = isObservable(result)
      ? await firstValueFrom(result)
      : await Promise.resolve(result);

    if (typeof resolved === 'boolean' || resolved instanceof UrlTree) {
      return resolved;
    }

    throw new Error('Guard returned an unsupported result');
  }

  function expectRedirect(result: boolean | UrlTree, expectedUrl: string): void {
    expect(result).toBeInstanceOf(UrlTree);
    if (result instanceof UrlTree) {
      expect(router.serializeUrl(result)).toBe(expectedUrl);
    }
  }

  it('allows when the cached role is false and the refreshed user is admin', async () => {
    const result = await run('7', makeUser(99, false), of(makeUser(99, true)));

    expect(result).toBe(true);
    expect(auth.me).toHaveBeenCalledOnce();
  });

  it('denies another-user access when the cached role is true and the refreshed role is false', async () => {
    const result = await run('7', makeUser(99, true), of(makeUser(99, false)));

    expectRedirect(result, '/modules/projects');
    expect(auth.me).toHaveBeenCalledOnce();
  });

  it('denies list access for a refreshed non-admin', async () => {
    const result = await run(null, makeUser(99, true), of(makeUser(99, false)));

    expectRedirect(result, '/modules/projects');
  });

  it('denies with the stable projects UrlTree when refresh fails', async () => {
    const result = await run(
      '99',
      makeUser(99, true),
      throwError(() => new Error('refresh failed')),
    );

    expectRedirect(result, '/modules/projects');
    expect(auth.me).toHaveBeenCalledOnce();
  });

  it('allows a refreshed non-admin editing their own record', async () => {
    const result = await run('3', makeUser(99, true), of(makeUser(3, false)));

    expect(result).toBe(true);
    expect(auth.me).toHaveBeenCalledOnce();
  });

  it('redirects a sessionless user to login with the exact returnUrl', async () => {
    const result = await run('1', null, of(makeUser(1, true)), null);

    expectRedirect(result, '/auth/login?returnUrl=%2Fmodules%2Fusers%2F1');
    expect(auth.me).not.toHaveBeenCalled();
  });
});
