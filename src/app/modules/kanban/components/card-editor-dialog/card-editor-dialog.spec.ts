import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { API_CONFIG } from '../../../../core/config/api-config';
import { KanbanApi } from '../../api/kanban.api';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';
import type { KanbanCard } from '../../models';
import { CardEditorDialog, type CardEditorDialogData } from './card-editor-dialog';

const API_BASE_URL = 'http://localhost:8000/api';
const API_PREFIX = '/v1';
const FULL_PREFIX = `${API_BASE_URL}${API_PREFIX}`;

const baseData: CardEditorDialogData = {
  mode: 'create',
  projectId: 7,
  boardId: 4,
  columnId: 12,
};

function mountDialog(data: Partial<CardEditorDialogData> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CardEditorDialog, NoopAnimationsModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: API_CONFIG,
        useValue: { apiBaseUrl: API_BASE_URL },
      },
      KanbanApi,
      KanbanWriteApi,
      BoardsStore,
      { provide: MAT_DIALOG_DATA, useValue: { ...baseData, ...data } },
      { provide: MatDialogRef, useValue: { close: () => undefined } },
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CardEditorDialog);
  fixture.detectChanges();
  return { fixture, httpMock };
}

const sampleCard: KanbanCard = {
  id: 87,
  column_id: 12,
  title: 'Existing card',
  body: 'existing body',
  due_date: null,
  archived_at: null,
  position: 'k',
  labels: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('CardEditorDialog', () => {
  it('renders empty form in create mode', () => {
    const { fixture } = mountDialog({ mode: 'create' });
    const host = fixture.nativeElement as HTMLElement;
    const titleInput = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(titleInput?.value).toBe('');
    expect(host.querySelector('h2')?.textContent).toContain('Create');
  });

  it('prefills from the card in edit mode', () => {
    const { fixture } = mountDialog({ mode: 'edit', card: sampleCard });
    const host = fixture.nativeElement as HTMLElement;
    const titleInput = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(titleInput?.value).toBe('Existing card');
    expect(host.querySelector('h2')?.textContent).toContain('Edit');
  });

  it('renders server 422 fieldErrors in form fields', async () => {
    const { fixture, httpMock } = mountDialog({ mode: 'create' });
    const host = fixture.nativeElement as HTMLElement;

    // Fill in title AND body so the form is otherwise valid; the server
    // will reject with a 422 for a different reason (e.g. a title that
    // exists already).
    const titleInput = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    titleInput.value = 'Bad card';
    titleInput.dispatchEvent(new Event('input'));
    const bodyArea = host.querySelector<HTMLTextAreaElement>('textarea')!;
    bodyArea.value = 'body text';
    bodyArea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    // Click the submit button.
    const submitButton = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submitButton.click();

    // Catch the request and reply with a 422.
    const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards`);
    expect(req.request.method).toBe('POST');
    req.flush(
      {
        message: 'The given data was invalid.',
        errors: {
          title: ['The title field is required.'],
          body: ['The body field is required.'],
        },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    fixture.detectChanges();
    await fixture.whenStable();
    // Allow the signal-based validation to settle.
    await fixture.whenStable();

    // Server error messages must render in their fields.
    const errors = host.querySelectorAll('mat-error');
    const errorTexts = Array.from(errors).map((e) => e.textContent ?? '');
    expect(errorTexts.some((t) => t.includes('required'))).toBe(true);

    httpMock.verify();
  });

  it('submit is disabled while submitting', async () => {
    const { fixture, httpMock } = mountDialog({ mode: 'create' });
    const host = fixture.nativeElement as HTMLElement;

    const titleInput = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    titleInput.value = 'New card';
    titleInput.dispatchEvent(new Event('input'));

    const bodyArea = host.querySelector<HTMLTextAreaElement>('textarea')!;
    bodyArea.value = 'New body';
    bodyArea.dispatchEvent(new Event('input'));

    fixture.detectChanges();
    await fixture.whenStable();

    const submitButton = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitButton.disabled).toBe(false);

    submitButton.click();

    // Form should now be in the submitting state; button must be disabled.
    fixture.detectChanges();
    expect(submitButton.disabled).toBe(true);

    // Drain the request.
    const req = httpMock.expectOne(`${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards`);
    req.flush({ ...sampleCard, id: 999, title: 'New card' });
    httpMock.verify();
  });
});
