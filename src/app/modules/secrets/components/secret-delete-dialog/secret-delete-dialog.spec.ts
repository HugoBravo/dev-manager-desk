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
  SecretDeleteDialog,
  type SecretDeleteDialogData,
  type SecretDeleteDialogResult,
} from './secret-delete-dialog';

const API_BASE_URL = 'http://localhost:8000/api';

interface MountResult {
  fixture: ComponentFixture<SecretDeleteDialog>;
  closeSpy: ReturnType<typeof vi.fn>;
}

function mountDialog(data: SecretDeleteDialogData): MountResult {
  TestBed.resetTestingModule();
  const closeSpy = vi.fn();
  TestBed.configureTestingModule({
    imports: [SecretDeleteDialog, MatDialogModule, MatSnackBarModule, NoopAnimationsModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      SecretsApi,
      { provide: MAT_DIALOG_DATA, useValue: data },
      {
        provide: MatDialogRef<SecretDeleteDialog, SecretDeleteDialogResult>,
        useValue: {
          close: (result: SecretDeleteDialogResult) => closeSpy(result),
          beforeClosed: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }),
          afterClosed: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SecretDeleteDialog);
  fixture.detectChanges();
  return { fixture, closeSpy };
}

describe('SecretDeleteDialog', () => {
  it('renders the secret key + warning copy', async () => {
    const { fixture } = mountDialog({ secretKey: 'API_KEY' });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#secret-delete-title')?.textContent).toContain('Delete secret');
    expect(host.querySelector('#secret-delete-message')?.textContent).toContain('API_KEY');
  });

  it('keeps the confirm button disabled until the user types the exact key', async () => {
    const { fixture, closeSpy } = mountDialog({ secretKey: 'API_KEY' });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const confirm = host.querySelector<HTMLButtonElement>('[data-testid="secret-delete-confirm"]');
    expect(confirm?.disabled).toBe(true);

    const input = host.querySelector<HTMLInputElement>(
      '[data-testid="secret-delete-confirmation-input"]',
    )!;
    const setValue = (v: string) => {
      const desc =
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ?? null;
      desc?.set?.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    setValue('wrong');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="secret-delete-confirm"]')?.disabled,
    ).toBe(true);

    setValue('API_KEY');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="secret-delete-confirm"]')?.disabled,
    ).toBe(false);

    host.querySelector<HTMLButtonElement>('[data-testid="secret-delete-confirm"]')!.click();
    await fixture.whenStable();
    expect(closeSpy).toHaveBeenCalledWith({ confirmed: true });
  });

  it('cancel emits confirmed: false', async () => {
    const { fixture, closeSpy } = mountDialog({ secretKey: 'API_KEY' });
    await fixture.whenStable();
    fixture.detectChanges();
    const cancel = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="secret-delete-cancel"]',
    )!;
    cancel.click();
    expect(closeSpy).toHaveBeenCalledWith({ confirmed: false });
  });
});
