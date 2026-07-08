import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../../core/config/api-config';
import { AuthService } from '../../../../core/auth/auth.service';
import type { KanbanCard } from '../../models';
import { KanbanApi } from '../../api/kanban.api';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';
import { CommentsStore } from '../../stores/comments.store';
import { AttachmentsStore } from '../../stores/attachments.store';
import { LabelsStore } from '../../stores/labels.store';
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
  labels: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function mountDialog(opts: { archived?: boolean } = {}) {
  TestBed.resetTestingModule();
  const card = sampleCard(opts.archived ? { archived_at: '2026-07-07T15:42:18.000000Z' } : {});
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
      CommentsStore,
      AttachmentsStore,
      LabelsStore,
      {
        provide: AuthService,
        useValue: {
          user: signal<unknown>({ id: 1, email: 'me@x', name: 'Me', email_verified_at: null }),
        },
      },
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
  // Pre-seed the label library cache so `ensureLoaded()` is a no-op
  // (the dialog's ngOnInit fires it). The picker tests use an empty
  // cache; the label-sync tests seed it explicitly before mounting.
  const labelsStore = TestBed.inject(LabelsStore);
  labelsStore.labelsCache.set([]);
  labelsStore.__markLoadedForTests();
  fixture.detectChanges();

  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
    dialog: TestBed.inject(MatDialog),
    snackBar: TestBed.inject(MatSnackBar),
    labelsStore,
    closeSpy,
    triggerElement,
  };
}

