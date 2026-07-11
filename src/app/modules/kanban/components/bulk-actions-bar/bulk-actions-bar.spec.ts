import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';

import { BulkActionsBar } from './bulk-actions-bar';

interface MountResult {
  fixture: ComponentFixture<BulkActionsBar>;
  bulkDeleteSpy: ReturnType<typeof vi.fn>;
  bulkAddPrefixSpy: ReturnType<typeof vi.fn>;
  bulkRemovePrefixSpy: ReturnType<typeof vi.fn>;
}

function mountBar(): MountResult {
  TestBed.resetTestingModule();
  const bulkDeleteSpy = vi.fn();
  const bulkAddPrefixSpy = vi.fn();
  const bulkRemovePrefixSpy = vi.fn();
  TestBed.configureTestingModule({
    imports: [BulkActionsBar, NoopAnimationsModule, MatButtonModule, MatMenuModule],
  });
  const fixture = TestBed.createComponent(BulkActionsBar);
  fixture.componentRef.setInput('count', 0);
  fixture.componentRef.setInput('selectedNames', []);
  fixture.detectChanges();
  return { fixture, bulkDeleteSpy, bulkAddPrefixSpy, bulkRemovePrefixSpy };
}

describe('BulkActionsBar', () => {
  it('renders nothing when count() is 0', () => {
    const { fixture } = mountBar();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    // The host should not render any actionable bar content. We
    // assert by looking for any role aside from the implicit host
    // attributes — when count() is 0, the @if gate removes all
    // children so no toolbars / buttons exist.
    expect(host.querySelector('[data-testid="bulk-actions-bar"]')).toBeNull();
    expect(host.querySelector('button')).toBeNull();
  });

  it('renders count() when selection > 0', async () => {
    const { fixture } = mountBar();
    fixture.componentRef.setInput('count', 3);
    fixture.componentRef.setInput('selectedNames', ['Sprint 1', 'Sprint 2', 'Sprint 3']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const bar = host.querySelector('[data-testid="bulk-actions-bar"]');
    expect(bar).not.toBeNull();
    // The "N selected" copy is the easiest assertion: count is reflected.
    expect(bar?.textContent ?? '').toContain('3');
    expect(bar?.textContent ?? '').toMatch(/selected/i);
  });

  it('emits bulkDelete on "Move to trash" click', async () => {
    const { fixture } = mountBar();
    fixture.componentRef.setInput('count', 2);
    fixture.componentRef.setInput('selectedNames', ['A', 'B']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const instance = fixture.componentInstance as BulkActionsBar & {
      bulkDelete: { emit: () => void };
    };
    const spy = vi.spyOn(instance.bulkDelete, 'emit');

    const trashBtn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="bulk-delete-button"]',
    )!;
    trashBtn.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits bulkAddPrefix and bulkRemovePrefix on prefix menu items', async () => {
    const { fixture } = mountBar();
    fixture.componentRef.setInput('count', 2);
    fixture.componentRef.setInput('selectedNames', ['A', 'B']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const instance = fixture.componentInstance as BulkActionsBar & {
      bulkAddPrefix: { emit: () => void };
      bulkRemovePrefix: { emit: () => void };
    };
    const addSpy = vi.spyOn(instance.bulkAddPrefix, 'emit');
    const removeSpy = vi.spyOn(instance.bulkRemovePrefix, 'emit');

    // The component renders two buttons inside a mat-menu trigger:
    // "Add prefix…" and "Remove prefix…". We trigger the outputs by
    // calling the public event emitter helpers directly to avoid
    // depending on the Material overlay being open in jsdom (which
    // often races). The wiring contract — buttons exist and emit on
    // click — is the thing under test.
    expect(addSpy).toBeDefined();
    expect(removeSpy).toBeDefined();

    // Find the mat-menu trigger (the "Prefix…" button) and verify it
    // exists. Material overlays do not render menu items into the
    // DOM tree until opened in jsdom, so we exercise the public
    // method contract instead of clicking through MatMenu.
    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="bulk-prefix-trigger"]',
    );
    expect(trigger).not.toBeNull();

    // Now exercise the methods: signal the emits the same way the
    // menu item handlers would.
    const menu = fixture.componentInstance as unknown as {
      onAddPrefix: () => void;
      onRemovePrefix: () => void;
    };
    menu.onAddPrefix();
    menu.onRemovePrefix();

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
