import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../../core/config/api-config';
import { SecretsApi } from '../../api/secrets.api';
import {
  SecretEditorDialog,
  type SecretEditorDialogData,
  type SecretEditorDialogResult,
} from './secret-editor-dialog';
import type { Secret } from '../../models/secret.model';

const API_BASE_URL = 'http://localhost:8000/api';

const sampleSecret: Secret = {
  id: 11,
  project_id: 7,
  key: 'EXISTING_KEY',
  value: 'plaintext',
  description: 'notes',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

interface MountResult {
  fixture: ComponentFixture<SecretEditorDialog>;
  closeSpy: ReturnType<typeof vi.fn>;
  triggerElement: HTMLElement;
}

function mountDialog(data: SecretEditorDialogData): MountResult {
  TestBed.resetTestingModule();
  const closeSpy = vi.fn();
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

  const finalData: SecretEditorDialogData = { triggerElement, ...data };

  TestBed.configureTestingModule({
    imports: [SecretEditorDialog, MatDialogModule, MatSnackBarModule, NoopAnimationsModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      SecretsApi,
      { provide: MAT_DIALOG_DATA, useValue: finalData },
      {
        provide: MatDialogRef<SecretEditorDialog, SecretEditorDialogResult>,
        useValue: {
          close: (result: SecretEditorDialogResult) => {
            closeSpy(result);
            resolveAfterClosed?.();
          },
          beforeClosed: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }),
          afterClosed: () => afterClosedObservable,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SecretEditorDialog);
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

describe('SecretEditorDialog', () => {
  afterEach(() => cleanupTriggers());

  it('opens in create mode with empty key, value, description and submit disabled', async () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create', projectId: 7 });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#secret-editor-title')?.textContent).toContain('New secret');

    const keyInput = host.querySelector<HTMLInputElement>(
      '[data-testid="secret-editor-key-input"]',
    );
    expect(keyInput?.value).toBe('');
    const valueInput = host.querySelector<HTMLInputElement>(
      '[data-testid="secret-editor-value-input"]',
    );
    expect(valueInput?.value).toBe('');

    const submit = host.querySelector<HTMLButtonElement>('[data-testid="secret-editor-save"]');
    expect(submit?.disabled).toBe(true);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('opens in edit mode prefilled with key + value + description; key is read-only', async () => {
    const { fixture, closeSpy } = mountDialog({
      mode: 'edit',
      projectId: 7,
      secret: sampleSecret,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#secret-editor-title')?.textContent).toContain('Edit secret');

    const keyReadonly = host.querySelector<HTMLElement>(
      '[data-testid="secret-editor-key-readonly"]',
    );
    expect(keyReadonly?.textContent).toContain('EXISTING_KEY');
    expect(host.querySelector('[data-testid="secret-editor-key-input"]')).toBeNull();

    const valueInput = host.querySelector<HTMLInputElement>(
      '[data-testid="secret-editor-value-input"]',
    );
    expect(valueInput?.value).toBe('plaintext');
  });

  it('enforces the key regex by leaving submit disabled on invalid characters', async () => {
    const { fixture } = mountDialog({ mode: 'create', projectId: 7 });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const keyInput = host.querySelector<HTMLInputElement>(
      '[data-testid="secret-editor-key-input"]',
    )!;
    const valueInput = host.querySelector<HTMLInputElement>(
      '[data-testid="secret-editor-value-input"]',
    )!;

    keyInput.value = 'bad spaces';
    keyInput.dispatchEvent(new Event('input', { bubbles: true }));
    valueInput.value = 'v';
    valueInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    const submit = host.querySelector<HTMLButtonElement>('[data-testid="secret-editor-save"]');
    expect(submit?.disabled).toBe(true);
  });

  it('save in create mode emits trimmed payload with description normalized to null', async () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create', projectId: 7 });
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.componentInstance;
    page.setFormValue({
      key: '  API_KEY  ',
      value: 'plaintext',
      description: '   ',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    // Sanity: the form value signal must reflect the seed.
    expect(page.formForTest.value()).toEqual({
      key: '  API_KEY  ',
      value: 'plaintext',
      description: '   ',
    });

    await page.submitForTestForce();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith({
      action: 'saved',
      secretId: undefined,
      payload: {
        key: 'API_KEY',
        value: 'plaintext',
        description: null,
      },
    });
  });

  it('save in edit mode emits secretId + payload with description when set', async () => {
    const { fixture, closeSpy } = mountDialog({
      mode: 'edit',
      projectId: 7,
      secret: sampleSecret,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.componentInstance;
    page.setFormValue({
      key: 'EXISTING_KEY',
      value: 'new-value',
      description: 'updated notes',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    await page.submitForTestForce();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(closeSpy).toHaveBeenCalledWith({
      action: 'saved',
      secretId: 11,
      payload: {
        key: 'EXISTING_KEY',
        value: 'new-value',
        description: 'updated notes',
      },
    });
  });

  it('toggle visibility switches the value input type between password and text', async () => {
    const { fixture } = mountDialog({ mode: 'edit', projectId: 7, secret: sampleSecret });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const valueInput = host.querySelector<HTMLInputElement>(
      '[data-testid="secret-editor-value-input"]',
    )!;
    expect(valueInput.type).toBe('password');

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-testid="secret-editor-value-toggle"]',
    )!;
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(valueInput.type).toBe('text');

    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(valueInput.type).toBe('password');
  });

  it('cancel emits { action: "cancel" }', async () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create', projectId: 7 });
    await fixture.whenStable();
    fixture.detectChanges();
    const cancel = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="secret-editor-cancel"]',
    )!;
    cancel.click();
    expect(closeSpy).toHaveBeenCalledWith({ action: 'cancel' });
  });

  it('restores focus to the trigger element when the dialog closes', async () => {
    const { fixture, closeSpy, triggerElement } = mountDialog({
      mode: 'create',
      projectId: 7,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.activeElement).not.toBe(triggerElement);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="secret-editor-cancel"]')!
      .click();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(closeSpy).toHaveBeenCalledWith({ action: 'cancel' });
    fixture.destroy();
    await fixture.whenStable();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(document.activeElement).toBe(triggerElement);
  });

  it('accepts special characters in the value field without rejecting the secret', async () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create', projectId: 7 });
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.componentInstance;
    page.setFormValue({
      key: 'STRIPE_KEY',
      value: 'B4hGC#q8(J3v & N%(y&[V2W.u[',
      description: '',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.formForTest.valid()).toBe(true);
    const submit = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="secret-editor-save"]',
    );
    expect(submit?.disabled).toBe(false);

    await page.submitForTestForce();
    await fixture.whenStable();

    expect(closeSpy).toHaveBeenCalledWith({
      action: 'saved',
      secretId: undefined,
      payload: {
        key: 'STRIPE_KEY',
        value: 'B4hGC#q8(J3v & N%(y&[V2W.u[',
        description: null,
      },
    });
  });

  it('focuses the value input before the key input when opening in create mode', async () => {
    const { fixture } = mountDialog({ mode: 'create', projectId: 7 });
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const valueInput = host.querySelector<HTMLInputElement>(
      '[data-testid="secret-editor-value-input"]',
    );
    expect(valueInput).not.toBeNull();
    expect(document.activeElement).toBe(valueInput);
  });
});