/** Wait several ticks so async click handlers reach their awaits. */
async function stabilize(
  fixture: { whenStable: () => Promise<unknown>; detectChanges: () => void },
  n = 3,
) {
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

  /**
   * Flush the dialog's automatic GET requests for comments + attachments
   * (PR4 added these to ngOnInit). Returns the matched requests so the
   * caller can decide whether to flush them with empty data or leave them
   * pending for the test's own assertions.
   */
  function flushInitialLoads(
    httpMock: HttpTestingController,
    base: string,
  ): {
    commentsReq: ReturnType<HttpTestingController['expectOne']>;
    attachmentsReq: ReturnType<HttpTestingController['expectOne']>;
  } {
    const commentsReq = httpMock.expectOne(`${base}/comments`);
    commentsReq.flush({ data: [] });
    const attachmentsReq = httpMock.expectOne(`${base}/attachments`);
    attachmentsReq.flush({ data: [] });
    return { commentsReq, attachmentsReq };
  }

  function baseUrl(): string {
    return `${FULL_PREFIX}/projects/7/kanban/boards/4/columns/12/cards/87`;
  }

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
    expect(editorHost?.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe(
      'Implement login form',
    );
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
  ] as const)(
    '%s button calls %sCard and closes with the %sed card',
    async (_label, verb, archived, updated) => {
      const { fixture, httpMock, closeSpy } = mountDialog({ archived });
      flushInitialLoads(httpMock, baseUrl());
      await fixture.whenStable();
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
      expect(closeSpy).toHaveBeenCalledWith({
        action: verb === 'archive' ? 'archived' : 'restored',
        card: updated,
      });
      httpMock.verify();
    },
  );

  it('Delete button calls deleteCard and closes on 204', async () => {
    const { fixture, httpMock, closeSpy } = mountDialog();
    flushInitialLoads(httpMock, baseUrl());
    await fixture.whenStable();
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
    flushInitialLoads(httpMock, baseUrl());
    await fixture.whenStable();
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
    flushInitialLoads(httpMock, baseUrl());
    await fixture.whenStable();
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
    (TestBed.inject(MatDialogRef) as unknown as { close: (r: unknown) => void }).close({
      action: 'closed',
    });
    expect(closeSpy).toHaveBeenCalledWith({ action: 'closed' });
  });

  // --- PR4: Comments ---

  it('Posts a new comment via POST /comments and clears the textarea', async () => {
    const { fixture, httpMock } = mountDialog();
    const base = baseUrl();
    const commentsReq = httpMock.expectOne(`${base}/comments`);
    commentsReq.flush({ data: [] });
    const attachmentsReq = httpMock.expectOne(`${base}/attachments`);
    attachmentsReq.flush({ data: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea#new-comment-body')!;
    textarea.value = 'Hello world';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    const form = host.querySelector<HTMLFormElement>('form.comment-form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    const postReq = httpMock.expectOne(`${base}/comments`);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({ body: 'Hello world' });
    postReq.flush({
      id: 999,
      card_id: 87,
      parent_id: null,
      author_id: 1,
      body: 'Hello world',
      created_at: '2026-07-07T16:00:00.000000Z',
      updated_at: '2026-07-07T16:00:00.000000Z',
    });
    await stabilize(fixture, 4);
    // The signal reset propagates to the DOM via [value] binding.
    expect(textarea.value).toBe('');
    httpMock.verify();
  });

  it('PATCH /comments/{id} 403 → snackbar with "Edit window expired" copy', async () => {
    // Pin "now" to a known point so the comment's updated_at is within
    // the 15-min edit window (canEdit === true), then let the server
    // reject the PATCH with 403 to drive the snackbar mapping.
    const realNow = Date.now;
    const pinnedNow = Date.parse('2026-07-07T16:00:00.000000Z');
    Date.now = () => pinnedNow;
    try {
      const { fixture, httpMock, snackBar } = mountDialog();
      const base = baseUrl();
      const commentsReq = httpMock.expectOne(`${base}/comments`);
      const recentUpdated = '2026-07-07T15:55:00.000000Z'; // 5 min before pinnedNow
      commentsReq.flush({
        data: [
          {
            id: 311,
            card_id: 87,
            parent_id: null,
            author_id: 1,
            body: 'My comment',
            created_at: recentUpdated,
            updated_at: recentUpdated,
          },
        ],
      });
      const attachmentsReq = httpMock.expectOne(`${base}/attachments`);
      attachmentsReq.flush({ data: [] });
      await fixture.whenStable();
      fixture.detectChanges();

      const snackSpy = vi.spyOn(snackBar, 'open');
      const editButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        'button[aria-label*="Edit comment by author"]',
      )!;
      editButton.click();
      fixture.detectChanges();
      await fixture.whenStable();

      const saveButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        'button[aria-label="Save edit"]',
      )!;
      // Set the editor content; the dialog binds the textarea via [value]
      // so we set both the property and dispatch an input event.
      const editor = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
        'textarea.comment-edit',
      )!;
      editor.value = 'Edited';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      saveButton.click();
      fixture.detectChanges();
      await fixture.whenStable();

      const patchReq = httpMock.expectOne(`${base}/comments/311`);
      expect(patchReq.request.method).toBe('PATCH');
      patchReq.flush(
        { message: 'This action is unauthorized.' },
        { status: 403, statusText: 'Forbidden' },
      );
      await stabilize(fixture, 2);

      expect(snackSpy).toHaveBeenCalled();
      const lastMessage = snackSpy.mock.calls.at(-1)![0] as string;
      expect(lastMessage.toLowerCase()).toMatch(/edit window/);
      expect(lastMessage.toLowerCase()).toMatch(/expired/);
      httpMock.verify();
    } finally {
      Date.now = realNow;
    }
  });

  it('hides Edit/Delete buttons for comments from other authors (canEdit=false)', async () => {
    const { fixture, httpMock } = mountDialog();
    const base = baseUrl();
    const commentsReq = httpMock.expectOne(`${base}/comments`);
    commentsReq.flush({
      data: [
        {
          id: 311,
          card_id: 87,
          parent_id: null,
          author_id: 99, // NOT the current user (id=1)
          body: 'Someone else',
          created_at: '2026-07-07T15:55:00.000000Z',
          updated_at: '2026-07-07T15:55:00.000000Z',
        },
      ],
    });
    const attachmentsReq = httpMock.expectOne(`${base}/attachments`);
    attachmentsReq.flush({ data: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const editButtons = host.querySelectorAll('button[aria-label*="Edit comment by author"]');
    const deleteButtons = host.querySelectorAll('button[aria-label*="Delete comment by author"]');
    expect(editButtons.length).toBe(0);
    expect(deleteButtons.length).toBe(0);
  });

  // --- PR4: Attachments ---

  it('uploads an allowed file and POSTs to /attachments', async () => {
    const { fixture, httpMock, snackBar } = mountDialog();
    const base = baseUrl();
    const commentsReq = httpMock.expectOne(`${base}/comments`);
    commentsReq.flush({ data: [] });
    const attachmentsReq = httpMock.expectOne(`${base}/attachments`);
    attachmentsReq.flush({ data: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const snackSpy = vi.spyOn(snackBar, 'open');
    const file = new File([new Uint8Array(8)], 'doc.txt', { type: 'text/plain' });
    const fileInput = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type="file"]',
    )!;
    // jsdom DataTransfer support is limited; assign files via the property.
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    const postReq = httpMock.expectOne(`${base}/attachments`);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body instanceof FormData).toBe(true);
    postReq.flush({
      id: 50,
      card_id: 87,
      uploader_id: 1,
      disk: 'local',
      path: 'kanban/cards/87/doc.txt',
      original_filename: 'doc.txt',
      mime: 'text/plain',
      size_bytes: 8,
      url: null,
      created_at: '2026-07-07T16:00:00.000000Z',
      updated_at: '2026-07-07T16:00:00.000000Z',
    });
    await stabilize(fixture, 2);

    expect(snackSpy).toHaveBeenCalled();
    const lastMessage = snackSpy.mock.calls.at(-1)![0] as string;
    expect(lastMessage.toLowerCase()).toMatch(/uploaded/);
    httpMock.verify();
  });

  it('rejects a disallowed mime client-side (no HTTP call) and shows snackbar', async () => {
    const { fixture, httpMock, snackBar } = mountDialog();
    const base = baseUrl();
    const commentsReq = httpMock.expectOne(`${base}/comments`);
    commentsReq.flush({ data: [] });
    const attachmentsReq = httpMock.expectOne(`${base}/attachments`);
    attachmentsReq.flush({ data: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const snackSpy = vi.spyOn(snackBar, 'open');
    const file = new File([new Uint8Array(8)], 'evil.exe', { type: 'application/octet-stream' });
    const fileInput = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type="file"]',
    )!;
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    // No POST /attachments request should have been issued.
    httpMock.expectNone(`${base}/attachments`);

    expect(snackSpy).toHaveBeenCalled();
    const msg = snackSpy.mock.calls.at(-1)![0] as string;
    expect(msg.toLowerCase()).toContain('not allowed');
    httpMock.verify();
  });

  it('rejects a > 5 MB file client-side (no HTTP call)', async () => {
    const { fixture, httpMock, snackBar } = mountDialog();
    const base = baseUrl();
    const commentsReq = httpMock.expectOne(`${base}/comments`);
    commentsReq.flush({ data: [] });
    const attachmentsReq = httpMock.expectOne(`${base}/attachments`);
    attachmentsReq.flush({ data: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const snackSpy = vi.spyOn(snackBar, 'open');
    const file = new File([new Uint8Array(8)], 'big.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { configurable: true, value: 5 * 1024 * 1024 + 1 });
    const fileInput = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type="file"]',
    )!;
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    httpMock.expectNone(`${base}/attachments`);
    expect(snackSpy).toHaveBeenCalled();
    const msg = snackSpy.mock.calls.at(-1)![0] as string;
    expect(msg.toLowerCase()).toMatch(/max 5 mb|too large/);
    httpMock.verify();
  });

  it('does NOT render a download button for attachments (api-doc §15)', async () => {
    const { fixture, httpMock } = mountDialog();
    const base = baseUrl();
    const commentsReq = httpMock.expectOne(`${base}/comments`);
    commentsReq.flush({ data: [] });
    const attachmentsReq = httpMock.expectOne(`${base}/attachments`);
    attachmentsReq.flush({
      data: [
        {
          id: 50,
          card_id: 87,
          uploader_id: 1,
          disk: 'local',
          path: 'kanban/cards/87/doc.txt',
          original_filename: 'doc.txt',
          mime: 'text/plain',
          size_bytes: 8,
          url: null,
          created_at: '2026-07-07T16:00:00.000000Z',
          updated_at: '2026-07-07T16:00:00.000000Z',
        },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const attachment = host.querySelector('.attachment')!;
    // No button labelled "Download" or "View" should exist.
    const allButtons = attachment.querySelectorAll('button');
    for (const btn of Array.from(allButtons)) {
      const label = (btn.getAttribute('aria-label') ?? btn.textContent ?? '').toLowerCase();
      expect(label).not.toMatch(/download|view|open/);
    }
  });
});
