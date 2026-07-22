import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../../core/config/api-config';
import { KanbanApi } from '../../api/kanban.api';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';
import { LabelsStore } from '../../stores/labels.store';
import {
  BoardEditorDialog,
  type BoardEditorDialogData,
  type BoardEditorDialogResult,
} from './board-editor-dialog';

const API_BASE_URL = 'http://localhost:8000/api';

interface MountResult {
  fixture: ComponentFixture<BoardEditorDialog>;
  closeSpy: ReturnType<typeof vi.fn>;
  triggerElement: HTMLElement;
}

function mountDialog(data: BoardEditorDialogData): MountResult {
  TestBed.resetTestingModule();
  const closeSpy = vi.fn();
  // The dialog subscribes to `afterClosed` for focus return. Mock it
  // as an async promise that resolves whenever the test calls
  // `closeSpy` — that way the focus-return callback runs in the
  // same microtask the test drives `cancel.click()`.
  let resolveAfterClosed: (() => void) | null = null;
  const afterClosedPromise = new Promise<void>((resolve) => {
    resolveAfterClosed = resolve;
  });
  const afterClosedObservable = {
    subscribe: vi.fn().mockImplementation((observer: () => void) => {
      // Fire the observer as soon as `close()` is invoked so the
      // focus return is observable from the test's perspective.
      afterClosedPromise.then(() => observer());
      return { unsubscribe: vi.fn() };
    }),
  };
  const triggerElement = document.createElement('button');
  triggerElement.textContent = 'open trigger';
  document.body.appendChild(triggerElement);

  const finalData: BoardEditorDialogData = { triggerElement, ...data };

  TestBed.configureTestingModule({
    imports: [BoardEditorDialog, MatDialogModule, MatSnackBarModule, NoopAnimationsModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      KanbanApi,
      KanbanWriteApi,
      BoardsStore,
      LabelsStore,
      { provide: MAT_DIALOG_DATA, useValue: finalData },
      {
        provide: MatDialogRef<BoardEditorDialog, BoardEditorDialogResult>,
        useValue: {
          close: (result: BoardEditorDialogResult) => {
            closeSpy(result);
            resolveAfterClosed?.();
          },
          beforeClosed: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }),
          afterClosed: () => afterClosedObservable,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BoardEditorDialog);
  fixture.detectChanges();
  return { fixture, closeSpy, triggerElement };
}

function cleanupTriggers(): void {
  document.body.querySelectorAll('button').forEach((b) => {
    if (b.textContent === 'open trigger') {
      b.remove();
    }
  });
}

describe('BoardEditorDialog', () => {
  afterEach(() => cleanupTriggers());

  it('opens in create mode with empty name and submit disabled', async () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create', projectId: 1, taskId: 9 });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#board-editor-title')?.textContent).toContain('New board');

    const input = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input?.value).toBe('');

    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(true);

    // Submit must not have fired.
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('opens in rename mode prefilled with initialName', async () => {
    const { fixture, closeSpy } = mountDialog({
      mode: 'rename',
      boardId: 7,
      taskId: 9,
      initialName: 'Sprint 1',
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#board-editor-title')?.textContent).toContain('Rename board');

    const input = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input?.value).toBe('Sprint 1');

    // Submit is enabled because the form passes validation.
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(false);

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('submit emits { action: "saved", name } with trimmed name', async () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create', projectId: 1, taskId: 9 });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = '  Sprint 2  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    const form = host.querySelector<HTMLFormElement>('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith({ action: 'saved', name: 'Sprint 2' });
  });

  it('cancel emits { action: "cancel" }', async () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create', projectId: 1, taskId: 9 });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const cancel = host.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!;
    cancel.click();

    expect(closeSpy).toHaveBeenCalledWith({ action: 'cancel' });
  });

  it('rejects empty / whitespace-only / >100 char names', async () => {
    // Empty — disabled by default in create mode (covered above). Confirm
    // explicitly for the test name contract.
    {
      const { fixture } = mountDialog({ mode: 'create', projectId: 1, taskId: 9 });
      await fixture.whenStable();
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]');
      expect(submit?.disabled).toBe(true);
    }

    // Whitespace-only after the user types into the field.
    {
      const { fixture, closeSpy } = mountDialog({ mode: 'create', projectId: 1, taskId: 9 });
      await fixture.whenStable();
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
      input.value = '     ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();

      const form = host.querySelector<HTMLFormElement>('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(closeSpy).not.toHaveBeenCalled();

      const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]');
      expect(submit?.disabled).toBe(true);
    }

    // 101 chars — >100 must disable the submit. Uses the JS
    // property descriptor setter so the browser's HTML `maxlength`
    // attribute on the Material input does NOT clip the value; we
    // want Signal Forms to receive the full 101 chars and mark the
    // form invalid.
    {
      const { fixture, closeSpy } = mountDialog({ mode: 'create', projectId: 1, taskId: 9 });
      await fixture.whenStable();
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
      const long = 'x'.repeat(101);
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      desc?.set?.call(input, long);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
      const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]');
      expect(submit?.disabled).toBe(true);

      // Force-submit a 101 char value — must not close the dialog.
      const form = host.querySelector<HTMLFormElement>('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(closeSpy).not.toHaveBeenCalled();
    }
  });

  it('restores focus to triggerElement when the dialog closes', async () => {
    const { fixture, triggerElement, closeSpy } = mountDialog({
      mode: 'create',
      projectId: 1,
      taskId: 9,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // The dialog moves focus to its own internal input on init. The
    // trigger element is NOT focused at this point. Verify the
    // pre-condition for the assertion below.
    expect(document.activeElement).not.toBe(triggerElement);

    // Cancel the dialog — the dialog wires its focus return via
    // `MatDialogRef.afterClosed`, which fires after Angular tears
    // down the dialog. The dialog itself owns focus return so
    // callers don't have to wire it from their own `afterClosed()`.
    const cancel = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Cancel"]',
    )!;
    cancel.click();

    // Pump microtasks so the afterClosed observer resolves.
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(closeSpy).toHaveBeenCalledWith({ action: 'cancel' });
    // Tear the dialog down so Material cannot re-focus its input.
    fixture.destroy();
    await fixture.whenStable();
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(document.activeElement).toBe(triggerElement);
  });
});
