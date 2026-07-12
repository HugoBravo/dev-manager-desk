import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { of, Subject } from 'rxjs';

import { API_CONFIG } from '../../../../core/config/api-config';
import { ProjectService } from '../../../../core/projects/project.service';
import type { Project } from '../../../../core/projects/project.model';
import {
  ProjectEditorDialog,
  type ProjectEditorDialogResult,
} from '../../components/project-editor-dialog/project-editor-dialog';
import { ProjectsPage } from './projects-page';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;
const PROJECTS_URL = `${FULL_PREFIX}/projects`;

const sampleProject = (overrides: Partial<Project> = {}): Project => ({
  id: 7,
  name: 'Demo',
  slug: 'demo',
  description: null,
  owner_id: 1,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const paginated = (data: Project[]) => ({
  data: data.map((p) => ({ data: p })),
  links: { first: '', last: '', prev: null, next: null },
  meta: {
    current_page: 1,
    from: 1,
    last_page: 1,
    per_page: 25,
    to: data.length,
    total: data.length,
    path: '',
  },
});

interface MountOptions {
  bootstrapResponse?: 'empty' | 'one-project' | 'two-projects' | 'error-503';
}

function createComponent(options: MountOptions = {}): ComponentFixture<ProjectsPage> {
  const fixture = TestBed.createComponent(ProjectsPage);
  // First change detection: the page reads signals, but bootstrap is
  // not yet driven — `isBootstrapped()` will be false → loading state.
  fixture.detectChanges();
  const httpMock = TestBed.inject(HttpTestingController);
  const projectService = TestBed.inject(ProjectService);

  // Drive bootstrap explicitly (in production the `provideAppInitializer`
  // in app.config.ts does this synchronously at boot).
  void projectService.bootstrap();

  const bootstrapReq = httpMock.expectOne(PROJECTS_URL);
  switch (options.bootstrapResponse) {
    case 'one-project':
      bootstrapReq.flush(paginated([sampleProject({ id: 1, name: 'Alpha' })]));
      break;
    case 'two-projects':
      bootstrapReq.flush(
        paginated([
          sampleProject({ id: 1, name: 'Alpha', description: 'First one' }),
          sampleProject({ id: 2, name: 'Bravo' }),
        ]),
      );
      break;
    case 'error-503':
      bootstrapReq.flush(
        { message: 'down' },
        { status: 503, statusText: 'Service Unavailable' },
      );
      break;
    case 'empty':
    default:
      bootstrapReq.flush(paginated([]));
      break;
  }
  return fixture;
}

describe('ProjectsPage', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ProjectsPage, NoopAnimationsModule, MatDialogModule, MatSnackBarModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      ],
    }).compileComponents();
    // Silence snackbar dialogs in tests.
    TestBed.inject(MatSnackBar);
  });

  afterEach(() => window.localStorage.clear());

  it('renders the empty-state CTA when no projects exist', async () => {
    const fixture = createComponent({ bootstrapResponse: 'empty' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const cta = host.querySelector<HTMLButtonElement>('[data-testid="empty-state-create-project"]');
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute('aria-label')).toBe('Create your first project');
  });

  it('renders the header CTA when at least one project exists', async () => {
    const fixture = createComponent({ bootstrapResponse: 'one-project' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const cta = host.querySelector<HTMLButtonElement>('[data-testid="create-project-button"]');
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute('aria-label')).toBe('Create project');
  });

  it('renders the project name + description in the list', async () => {
    const fixture = createComponent({ bootstrapResponse: 'two-projects' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Alpha');
    expect(host.textContent).toContain('Bravo');
    expect(host.textContent).toContain('First one');
  });

  it('clicking the empty-state CTA opens ProjectEditorDialog in create mode', async () => {
    const fixture = createComponent({ bootstrapResponse: 'empty' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog);
    const openSpy = vi.spyOn(dialog, 'open');

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="empty-state-create-project"]',
    )!;
    cta.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const call = openSpy.mock.calls.find((c) => c[0] === ProjectEditorDialog);
    expect(call).toBeDefined();
    expect((call![1]?.data as { mode?: string } | undefined)?.mode).toBe('create');
  });

  it('saving the dialog calls ProjectService.create, shows a snackbar, and navigates to boards', async () => {
    const fixture = createComponent({ bootstrapResponse: 'empty' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Subject so we control exactly when the dialog closes — gives the
    // test time to attach spies on `MatSnackBar.open` and
    // `ProjectService.create` BEFORE the page resumes its async chain.
    const afterClosedSubject = new Subject<ProjectEditorDialogResult>();
    const dialog = TestBed.inject(MatDialog);
    const dialogRef: Partial<MatDialogRef<unknown, unknown>> = {
      afterClosed: () => afterClosedSubject.asObservable(),
      close: () => undefined,
    };
    vi.spyOn(dialog, 'open').mockReturnValue(dialogRef as MatDialogRef<unknown, unknown>);

    const projectService = TestBed.inject(ProjectService);
    const createSpy = vi.spyOn(projectService, 'create');
    const setActiveSpy = vi.spyOn(projectService, 'setActive');

    const snackBar = TestBed.inject(MatSnackBar);
    const snackSpy = vi.spyOn(snackBar, 'open');

    const page = fixture.componentInstance as unknown as {
      router: { navigate: (cmds: unknown[]) => Promise<boolean> };
    };
    const navSpy = vi.spyOn(page.router, 'navigate');

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="empty-state-create-project"]',
    )!;
    cta.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Now emit the dialog's saved result.
    afterClosedSubject.next({
      action: 'saved',
      project: { name: 'My Project', description: null },
    });
    afterClosedSubject.complete();
    await fixture.whenStable();
    // Drain microtask chain so service.create runs and http request fires.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(createSpy).toHaveBeenCalledWith({ name: 'My Project', description: null });

    // Resolve the POST from ProjectService.create → ProjectsApi.create.
    const httpMock = TestBed.inject(HttpTestingController);
    const createReq = httpMock.expectOne(PROJECTS_URL);
    expect(createReq.request.method).toBe('POST');
    expect(createReq.request.body).toEqual({ name: 'My Project', description: null });
    createReq.flush({ data: sampleProject({ id: 42, name: 'My Project' }) });
    await fixture.whenStable();
    fixture.detectChanges();
    // Drain the continuation after the await resolves.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(setActiveSpy).toHaveBeenCalled();
    expect(snackSpy).toHaveBeenCalled();
    expect(navSpy).toHaveBeenCalledWith(['/modules/kanban/projects', 42, 'boards']);
  });

  it('cancel does NOT call service.create or navigate', async () => {
    const fixture = createComponent({ bootstrapResponse: 'empty' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog);
    const dialogRef: Partial<MatDialogRef<unknown, unknown>> = {
      afterClosed: () => of({ action: 'cancel' } as ProjectEditorDialogResult),
      close: () => undefined,
    };
    vi.spyOn(dialog, 'open').mockReturnValue(dialogRef as MatDialogRef<unknown, unknown>);

    const projectService = TestBed.inject(ProjectService);
    const createSpy = vi.spyOn(projectService, 'create');

    const page = fixture.componentInstance as unknown as {
      router: { navigate: (cmds: unknown[]) => Promise<boolean> };
    };
    const navSpy = vi.spyOn(page.router, 'navigate');

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="empty-state-create-project"]',
    )!;
    cta.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(createSpy).not.toHaveBeenCalled();
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('service.create error does NOT navigate; snackbar surfaces the error', async () => {
    const fixture = createComponent({ bootstrapResponse: 'empty' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog);
    const dialogRef: Partial<MatDialogRef<unknown, unknown>> = {
      afterClosed: () =>
        of({
          action: 'saved',
          project: { name: 'Will Fail', description: null },
        } as ProjectEditorDialogResult),
      close: () => undefined,
    };
    vi.spyOn(dialog, 'open').mockReturnValue(dialogRef as MatDialogRef<unknown, unknown>);

    const projectService = TestBed.inject(ProjectService);
    const createSpy = vi.spyOn(projectService, 'create').mockImplementation(() => {
      throw new Error('boom');
    });

    const page = fixture.componentInstance as unknown as {
      router: { navigate: (cmds: unknown[]) => Promise<boolean> };
    };
    const navSpy = vi.spyOn(page.router, 'navigate');

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="empty-state-create-project"]',
    )!;
    cta.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(createSpy).toHaveBeenCalled();
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('double-submit: second click while isSubmitting === true does nothing', async () => {
    const fixture = createComponent({ bootstrapResponse: 'empty' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Subject: emit ONCE on the first dialog close (so the page's
    // firstValueFrom resolves and `handleSaved` runs, flipping
    // `isSubmitting` to true), then keep it open for the second click.
    // We mock `ProjectService.create` to return a never-resolving Promise
    // so `isSubmitting` stays true and the page never navigates away.
    const afterClosedSubject = new Subject<ProjectEditorDialogResult>();
    const dialog = TestBed.inject(MatDialog);
    const dialogRef: Partial<MatDialogRef<unknown, unknown>> = {
      afterClosed: () => afterClosedSubject.asObservable(),
      close: () => undefined,
    };
    vi.spyOn(dialog, 'open').mockReturnValue(dialogRef as MatDialogRef<unknown, unknown>);

    const projectService = TestBed.inject(ProjectService);
    const createSpy = vi
      .spyOn(projectService, 'create')
      .mockImplementation(() => new Promise<never>(() => undefined));

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="empty-state-create-project"]',
    )!;
    cta.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Emit the saved result; the page enters handleSaved() and
    // calls create() which never resolves — isSubmitting stays true.
    afterClosedSubject.next({
      action: 'saved',
      project: { name: 'In Flight', description: null },
    });
    await fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    // The page is now in-flight. Subsequent clicks should be ignored.
    cta.click();
    cta.click();
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Create should have been invoked exactly once (from the first click).
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});