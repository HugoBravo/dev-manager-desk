import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import type {
  AuthResponse,
  LoginRequest,
  UserResponse,
} from '../auth.types';

// TODO: move to environments/api.config.ts when env setup exists.
const API_BASE_URL = 'http://localhost:8000/api';
const DEVICE_NAME = 'dev-manager-desk:browser';

/**
 * Thin HttpClient wrapper around the Laravel Sanctum auth endpoints.
 *
 * Intentionally signal-free and state-free: it only returns Observables and
 * performs the request shaping. State management lives in {@link AuthService}.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(credentials: Omit<LoginRequest, 'device_name'>): Observable<AuthResponse> {
    const payload: LoginRequest = {
      email: credentials.email,
      password: credentials.password,
      device_name: DEVICE_NAME,
    };
    return this.http.post<AuthResponse>(`${API_BASE_URL}/auth/login`, payload);
  }

  me(): Observable<UserResponse['data']> {
    return this.http
      .get<UserResponse>(`${API_BASE_URL}/user`)
      .pipe(map((response) => response.data));
  }

  logout(): Observable<void> {
    // 204 No Content resolves with `null`; map to `undefined` so callers can
    // treat this like a normal void-returning call.
    return this.http
      .post<void>(`${API_BASE_URL}/auth/logout`, {})
      .pipe(map(() => undefined));
  }
}