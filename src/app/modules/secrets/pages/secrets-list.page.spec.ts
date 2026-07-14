import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';

import { API_CONFIG } from '../../../core/config/api-config';
import { ProjectService } from '../../../core/projects/project.service';
import type { Project } from '../../../core/projects/project.model';
import {
  SecretEditorDialog,
  type SecretEditorDialogData,
  type SecretEditorDialogResult,
} from '../components/secret-editor-dialog/secret-editor-dialog';
import {
  SecretDeleteDialog,
  type SecretDeleteDialogData,
  type SecretDeleteDialogResult,
} from '../components/secret-delete-dialog/secret-delete-dialog';
import type { Secret } from '../models/secret.model';
import { SecretsListPage } from './secrets-list.page';
import { SecretsStore } from '../stores/secrets.store';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;
const COLLECTION_URL = (projectId: number) => `${FULL_PREFIX}/projects/${projectId}/secrets`;

const sampleProject: Project = {
  id: 7,
  name: 'Alpha',
  slug: 'alpha',
  description: null,
  owner_id: 1,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const secret = (overrides: Partial<Secret> = {}): Secret => ({
  id: overrides.id ?? 1,
  project_id: overrides.project_id ?? 7,
  key: overrides.key ?? 'API_KEY',
  value: overrides.value ?? 'plaintext',
  description: overrides.description ?? null,
  created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
  updated_at: overrides.updated_at ?? '2026-01-01T01T00:00Z',
});

const wrapped = (rows: Secret[]) => ({
  data: rows.map((row) => ({ data: row })),
  links: { first: '', last: '', prev: null, next: null },
  meta: {
    current_page: 1,
    from: 1,
    last_page: 1,
    per_page: 25,
    to: rows.length,
    total: rows.length,
    path: '',
  },
});

function configureTestbed(): void {
  TestBed.resetTestingModule();
  window.localStorage.clear();
  TestBed.configureTestingModule({
    imports: [SecretsListPage, NoopAnimationsModule, MatDialogModule, MatSnackBarModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      SecretsStore,
    ],
  });
}

function setActiveProject(id: number): void {
  const projectService = TestBed.inject(ProjectService);
  (
    projectService as unknown as {
      _projects: { set: (v: Project[]) => void };
    }
  )._projects.set([{ ...sampleProject, id }]);
  (
    projectService as unknown as {
      _currentId: { set: (v: number | null) => void };
    }
  )._currentId.set(id);
}

interface MountResult {
  fixture: ComponentFixture<SecretsListPage>;
}

function mountPage(projectId = 7): MountResult {
  configureTestbed();
  setActiveProject(projectId);
  const fixture = TestBed.createComponent(SecretsListPage);
  fixture.componentRef.setInput('projectId', String(projectId));
  fixture.detectChanges();
  return { fixture };
}

describe('SecretsListPage', () => {
  afterEach(() => window.localStorage.clear());

  it('renders the empty state when no secrets are returned', async () => {
    const { fixture } = mountPage();
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    const req = httpMock.expectOne(COLLECTION_URL(7));
    req.flush(wrapped([]));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="empty-state-create-secret"]')).not.toBeNull();
  });

  it('renders the list with one card per secret', async () => {
    const { fixture } = mountPage();
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(COLLECTION_URL(7))
      .flush(wrapped([secret({ id: 1, key: 'A' }), secret({ id: 2, key: 'B' })]));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('app-secret-card').length).toBe(2);
    expect(host.querySelector('[data-testid="create-secret-button"]')).not.toBeNull();
  });

  it('renders an error card with retry button on 404', async () => {
    const { fixture } = mountPage();
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(COLLECTION_URL(7))
      .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="secrets-retry"]')).not.toBeNull();
    expect(host.textContent).toContain("Couldn't load secrets");
  });

  it('loading skeleton renders while the request is in flight', async () => {
    const { fixture } = mountPage();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(COLLECTION_URL(7)).flush(wrapped([]));
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('create dialog: saving POSTs to /secrets and appends the new secret to the cache', async () => {
    const { fixture } = mountPage();
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(COLLECTION_URL(7)).flush(wrapped([secret({ id: 1, key: 'EXISTING' })]));
    await fixture.whenStable();
    fixture.detectChanges();

    const afterClosedSubject = new Subject<SecretEditorDialogResult>();
    TestBed.inject(MatDialog).open = vi.fn().mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
      close: () => undefined,
    } as unknown as MatDialogRef<unknown, unknown>);

    const snack = TestBed.inject(MatSnackBar);
    const snackSpy = vi.spyOn(snack, 'open');

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="create-secret-button"]',
    )!;
    cta.click();
    fixture.detectChanges();
    await fixture.whenStable();

    afterClosedSubject.next({
      action: 'saved',
      payload: { key: 'NEW_KEY', value: 'v', description: null },
    });
    afterClosedSubject.complete();
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const req = httpMock.expectOne(COLLECTION_URL(7));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      key: 'NEW_KEY',
      value: 'v',
      description: null,
    });
    req.flush({ data: secret({ id: 99, key: 'NEW_KEY' }) });
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('app-secret-card').length).toBe(2);
    expect(snackSpy).toHaveBeenCalled();
  });

  it('create: 422 surfaces a snackbar but does not append anything to the cache', async () => {
    const { fixture } = mountPage();
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(COLLECTION_URL(7)).flush(wrapped([secret({ id: 1, key: 'EXISTING' })]));
    await fixture.whenStable();
    fixture.detectChanges();

    const afterClosedSubject = new Subject<SecretEditorDialogResult>();
    TestBed.inject(MatDialog).open = vi.fn().mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
      close: () => undefined,
    } as unknown as MatDialogRef<unknown, unknown>);
    const snack = TestBed.inject(MatSnackBar);
    const snackSpy = vi.spyOn(snack, 'open');

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="create-secret-button"]',
    )!;
    cta.click();
    fixture.detectChanges();
    await fixture.whenStable();

    afterClosedSubject.next({
      action: 'saved',
      payload: { key: 'BAD', value: 'v', description: null },
    });
    afterClosedSubject.complete();
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    httpMock
      .expectOne(COLLECTION_URL(7))
      .flush(
        { message: 'invalid', errors: { key: ['invalid'] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('app-secret-card').length).toBe(1);
    expect(snackSpy).toHaveBeenCalled();
  });

  it('delete dialog: confirming issues DELETE and removes the row from the cache', async () => {
    const { fixture } = mountPage();
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(COLLECTION_URL(7)).flush(wrapped([secret({ id: 1, key: 'EXISTING' })]));
    await fixture.whenStable();
    fixture.detectChanges();

    const afterClosedSubject = new Subject<SecretDeleteDialogResult>();
    TestBed.inject(MatDialog).open = vi.fn().mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
      close: () => undefined,
    } as unknown as MatDialogRef<unknown, unknown>);
    const snack = TestBed.inject(MatSnackBar);
    const snackSpy = vi.spyOn(snack, 'open');

    const deleteBtn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="secret-card-delete"]',
    )!;
    deleteBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    afterClosedSubject.next({ confirmed: true });
    afterClosedSubject.complete();
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const req = httpMock.expectOne(`${COLLECTION_URL(7)}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-secret-card').length).toBe(
      0,
    );
    expect(snackSpy).toHaveBeenCalled();
  });

  it('cancel: deleting with confirmed:false does NOT issue DELETE', async () => {
    const { fixture } = mountPage();
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(COLLECTION_URL(7)).flush(wrapped([secret({ id: 1, key: 'EXISTING' })]));
    await fixture.whenStable();
    fixture.detectChanges();

    const afterClosedSubject = new Subject<SecretDeleteDialogResult>();
    TestBed.inject(MatDialog).open = vi.fn().mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
      close: () => undefined,
    } as unknown as MatDialogRef<unknown, unknown>);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="secret-card-delete"]')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    afterClosedSubject.next({ confirmed: false });
    afterClosedSubject.complete();
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    httpMock.expectNone({ method: 'DELETE' });
  });

  it('double-submit guard: while a create is in flight, the CTAs stay disabled', async () => {
    const { fixture } = mountPage();
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(COLLECTION_URL(7)).flush(wrapped([secret({ id: 1 })]));
    await fixture.whenStable();
    fixture.detectChanges();

    const afterClosedSubject = new Subject<SecretEditorDialogResult>();
    TestBed.inject(MatDialog).open = vi.fn().mockReturnValue({
      afterClosed: () => afterClosedSubject.asObservable(),
      close: () => undefined,
    } as unknown as MatDialogRef<unknown, unknown>);

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="create-secret-button"]',
    )!;
    cta.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    afterClosedSubject.next({
      action: 'saved',
      payload: { key: 'IN_FLIGHT', value: 'v', description: null },
    });
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    cta.click();
    cta.click();
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const createCount = httpMock
      .match(COLLECTION_URL(7))
      .filter((r) => r.request.method === 'POST').length;
    expect(createCount).toBe(1);
  });
});

describe('openCreateDialog dialog data wiring', () => {
  it('passes mode:create + projectId + a triggerElement to SecretEditorDialog', async () => {
    const { fixture } = mountPage();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(COLLECTION_URL(7)).flush(wrapped([]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog);
    const openSpy = vi.spyOn(dialog, 'open');

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="empty-state-create-secret"]',
    )!;
    cta.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const call = openSpy.mock.calls.find((c) => c[0] === SecretEditorDialog);
    expect(call).toBeDefined();
    const data = call![1]?.data as SecretEditorDialogData | undefined;
    expect(data?.mode).toBe('create');
    expect(data?.projectId).toBe(7);
    expect(data?.triggerElement).toBeTruthy();
  });

  it('passes mode:delete + secretKey to SecretDeleteDialog when row Delete is clicked', async () => {
    const { fixture } = mountPage();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(COLLECTION_URL(7)).flush(wrapped([secret({ id: 1, key: 'A' })]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog);
    const openSpy = vi.spyOn(dialog, 'open');

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="secret-card-delete"]')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    const call = openSpy.mock.calls.find((c) => c[0] === SecretDeleteDialog);
    expect(call).toBeDefined();
    const data = call![1]?.data as SecretDeleteDialogData | undefined;
    expect(data?.secretKey).toBe('A');
  });
});
