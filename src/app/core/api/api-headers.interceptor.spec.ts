import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { apiBaseInterceptor } from './api-headers.interceptor';

/**
 * Ordering test simulates the exact `app.config.ts` registration order:
 *   [authInterceptor, apiBaseInterceptor, authErrorInterceptor]
 * The auth-style interceptor stamps `Authorization: Bearer …`. A probe sits
 * AFTER apiBaseInterceptor and records which headers it can see on the
 * cloned request. If the probe sees the auth header AND the Accept header,
 * both interceptors ran in the correct order.
 */
const orderLog: string[] = [];
const resetLog = (): void => {
  orderLog.length = 0;
};

const authStyleInterceptor: HttpInterceptorFn = (req, next) => {
  orderLog.push('auth');
  return next(
    req.clone({ setHeaders: { Authorization: 'Bearer probe-token' } }),
  );
};

const orderProbeInterceptor: HttpInterceptorFn = (req, next) => {
  orderLog.push('probe');
  const hasAuth = req.headers.has('Authorization');
  const hasAccept = req.headers.has('Accept');
  return next(
    req.clone({
      setHeaders: { 'X-Order-Probe': `auth=${hasAuth};accept=${hasAccept}` },
    }),
  );
};

describe('apiBaseInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetLog();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            authStyleInterceptor,
            apiBaseInterceptor,
            orderProbeInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('adds Accept: application/json when missing', async () => {
    const p = firstValueFrom(http.get('/api/v1/projects'));
    const req = httpMock.expectOne('/api/v1/projects');
    expect(req.request.headers.get('Accept')).toBe('application/json');
    req.flush([]);
    await p;
  });

  it('does not overwrite an explicit Accept header', async () => {
    const p = firstValueFrom(
      http.get('/api/v1/projects', { headers: { Accept: 'text/csv' } }),
    );
    const req = httpMock.expectOne('/api/v1/projects');
    expect(req.request.headers.get('Accept')).toBe('text/csv');
    req.flush([]);
    await p;
  });

  it('runs after authInterceptor and preserves the Authorization header', async () => {
    const p = firstValueFrom(http.get('/api/v1/projects'));
    const req = httpMock.expectOne('/api/v1/projects');
    expect(req.request.headers.get('Authorization')).toBe('Bearer probe-token');
    expect(req.request.headers.get('Accept')).toBe('application/json');
    // The probe (sitting AFTER apiBaseInterceptor) sees both headers as
    // already-set. This proves authInterceptor ran first.
    expect(req.request.headers.get('X-Order-Probe')).toBe(
      'auth=true;accept=true',
    );
    expect(orderLog).toEqual(['auth', 'probe']);
    req.flush([]);
    await p;
  });
});
