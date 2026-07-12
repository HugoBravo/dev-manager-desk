import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { API_CONFIG } from '../../../../core/config/api-config';
import {
  ProjectEditorDialog,
  type ProjectEditorDialogData,
  type ProjectEditorDialogResult,
} from './project-editor-dialog';

const API_BASE_URL = 'http://localhost:8000/api';

interface MountResult {
  fixture: ComponentFixture<ProjectEditorDialog>;
  closeSpy: ReturnType<typeof vi.fn>;
  triggerElement: HTMLElement;
}

function mountDialog(data: Partial<ProjectEditorDialogData> = {}): MountResult {
  TestBed.resetTestingModule();
  const closeSpy = vi.fn();
  // Mirrors board-editor-dialog.spec: the dialog subscribes to
  // `afterClosed` for focus return. Resolve the subscriber synchronously
  // when the test drives `close()` so the focus-return callback runs in
  // the same microtask.
  let resolveAfterClosed: (() => void) | null = null;
  const afterClosedPromise = new Promise<void>((resolve) => {
    resolveAfterClosed = resolve;
  });
  const afterClosedObservable = {
    subscribe: vi.fn().mockImplementation((observer: () => void) => {
      afterClosedPromise.then(() => observer());
      return { unsubscribe: vi.fn() };
    }),
  };

  const triggerElement = document.createElement('button');
  triggerElement.textContent = 'open trigger';
  document.body.appendChild(triggerElement);

  const finalData: ProjectEditorDialogData = {
    mode: 'create',
    triggerElement,
    ...data,
  };

  TestBed.configureTestingModule({
    imports: [ProjectEditorDialog, MatDialogModule, NoopAnimationsModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      { provide: MAT_DIALOG_DATA, useValue: finalData },
      {
        provide: MatDialogRef<ProjectEditorDialog, ProjectEditorDialogResult>,
        useValue: {
          close: (result: ProjectEditorDialogResult) => {
            closeSpy(result);
            resolveAfterClosed?.();
          },
          beforeClosed: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }),
          afterClosed: () => afterClosedObservable,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ProjectEditorDialog);
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

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (input instanceof HTMLInputElement) {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    desc?.set?.call(input, value);
  } else {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    desc?.set?.call(input, value);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ProjectEditorDialog', () => {
  afterEach(() => cleanupTriggers());

  it('opens in create mode with empty name + description and submit disabled', async () => {
    const { fixture, closeSpy } = mountDialog();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#project-editor-title')?.textContent).toContain('New project');

    const nameInput = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(nameInput?.value).toBe('');

    const descTextarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(descTextarea?.value).toBe('');

    const submit = host.querySelector<HTMLButtonElement>('[data-testid="dialog-save"]');
    expect(submit?.disabled).toBe(true);

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('rejects empty / whitespace-only / >100 char names', async () => {
    // Empty — disabled by default in create mode.
    {
      const { fixture } = mountDialog();
      await fixture.whenStable();
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const submit = host.querySelector<HTMLButtonElement>('[data-testid="dialog-save"]');
      expect(submit?.disabled).toBe(true);
    }

    // Whitespace-only after the user types into the field.
    {
      const { fixture, closeSpy } = mountDialog();
      await fixture.whenStable();
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
      setInputValue(input, '     ');
      fixture.detectChanges();
      await fixture.whenStable();

      const form = host.querySelector<HTMLFormElement>('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(closeSpy).not.toHaveBeenCalled();

      const submit = host.querySelector<HTMLButtonElement>('[data-testid="dialog-save"]');
      expect(submit?.disabled).toBe(true);
    }

    // 101 chars — >100 must disable the submit.
    {
      const { fixture, closeSpy } = mountDialog();
      await fixture.whenStable();
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
      setInputValue(input, 'x'.repeat(101));
      fixture.detectChanges();
      await fixture.whenStable();
      const submit = host.querySelector<HTMLButtonElement>('[data-testid="dialog-save"]');
      expect(submit?.disabled).toBe(true);

      const form = host.querySelector<HTMLFormElement>('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(closeSpy).not.toHaveBeenCalled();
    }
  });

  it('rejects >255 char descriptions', async () => {
    const { fixture, closeSpy } = mountDialog();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const nameInput = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    setInputValue(nameInput, 'Valid name');
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;
    // Use the JS property descriptor so the HTML `maxlength` does NOT
    // clip the value — Signal Forms should still see the 256 chars.
    setInputValue(textarea, 'y'.repeat(256));
    fixture.detectChanges();
    await fixture.whenStable();

    const submit = host.querySelector<HTMLButtonElement>('[data-testid="dialog-save"]');
    expect(submit?.disabled).toBe(true);

    const form = host.querySelector<HTMLFormElement>('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('submit emits { action: "saved", name (trimmed), description (trimmed or null) }', async () => {
    const { fixture, closeSpy } = mountDialog();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const nameInput = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    setInputValue(nameInput, '  My Project  ');
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;
    setInputValue(textarea, '  Some notes  ');
    fixture.detectChanges();
    await fixture.whenStable();

    const form = host.querySelector<HTMLFormElement>('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith({
      action: 'saved',
      project: { name: 'My Project', description: 'Some notes' },
    });
  });

  it('whitespace-only description normalizes to null on submit', async () => {
    const { fixture, closeSpy } = mountDialog();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const nameInput = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    setInputValue(nameInput, 'Real Project');
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;
    setInputValue(textarea, '     ');
    fixture.detectChanges();
    await fixture.whenStable();

    const form = host.querySelector<HTMLFormElement>('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(closeSpy).toHaveBeenCalledWith({
      action: 'saved',
      project: { name: 'Real Project', description: null },
    });
  });

  it('cancel emits { action: "cancel" }', async () => {
    const { fixture, closeSpy } = mountDialog();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const cancel = host.querySelector<HTMLButtonElement>('[data-testid="dialog-cancel"]')!;
    cancel.click();

    expect(closeSpy).toHaveBeenCalledWith({ action: 'cancel' });
  });

  it('restores focus to triggerElement when the dialog closes', async () => {
    const { fixture, triggerElement, closeSpy } = mountDialog();
    await fixture.whenStable();
    fixture.detectChanges();

    // The dialog moves focus to its own internal input on init. The
    // trigger element is NOT focused at this point.
    expect(document.activeElement).not.toBe(triggerElement);

    const cancel = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="dialog-cancel"]',
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