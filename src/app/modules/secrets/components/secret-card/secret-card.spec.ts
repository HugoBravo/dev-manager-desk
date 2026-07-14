import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../../core/config/api-config';
import { SecretsApi } from '../../api/secrets.api';
import type { Secret } from '../../models/secret.model';
import { SecretCard } from './secret-card';

const API_BASE_URL = 'http://localhost:8000/api';

const sampleSecret: Secret = {
  id: 11,
  project_id: 7,
  key: 'API_KEY',
  value: 'super-secret-plaintext',
  description: 'used for outbound calls',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

function mount(): ComponentFixture<SecretCard> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SecretCard, NoopAnimationsModule, MatSnackBarModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      SecretsApi,
    ],
  });
  const fixture = TestBed.createComponent(SecretCard);
  fixture.componentRef.setInput('secret', sampleSecret);
  fixture.detectChanges();
  return fixture;
}

describe('SecretCard', () => {
  it('renders the key and description with the value masked by default', () => {
    const fixture = mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="secret-card-key"]')?.textContent).toContain('API_KEY');
    expect(host.querySelector('[data-testid="secret-card-description"]')?.textContent).toContain(
      'used for outbound calls',
    );
    const valueEl = host.querySelector('[data-testid="secret-card-value"]');
    expect(valueEl?.textContent?.trim()).toBe('••••••••');
    expect(valueEl?.textContent).not.toContain('super-secret-plaintext');
  });

  it('toggle reveals the plaintext value and switches aria-pressed + label', async () => {
    const fixture = mount();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-testid="secret-card-reveal-toggle"]',
    )!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Show value');

    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const valueEl = host.querySelector('[data-testid="secret-card-value"]');
    expect(valueEl?.textContent).toContain('super-secret-plaintext');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide value');

    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="secret-card-value"]')?.textContent?.trim()).toBe(
      '••••••••',
    );
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('emits edit event when the edit button is clicked', async () => {
    const fixture = mount();
    await fixture.whenStable();
    fixture.detectChanges();

    const editSpy = vi.fn();
    fixture.componentInstance.edit.subscribe(editSpy);

    const host = fixture.nativeElement as HTMLElement;
    const editBtn = host.querySelector<HTMLButtonElement>('[data-testid="secret-card-edit"]')!;
    editBtn.click();
    await fixture.whenStable();

    expect(editSpy).toHaveBeenCalledTimes(1);
  });

  it('emits remove event when the delete button is clicked', async () => {
    const fixture = mount();
    await fixture.whenStable();
    fixture.detectChanges();

    const removeSpy = vi.fn();
    fixture.componentInstance.remove.subscribe(removeSpy);

    const host = fixture.nativeElement as HTMLElement;
    const delBtn = host.querySelector<HTMLButtonElement>('[data-testid="secret-card-delete"]')!;
    delBtn.click();
    await fixture.whenStable();

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('copy button calls navigator.clipboard.writeText when available', async () => {
    const original = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const fixture = mount();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const copy = host.querySelector<HTMLButtonElement>('[data-testid="secret-card-copy"]')!;
    copy.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith('super-secret-plaintext');

    if (original) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: original,
      });
    }
  });
});
