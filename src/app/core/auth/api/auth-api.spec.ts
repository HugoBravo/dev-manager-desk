import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_CONFIG } from '../../config/api-config';
import { AuthApi } from './auth-api';
import type { AuthResponse, AuthWireResponse, UserResponse } from '../auth.types';

const API_BASE_URL = 'http://localhost:8000/api';

describe('AuthApi', () => {
  let api: AuthApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      ],
    });
    api = TestBed.inject(AuthApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('login', () => {
    it.each([true, false])(
      'POSTs credentials and unwraps user.data with is_admin=%s as a strict boolean',
      async (isAdmin) => {
        const mockResponse: AuthWireResponse = {
          token: 'plain-token-abc',
          user: {
            data: {
              id: 7,
              email: 'hugo@example.com',
              name: 'Hugo',
              email_verified_at: '2026-01-01T00:00:00Z',
              is_admin: isAdmin,
            },
          },
        };
        const expectedResponse: AuthResponse = {
          token: mockResponse.token,
          user: mockResponse.user.data,
        };

        const responsePromise = firstValueFrom(
          api.login({ email: 'hugo@example.com', password: 'secret123' }),
        );

        const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
          email: 'hugo@example.com',
          password: 'secret123',
          device_name: 'dev-manager-desk:browser',
        });
        req.flush(mockResponse);

        const response = await responsePromise;
        expect(response).toEqual(expectedResponse);
        expect(response.user.is_admin).toBe(isAdmin);
        expect(typeof response.user.is_admin).toBe('boolean');
      },
    );
  });

  describe('me', () => {
    it('GETs /user and unwraps the .data envelope', async () => {
      const user: UserResponse['data'] = {
        id: 7,
        email: 'hugo@example.com',
        name: 'Hugo',
        email_verified_at: null,
        is_admin: false,
      };
      const mockResponse: UserResponse = { data: user };

      const responsePromise = firstValueFrom(api.me());

      const req = httpMock.expectOne(`${API_BASE_URL}/user`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      const result = await responsePromise;
      expect(result).toEqual(user);
    });
  });

  describe('logout', () => {
    it('POSTs to /auth/logout and resolves on 204 No Content', async () => {
      const responsePromise = firstValueFrom(api.logout());

      const req = httpMock.expectOne(`${API_BASE_URL}/auth/logout`);
      expect(req.request.method).toBe('POST');
      req.flush(null, { status: 204, statusText: 'No Content' });

      const result = await responsePromise;
      expect(result).toBeUndefined();
    });
  });
});
