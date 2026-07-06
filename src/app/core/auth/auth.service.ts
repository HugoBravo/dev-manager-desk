import { Service, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, of } from 'rxjs';

import type { LoginRequest, LoginResult, User } from './auth.types';
import { AuthApi } from './api/auth-api';

const USER_STORAGE_KEY = 'dev-manager-desk:auth:user';
const TOKEN_STORAGE_KEY = 'dev-manager-desk:auth:token';

/**
 * Auth orchestration. Holds the authenticated user and bearer token in signals,
 * persists them to localStorage, talks to {@link AuthApi}, and is the single
 * boot point for hydrating the session via {@link bootstrap}.
 *
 * NOTE on bootstrap: `me()` is intentionally NOT auto-called from the
 * constructor even when a token exists in storage. Bootstrap is wired up
 * through `provideAppInitializer` in `app.config.ts`, which calls
 * {@link bootstrap} exactly once before the router activates. This avoids
 * racing multiple `me()` calls during navigation and prevents the auth guard
 * from seeing a stale (token-only) state.
 */
@Service()
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(this.restoreUserFromStorage());
  private readonly _token = signal<string | null>(this.restoreTokenFromStorage());
  private readonly _bootstrapped = signal(false);

  readonly user = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isBootstrapped = computed(() => this._bootstrapped());

  /**
   * Single boot entry point. If a token exists in storage we revalidate it by
   * calling `GET /user`; otherwise we resolve immediately so the app boots
   * straight into the login screen. Resolves regardless of `me()` outcome —
   * a 401 is handled by clearing state, and the auth guard will then redirect
   * to /auth/login.
   */
  bootstrap(): Observable<void> {
    if (this._bootstrapped()) {
      return of(undefined);
    }

    const token = this._token();
    if (!token) {
      this._bootstrapped.set(true);
      return of(undefined);
    }

    return new Observable<void>((subscriber) => {
      this.me().subscribe({
        complete: () => {
          this._bootstrapped.set(true);
          subscriber.next();
          subscriber.complete();
        },
        error: () => {
          this._bootstrapped.set(true);
          subscriber.next();
          subscriber.complete();
        },
      });
    });
  }

  login(credentials: Omit<LoginRequest, 'device_name'>): Observable<LoginResult> {
    return new Observable<LoginResult>((subscriber) => {
      this.api.login(credentials).subscribe({
        next: (response) => {
          this.persistUser(response.user);
          this.persistToken(response.token);
          this._user.set(response.user);
          this._token.set(response.token);
          subscriber.next({ ok: true, user: response.user });
          subscriber.complete();
        },
        error: (error: unknown) => {
          subscriber.next(this.toLoginError(error));
          subscriber.complete();
        },
      });
    });
  }

  me(): Observable<User | null> {
    if (!this._token()) {
      return of(null);
    }

    return new Observable<User | null>((subscriber) => {
      this.api.me().subscribe({
        next: (user) => {
          this.persistUser(user);
          this._user.set(user);
          subscriber.next(user);
          subscriber.complete();
        },
        error: (error: unknown) => {
          // The auth-error interceptor handles 401 redirect globally; here
          // we just surface a null user so callers don't crash.
          if (
            error instanceof HttpErrorResponse &&
            (error.status === 401 || error.status === 403)
          ) {
            subscriber.next(null);
            subscriber.complete();
            return;
          }
          subscriber.error(error);
        },
      });
    });
  }

  logout(): Observable<void> {
    const token = this._token();

    this.clearSession();
    void this.router.navigateByUrl('/auth/login');

    if (!token) {
      return of(undefined);
    }

    // Best-effort server-side logout. Even if it fails (token already revoked,
    // network down, etc.) we have already cleared local state.
    return this.api.logout().pipe(
      catchError(() => of(undefined)),
    );
  }

  /**
   * Clears the in-memory and persisted session without navigating. The
   * auth-error interceptor uses this when it detects a 401 from a non-auth
   * endpoint so the next route activation sees a clean state.
   */
  clearSession(): void {
    this._user.set(null);
    this._token.set(null);
    this.clearStorage();
  }

  private toLoginError(error: unknown): LoginResult {
    if (!(error instanceof HttpErrorResponse)) {
      return { ok: false, error: 'Error inesperado. Intentalo de nuevo.' };
    }

    if (error.status === 0) {
      return {
        ok: false,
        error: 'No se pudo conectar con el servidor.',
      };
    }

    if (error.status === 422) {
      const body = error.error as
        | { message?: string; errors?: Record<string, string[]> }
        | undefined;
      const fieldErrors = body?.errors;
      const message =
        (fieldErrors && firstFieldMessage(fieldErrors)) ??
        body?.message ??
        'Datos invalidos.';
      return {
        ok: false,
        error: message,
        fieldErrors,
      };
    }

    if (error.status === 401 || error.status === 403) {
      return { ok: false, error: 'Credenciales invalidas.' };
    }

    if (error.status === 429) {
      return {
        ok: false,
        error: 'Demasiados intentos. Espera un momento antes de reintentar.',
      };
    }

    return { ok: false, error: 'Error inesperado. Intentalo de nuevo.' };
  }

  private persistUser(user: User): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // Storage may be full or disabled (private mode); auth still works in-memory.
    }
  }

  private persistToken(token: string): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // See persistUser.
    }
  }

  private restoreUserFromStorage(): User | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(USER_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<User> | null;
      if (
        parsed &&
        typeof parsed.email === 'string' &&
        typeof parsed.name === 'string' &&
        (typeof parsed.id === 'number' || typeof parsed.id === 'string')
      ) {
        return {
          id: parsed.id,
          email: parsed.email,
          name: parsed.name,
          email_verified_at:
            typeof parsed.email_verified_at === 'string'
              ? parsed.email_verified_at
              : null,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private restoreTokenFromStorage(): string | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private clearStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.removeItem(USER_STORAGE_KEY);
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Ignore storage access errors.
    }
  }
}

function firstFieldMessage(errors: Record<string, string[]>): string | null {
  for (const key of Object.keys(errors)) {
    const list = errors[key];
    if (Array.isArray(list) && list.length > 0) {
      return list[0] ?? null;
    }
  }
  return null;
}