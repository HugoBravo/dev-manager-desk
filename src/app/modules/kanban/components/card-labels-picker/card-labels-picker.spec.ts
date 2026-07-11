import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../../core/config/api-config';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import type { KanbanCard, KanbanLabel } from '../../models';
import { LabelsStore } from '../../stores/labels.store';
import { CardLabelsPicker } from './card-labels-picker';

const API_BASE_URL = 'http://localhost:8000/api';

function makeLabel(overrides: Partial<KanbanLabel> = {}): KanbanLabel {
  return {
    id: 4,
    name: 'bug',
    color: '#ef4444',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCard(overrides: Partial<KanbanCard> = {}): KanbanCard {
  return {
    id: 87,
    column_id: 12,
    title: 'Card',
    body: null,
    due_date: null,
    archived_at: null,
    position: 'k',
    labels: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mountPicker(opts: {
  card?: KanbanCard;
  userLabels?: readonly KanbanLabel[];
  disabled?: boolean;
} = {}): {
  fixture: ComponentFixture<CardLabelsPicker>;
  host: HTMLElement;
  detect: () => void;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CardLabelsPicker, MatDialogModule, MatSnackBarModule, NoopAnimationsModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: API_CONFIG,
        useValue: { apiBaseUrl: API_BASE_URL },
      },
      KanbanWriteApi,
      LabelsStore,
    ],
  });
  const fixture = TestBed.createComponent(CardLabelsPicker);
  fixture.componentRef.setInput('card', opts.card ?? makeCard({ labels: [makeLabel()] }));
  fixture.componentRef.setInput(
    'userLabels',
    opts.userLabels ?? [makeLabel({ id: 4, name: 'bug' }), makeLabel({ id: 7, name: 'p1' })],
  );
  fixture.componentRef.setInput('disabled', opts.disabled ?? false);
  // The setChain call must happen before the user can click; mirrors what
  // the host dialog does. Without it the click would throw on missing
  // project/board/column ids, but disabled mode short-circuits before that.
  fixture.componentInstance.setChain(7, 4, 12);
  fixture.detectChanges();
  return {
    fixture,
    host: fixture.nativeElement as HTMLElement,
    detect: () => fixture.detectChanges(),
  };
}

describe('CardLabelsPicker', () => {
  it('renders user labels as interactive chips when not disabled', () => {
    const { host, fixture } = mountPicker();
    const httpMock = TestBed.inject(HttpTestingController);
    const chips = host.querySelectorAll('app-label-chip');
    expect(chips.length).toBe(2);
    httpMock.verify();
  });

  it('marks chips whose label id is in the card set as toggled', () => {
    const bug = makeLabel({ id: 4, name: 'bug' });
    const p1 = makeLabel({ id: 7, name: 'p1' });
    const { host } = mountPicker({
      card: makeCard({ labels: [bug] }),
      userLabels: [bug, p1],
    });
    const httpMock = TestBed.inject(HttpTestingController);
    const chipHosts = host.querySelectorAll('app-label-chip');
    expect(chipHosts.length).toBe(2);
    const chipInstances = Array.from(chipHosts).map((el) => {
      const btn = el.querySelector('button') as HTMLButtonElement | null;
      return btn?.getAttribute('aria-pressed') ?? null;
    });
    expect(chipInstances).toContain('true');
    expect(chipInstances).toContain('false');
    httpMock.verify();
  });

  it('does NOT issue any HTTP request when a chip is clicked while [disabled]="true"', () => {
    const bug = makeLabel({ id: 4, name: 'bug' });
    const p1 = makeLabel({ id: 7, name: 'p1' });
    const { host } = mountPicker({
      card: makeCard({ labels: [bug] }),
      userLabels: [bug, p1],
      disabled: true,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    const chipButtons = host.querySelectorAll('app-label-chip button');
    expect(chipButtons.length).toBeGreaterThan(0);
    const beforePressed = Array.from(chipButtons).map((b) =>
      (b as HTMLButtonElement).getAttribute('aria-pressed'),
    );
    (chipButtons[0] as HTMLButtonElement).click();
    (chipButtons[0] as HTMLButtonElement).click();
    httpMock.expectNone(() => true);
    const afterPressed = Array.from(host.querySelectorAll('app-label-chip button')).map((b) =>
      (b as HTMLButtonElement).getAttribute('aria-pressed'),
    );
    expect(afterPressed).toEqual(beforePressed);
    httpMock.verify();
  });
});
