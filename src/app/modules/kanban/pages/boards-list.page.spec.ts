import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { API_CONFIG } from '../../../core/config/api-config';
import { ProjectService } from '../../../core/projects/project.service';
import { KanbanApi } from '../api/kanban.api';
import { BoardsStore } from '../stores/boards.store';
import { BoardsListPage } from './boards-list.page';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;
const BOARDS_URL = (projectId: number) =>
  `${FULL_PREFIX}/projects/${projectId}/kanban/boards`;

const paginated = <T>(data: T[]) => ({
  data,
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

const sampleBoard = (id: number, name: string) => ({
  id,
  project_id: 7,
  name,
  position: 'n',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

function createComponent(projectId = '7') {
  const fixture = TestBed.createComponent(BoardsListPage);
  // Provide the required input via the binding the router uses.
  fixture.componentRef.setInput('projectId', projectId);
  fixture.detectChanges();
  return fixture;
}

describe('BoardsListPage', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [BoardsListPage, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: API_CONFIG,
          useValue: { apiBaseUrl: API_BASE_URL },
        },
        KanbanApi,
        BoardsStore,
      ],
    }).compileComponents();
  });

  afterEach(() => window.localStorage.clear());

  it('renders the loading state until the response lands', () => {
    const fixture = createComponent();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('mat-progress-spinner')).not.toBeNull();
  });

  it('renders the boards list on success', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(BOARDS_URL(7)).flush(
      paginated([sampleBoard(1, 'Sprint 42'), sampleBoard(2, 'Sprint 43')]),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.boards-title')?.textContent).toContain(
      'Boards',
    );
    expect(host.querySelectorAll('.board-card').length).toBe(2);
  });

  it('renders the empty state when no boards are returned', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(BOARDS_URL(7)).flush(paginated([]));
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.state-empty')).not.toBeNull();
    expect(host.querySelector('.state-empty')?.textContent).toContain(
      'No boards yet',
    );
  });

  it('renders the error state when the API fails', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Not found',
    );
  });

  it('reloads when Retry is clicked', async () => {
    const fixture = createComponent();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(BOARDS_URL(7))
      .flush({ message: 'gone' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    await fixture.whenStable();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[mat-stroked-button]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock.expectOne(BOARDS_URL(7)).flush(paginated([sampleBoard(1, 'Retry')]));
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.board-card').length).toBe(1);
    expect(httpMock.expectNone.bind(httpMock)).toBeDefined();
  });
});
