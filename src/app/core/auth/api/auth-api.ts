import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { API_CONFIG } from '../../config/api-config';
import type { AuthResponse, AuthWireResponse, LoginRequest, UserResponse } from '../auth.types';

const DEVICE_NAME = 'dev-manager-desk:browser';

/**
 * Thin HttpClient wrapper around the Laravel Sanctum auth endpoints.
 *
 * Intentionally signal-free and state-free: it only returns Observables and
 * performs the request shaping. State management lives in {@link AuthService}.
 *
 * URLs are composed from {@link API_CONFIG.apiBaseUrl} (e.g.
 * `http://localhost:8000/api`, which already includes the `/api` root shared
 * with the v1 kanban resources) plus the per-endpoint path.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(API_CONFIG);

  login(credentials: Omit<LoginRequest, 'device_name'>): Observable<AuthResponse> {
    const payload: LoginRequest = {
      email: credentials.email,
      password: credentials.password,
      device_name: DEVICE_NAME,
    };
    return this.http
      .post<AuthWireResponse>(`${this.apiConfig.apiBaseUrl}/auth/login`, payload)
      .pipe(
        map((response) => ({
          user: response.user.data,
          token: response.token,
        })),
      );
  }

  me(): Observable<UserResponse['data']> {
    return this.http
      .get<UserResponse>(`${this.apiConfig.apiBaseUrl}/user`)
      .pipe(map((response) => response.data));
  }

  logout(): Observable<void> {
    // 204 No Content resolves with `null`; map to `undefined` so callers can
    // treat this like a normal void-returning call.
    return this.http
      .post<void>(`${this.apiConfig.apiBaseUrl}/auth/logout`, {})
      .pipe(map(() => undefined));
  }
}
