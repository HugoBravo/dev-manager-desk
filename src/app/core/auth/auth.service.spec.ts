import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { API_CONFIG } from '../config/api-config';
import { AuthService } from './auth.service';
import type { AuthResponse, User } from './auth.types';

const API_BASE_URL = 'http://localhost:8000/api';
const USER_STORAGE_KEY = 'dev-manager-desk:auth:user';
const TOKEN_STORAGE_KEY = 'dev-manager-desk:auth:token';

const TEST_ROUTES = [
  { path: 'auth/login', children: [] },
  { path: 'modules', children: [] },
];

const fakeUser: User = {
  id: 42,
  email: 'hugo@example.com',
  name: 'Hugo',
  email_verified_at: '2026-01-01T00:00:00Z',
};

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    window.localStorage.removeItem(USER_STORAGE_KEY);
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(TEST_ROUTES),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    window.localStorage.removeItem(USER_STORAGE_KEY);
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  });

  describe('initial state', () => {
    it('starts unauthenticated when storage is empty', () => {
      expect(service.user()).toBeNull();
      expect(service.token()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('hydrates user and token from storage when present', () => {
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fakeUser));
      window.localStorage.setItem(TOKEN_STORAGE_KEY, 'stored-token');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter(TEST_ROUTES),
          { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        ],
      });
      const rehydrated = TestBed.inject(AuthService);

      expect(rehydrated.user()).toEqual(fakeUser);
      expect(rehydrated.token()).toBe('stored-token');
      expect(rehydrated.isAuthenticated()).toBe(true);
    });
  });

  describe('login', () => {
    it('stores user + token on success and flips isAuthenticated', async () => {
      const mockResponse: AuthResponse = {
        user: fakeUser,
        token: 'fresh-token',
      };

      const resultPromise = firstValueFrom(
        service.login({ email: 'hugo@example.com', password: 'secret123' }),
      );

      const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        email: 'hugo@example.com',
        password: 'secret123',
        device_name: 'dev-manager-desk:browser',
      });
      req.flush(mockResponse);

      const result = await resultPromise;
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.user).toEqual(fakeUser);
      }
      expect(service.user()).toEqual(fakeUser);
      expect(service.token()).toBe('fresh-token');
      expect(service.isAuthenticated()).toBe(true);
      expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(
        'fresh-token',
      );
    });

    it('surfaces the 422 field-error map without mutating signals', async () => {
      const resultPromise = firstValueFrom(
        service.login({ email: 'bad@example.com', password: 'wrong' }),
      );

      const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
      req.flush(
        {
          message: 'The given data was invalid.',
          errors: { email: ['Email no registrado.'] },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      const result = await resultPromise;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Email no registrado.');
        expect(result.fieldErrors).toEqual({ email: ['Email no registrado.'] });
      }
      expect(service.user()).toBeNull();
      expect(service.token()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('returns a generic invalid-credentials message on 401', async () => {
      const resultPromise = firstValueFrom(
        service.login({ email: 'x@x.com', password: 'nope' }),
      );

      const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
      req.flush(
        { message: 'Unauthorized' },
        { status: 401, statusText: 'Unauthorized' },
      );

      const result = await resultPromise;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Credenciales invalidas.');
      }
    });

    it('returns a connectivity message on network failure (status 0)', async () => {
      const resultPromise = firstValueFrom(
        service.login({ email: 'x@x.com', password: 'nope' }),
      );

      const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
      req.error(new ProgressEvent('error'));

      const result = await resultPromise;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('No se pudo conectar con el servidor.');
      }
    });
  });

  describe('me', () => {
    it('returns null without hitting the API when no token is present', async () => {
      const result = await firstValueFrom(service.me());
      expect(result).toBeNull();
      httpMock.expectNone(`${API_BASE_URL}/user`);
    });

    it('updates the user signal on success', async () => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, 'present-token');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter(TEST_ROUTES),
          { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        ],
      });
      const svc = TestBed.inject(AuthService);
      const localHttpMock = TestBed.inject(HttpTestingController);

      const resultPromise = firstValueFrom(svc.me());
      const req = localHttpMock.expectOne(`${API_BASE_URL}/user`);
      req.flush({ data: fakeUser });

      const user = await resultPromise;
      expect(user).toEqual(fakeUser);
      expect(svc.user()).toEqual(fakeUser);
      expect(svc.isAuthenticated()).toBe(true);
    });

    it('returns null (instead of throwing) on 401', async () => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, 'expired-token');
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fakeUser));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter(TEST_ROUTES),
          { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        ],
      });
      const svc = TestBed.inject(AuthService);
      const localHttpMock = TestBed.inject(HttpTestingController);

      const resultPromise = firstValueFrom(svc.me());
      const req = localHttpMock.expectOne(`${API_BASE_URL}/user`);
      req.flush(
        { message: 'Unauthenticated.' },
        { status: 401, statusText: 'Unauthorized' },
      );

      const user = await resultPromise;
      expect(user).toBeNull();
      // State is not cleared by me() itself — that's the error interceptor's
      // job in production. We just verify me() didn't crash.
      expect(svc.token()).toBe('expired-token');
    });
  });

  describe('logout', () => {
    it('POSTs /auth/logout and clears state', async () => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, 'present-token');
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fakeUser));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter(TEST_ROUTES),
          { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        ],
      });
      const svc = TestBed.inject(AuthService);
      const localHttpMock = TestBed.inject(HttpTestingController);

      const logoutPromise = firstValueFrom(svc.logout());

      const req = localHttpMock.expectOne(`${API_BASE_URL}/auth/logout`);
      expect(req.request.method).toBe('POST');
      req.flush(null, { status: 204, statusText: 'No Content' });

      await logoutPromise;

      expect(svc.user()).toBeNull();
      expect(svc.token()).toBeNull();
      expect(svc.isAuthenticated()).toBe(false);
      expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    });

    it('swallows logout failures (best-effort) and still clears state', async () => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, 'present-token');
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fakeUser));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter(TEST_ROUTES),
          { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        ],
      });
      const svc = TestBed.inject(AuthService);
      const localHttpMock = TestBed.inject(HttpTestingController);

      const logoutPromise = firstValueFrom(svc.logout());

      const req = localHttpMock.expectOne(`${API_BASE_URL}/auth/logout`);
      req.flush(
        { message: 'Server down' },
        { status: 500, statusText: 'Internal Server Error' },
      );

      const result = await logoutPromise;
      expect(result).toBeUndefined();
      expect(svc.user()).toBeNull();
      expect(svc.token()).toBeNull();
    });

    it('skips the API call and just clears state when no token exists', async () => {
      const logoutPromise = firstValueFrom(service.logout());
      await flushMicrotasks();
      const result = await logoutPromise;
      expect(result).toBeUndefined();
      httpMock.expectNone(`${API_BASE_URL}/auth/logout`);
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('drops in-memory and persisted credentials', () => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, 'x');
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fakeUser));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter(TEST_ROUTES),
          { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        ],
      });
      const svc = TestBed.inject(AuthService);

      svc.clearSession();

      expect(svc.user()).toBeNull();
      expect(svc.token()).toBeNull();
      expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    });
  });

  describe('bootstrap', () => {
    it('resolves immediately when no token exists', async () => {
      await firstValueFrom(service.bootstrap());
      httpMock.expectNone(`${API_BASE_URL}/user`);
      expect(service.isBootstrapped()).toBe(true);
    });

    it('hydrates the user when a token exists and /user succeeds', async () => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, 'present-token');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter(TEST_ROUTES),
          { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        ],
      });
      const svc = TestBed.inject(AuthService);
      const localHttpMock = TestBed.inject(HttpTestingController);

      const bootstrapPromise = firstValueFrom(svc.bootstrap());

      const req = localHttpMock.expectOne(`${API_BASE_URL}/user`);
      req.flush({ data: fakeUser });

      await bootstrapPromise;
      expect(svc.user()).toEqual(fakeUser);
      expect(svc.isBootstrapped()).toBe(true);
    });

    it('still resolves bootstrap on /user 401 (so guard can redirect)', async () => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, 'expired');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter(TEST_ROUTES),
          { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        ],
      });
      const svc = TestBed.inject(AuthService);
      const localHttpMock = TestBed.inject(HttpTestingController);

      const bootstrapPromise = firstValueFrom(svc.bootstrap());

      const req = localHttpMock.expectOne(`${API_BASE_URL}/user`);
      req.flush(
        { message: 'Unauthenticated.' },
        { status: 401, statusText: 'Unauthorized' },
      );

      await bootstrapPromise;
      expect(svc.isBootstrapped()).toBe(true);
    });
  });
});