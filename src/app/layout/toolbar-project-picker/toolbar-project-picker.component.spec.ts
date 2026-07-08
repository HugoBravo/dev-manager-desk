import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';

import { API_CONFIG } from '../../core/config/api-config';
import { ProjectService } from '../../core/projects/project.service';
import { ToolbarProjectPickerComponent } from './toolbar-project-picker.component';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';

const projectsUrl = `${API_BASE_URL}${API_PREFIX}/projects`;
const paginated = (data: unknown[]) => ({
  // Laravel paginator wraps each resource in its own `{ data: Project }`
  // envelope (JsonResource default).
  data: data.map((project) => ({ data: project })),
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

describe('ToolbarProjectPickerComponent', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ToolbarProjectPickerComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: API_CONFIG,
          useValue: { apiBaseUrl: API_BASE_URL },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => window.localStorage.clear());

  it('mounts with aria-busy=true while bootstrap is in flight', () => {
    const fixture = TestBed.createComponent(ToolbarProjectPickerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('mat-progress-bar')).not.toBeNull();
    expect(host.querySelector('mat-select')).toBeNull();
  });

  it('reflects the active project once the service has a selection', async () => {
    const service = TestBed.inject(ProjectService);
    const httpMock = TestBed.inject(HttpTestingController);
    const p = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([
        {
          id: 7,
          name: 'Demo',
          slug: 'demo',
          owner_id: 1,
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
      ]),
    );
    await p;
    httpMock.verify();

    service.setActive(service.projects()[0]!);
    expect(service.current()?.id).toBe(7);
  });

  it('navigates to the kanban boards list when a project is selected', async () => {
    const service = TestBed.inject(ProjectService);
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const p = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(
      paginated([
        {
          id: 7,
          name: 'Demo',
          slug: 'demo',
          owner_id: 1,
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
      ]),
    );
    await p;

    const fixture = TestBed.createComponent(ToolbarProjectPickerComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      onSelectionChange: (id: number) => void;
    };
    component.onSelectionChange(7);

    expect(service.current()?.id).toBe(7);
    expect(navigateSpy).toHaveBeenCalledWith([
      '/modules/kanban',
      'projects',
      7,
      'boards',
    ]);
  });

  it('does NOT navigate when the selection is cleared (null)', async () => {
    const service = TestBed.inject(ProjectService);
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const p = service.bootstrap();
    httpMock.expectOne(projectsUrl).flush(paginated([]));
    await p;

    const fixture = TestBed.createComponent(ToolbarProjectPickerComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      onSelectionChange: (id: number) => void;
    };
    component.onSelectionChange(-1); // no match -> project will be null

    expect(service.current()).toBeNull();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
