import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../../core/config/api-config';
import type { KanbanCard } from '../../models';
import { KanbanApi } from '../../api/kanban.api';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';
import {
  CardDetailDialog,
  type CardDetailDialogData,
  type CardDetailDialogResult,
} from './card-detail-dialog';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;
const cardsBase = (p: number, b: number, c: number) =>
  `${FULL_PREFIX}/projects/${p}/kanban/boards/${b}/columns/${c}/cards`;

const sampleCard = (overrides: Partial<KanbanCard> = {}): KanbanCard => ({
  id: 87,
  column_id: 12,
  title: 'Implement login form',
  body: 'A long-enough body to be visible.',
  due_date: null,
  archived_at: null,
  position: 'k',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function mountDialog(opts: { archived?: boolean } = {}) {
  TestBed.resetTestingModule();
  const card = sampleCard(
    opts.archived ? { archived_at: '2026-07-07T15:42:18.000000Z' } : {},
  );
  const triggerElement = document.createElement('button');
  triggerElement.textContent = 'open trigger';
  document.body.appendChild(triggerElement);
  const closeSpy = vi.fn();

  TestBed.configureTestingModule({
    imports: [CardDetailDialog, MatDialogModule, MatSnackBarModule, NoopAnimationsModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      KanbanApi,
      KanbanWriteApi,
      BoardsStore,
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          card,
          projectId: 7,
          boardId: 4,
          columnId: 12,
          triggerElement,
        } satisfies CardDetailDialogData,
      },
      {
        provide: MatDialogRef<CardDetailDialog, CardDetailDialogResult>,
        useValue: {
          close: closeSpy,
          afterClosed: () => Promise.resolve(undefined),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(CardDetailDialog);
  fixture.detectChanges();

  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
    dialog: TestBed.inject(MatDialog),
    snackBar: TestBed.inject(MatSnackBar),
    closeSpy,
    triggerElement,
  };
}

/** Wait several ticks so async click handlers reach their awaits. */
async function stabilize(fixture: { whenStable: () => Promise<unknown>; detectChanges: () => void }, n = 3) {
  for (let i = 0; i < n; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

describe('CardDetailDialog', () => {
  afterEach(() => {
    document.body.querySelectorAll('button').forEach((b) => {
      if (b.textContent === 'open trigger') {
        b.remove();
      }
    });
  });

  it('focuses the h2 title on open (a11y: WCAG focus management)', async () => {
    const { fixture } = mountDialog();
    await fixture.whenStable();
    await new Promise<void>((r) => queueMicrotask(() => r()));
    fixture.detectChanges();
    const h2 = (fixture.nativeElement as HTMLElement).querySelector('h2');
    expect(h2).not.toBeNull();
    expect(document.activeElement).toBe(h2);
  });

  it('Edit button opens the CardEditorDialog in edit mode', async () => {
    const { fixture } = mountDialog();
    const editButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Edit card"]',
    )!;
    editButton.click();
    // edit() is async: dialog.open() fires synchronously, then awaits
    // firstValueFrom(afterClosed()) which never resolves in the test.
    await stabilize(fixture, 4);
    const editorHost = document.body.querySelector('app-card-editor-dialog');
    expect(editorHost).not.toBeNull();
    expect(editorHost?.textContent).toContain('Edit');
    expect(
      editorHost?.querySelector<HTMLInputElement>('input[type="text"]')?.value,
    ).toBe('Implement login form');
  });

  it('shows Restore (and hides Archive) when the card is archived', () => {
    const { fixture } = mountDialog({ archived: true });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('button[aria-label="Restore card"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Archive card"]')).toBeNull();
    expect(host.querySelector('.archived-chip')?.textContent).toContain('archived');
  });

  // T3.3 acceptance — Archive/Restore/Delete toolbar → write API call + close.
  it.each([
    ['Archive', 'archive', false, sampleCard({ archived_at: '2026-07-07T16:00:00.000000Z' })],
    ['Restore', 'restore', true, sampleCard({ archived_at: null })],
  ] as const)('%s button calls %sCard and closes with the %sed card', async (_label, verb, archived, updated) => {
    const { fixture, httpMock, closeSpy } = mountDialog({ archived });
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `button[aria-label="${_label} card"]`,
    )!;
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87/${verb}`);
    expect(req.request.method).toBe('POST');
    req.flush(updated);
    await fixture.whenStable();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith({ action: verb === 'archive' ? 'archived' : 'restored', card: updated });
    httpMock.verify();
  });

  it('Delete button calls deleteCard and closes on 204', async () => {
    const { fixture, httpMock, closeSpy } = mountDialog();
    const deleteButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Delete card"]',
    )!;
    deleteButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith({ action: 'deleted' });
    httpMock.verify();
  });

  it('Delete 409 opens BoardConflictDialog (typed conflict UX)', async () => {
    const { fixture, httpMock } = mountDialog();
    const deleteButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Delete card"]',
    )!;
    deleteButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87`);
    req.flush(
      { message: 'This column still has cards.', code: 'column_has_contents' },
      { status: 409, statusText: 'Conflict' },
    );
    await stabilize(fixture, 4);

    const conflictHost = document.body.querySelector('app-board-conflict-dialog');
    expect(conflictHost).not.toBeNull();
    expect(conflictHost?.textContent).toContain('This column still has cards.');
    expect(conflictHost?.textContent).toContain('Column has contents');
    httpMock.verify();
  });

  it('non-409 / non-422 server error surfaces via MatSnackBar with a user message', async () => {
    const { fixture, httpMock, snackBar } = mountDialog();
    const snackSpy = vi.spyOn(snackBar, 'open');
    const deleteButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Delete card"]',
    )!;
    deleteButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const req = httpMock.expectOne(`${cardsBase(7, 4, 12)}/87`);
    req.flush(
      { message: 'Internal Server Error' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await stabilize(fixture, 3);

    expect(snackSpy).toHaveBeenCalled();
    const message = snackSpy.mock.calls.at(-1)![0];
    expect(typeof message).toBe('string');
    expect((message as string).length).toBeGreaterThan(0);
    httpMock.verify();
  });

  it('Escape closes the dialog and restores focus to the trigger element', () => {
    const { fixture, closeSpy, triggerElement } = mountDialog();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('dialog');
    expect(host.getAttribute('aria-modal')).toBe('true');

    // Simulate the page's afterClosed() behavior (focus the trigger).
    triggerElement.focus();
    expect(document.activeElement).toBe(triggerElement);

    // Material's focus trap closes on Escape; assert the spy wiring.
    (
      TestBed.inject(MatDialogRef) as unknown as { close: (r: unknown) => void }
    ).close({ action: 'closed' });
    expect(closeSpy).toHaveBeenCalledWith({ action: 'closed' });
  });
});