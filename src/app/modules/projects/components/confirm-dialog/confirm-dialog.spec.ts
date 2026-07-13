import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import {
  ConfirmDialog,
  type ConfirmDialogData,
  type ConfirmDialogResult,
} from './confirm-dialog';

interface MountResult {
  fixture: ComponentFixture<ConfirmDialog>;
  closeSpy: ReturnType<typeof vi.fn>;
}

function mountDialog(data: Partial<ConfirmDialogData> = {}): MountResult {
  TestBed.resetTestingModule();
  const closeSpy = vi.fn();
  const finalData: ConfirmDialogData = {
    title: 'Confirm',
    message: 'Are you sure?',
    mode: 'archive',
    ...data,
  };
  TestBed.configureTestingModule({
    imports: [ConfirmDialog, MatDialogModule, NoopAnimationsModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: finalData },
      {
        provide: MatDialogRef<ConfirmDialog, ConfirmDialogResult>,
        useValue: { close: closeSpy },
      },
    ],
  });
  const fixture = TestBed.createComponent(ConfirmDialog);
  fixture.detectChanges();
  return { fixture, closeSpy };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  desc?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ConfirmDialog', () => {
  it('archive mode renders the destructive button enabled and no text field', () => {
    const { fixture } = mountDialog({ mode: 'archive' });
    const host = fixture.nativeElement as HTMLElement;
    const confirm = host.querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-confirm"]');
    expect(confirm?.disabled).toBe(false);
    expect(confirm?.textContent).toContain('Archive project');
    expect(host.querySelector('[data-testid="confirm-dialog-confirmation-input"]')).toBeNull();
  });

  it('archive mode clicking confirm closes with { confirmed: true }', () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'archive' });
    const confirm = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]',
    )!;
    confirm.click();
    expect(closeSpy).toHaveBeenCalledWith({ confirmed: true });
  });

  it('archive mode clicking cancel closes with { confirmed: false }', () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'archive' });
    const cancel = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-cancel"]',
    )!;
    cancel.click();
    expect(closeSpy).toHaveBeenCalledWith({ confirmed: false });
  });

  it('delete mode keeps the destructive button disabled with an empty confirmation', () => {
    const { fixture } = mountDialog({
      mode: 'delete',
      projectName: 'My Project',
    });
    const confirm = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]',
    );
    expect(confirm?.disabled).toBe(true);
    expect(confirm?.textContent).toContain('Delete project');
  });

  it('delete mode keeps the destructive button disabled with the wrong name', async () => {
    const { fixture } = mountDialog({
      mode: 'delete',
      projectName: 'My Project',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>(
      '[data-testid="confirm-dialog-confirmation-input"]',
    )!;
    setInputValue(input, 'my project'); // wrong (case-sensitive)
    fixture.detectChanges();
    await fixture.whenStable();

    const confirm = host.querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-confirm"]');
    expect(confirm?.disabled).toBe(true);
  });

  it('delete mode enables the destructive button when the name matches exactly', async () => {
    const { fixture, closeSpy } = mountDialog({
      mode: 'delete',
      projectName: 'My Project',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>(
      '[data-testid="confirm-dialog-confirmation-input"]',
    )!;
    setInputValue(input, 'My Project');
    fixture.detectChanges();
    await fixture.whenStable();

    const confirm = host.querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-confirm"]');
    expect(confirm?.disabled).toBe(false);

    confirm!.click();
    expect(closeSpy).toHaveBeenCalledWith({ confirmed: true });
  });
});
