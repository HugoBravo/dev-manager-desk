import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { KanbanLabel } from '../../models';
import { LabelChip } from './label-chip';

function makeLabel(overrides: Partial<KanbanLabel> = {}): KanbanLabel {
  return {
    id: 4,
    name: 'bug',
    color: '#ef4444',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mount(
  opts: {
    label?: KanbanLabel;
    compact?: boolean;
    interactive?: boolean;
    toggled?: boolean;
  } = {},
): { ref: ComponentRef<LabelChip>; host: HTMLElement; detect: () => void } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [LabelChip] });
  const fixture = TestBed.createComponent(LabelChip);
  fixture.componentRef.setInput('label', opts.label ?? makeLabel());
  fixture.componentRef.setInput('compact', opts.compact ?? false);
  fixture.componentRef.setInput('interactive', opts.interactive ?? false);
  fixture.componentRef.setInput('toggled', opts.toggled ?? false);
  fixture.detectChanges();
  return {
    ref: fixture.componentRef,
    host: fixture.nativeElement as HTMLElement,
    detect: () => fixture.detectChanges(),
  };
}

describe('LabelChip', () => {
  it('renders the name when not compact', () => {
    const { host } = mount();
    expect(host.textContent?.trim()).toBe('bug');
  });

  it('renders a color dot (no name) when compact', () => {
    const { host } = mount({ compact: true });
    expect(host.querySelector('.dot')).toBeTruthy();
    expect(host.querySelector('.name')).toBeNull();
  });

  it('renders a <span> when read-only and a <button> when interactive', () => {
    const readonly = mount({ interactive: false });
    expect(readonly.host.querySelector('button')).toBeNull();
    expect(readonly.host.querySelector('.chip.read-only')).toBeTruthy();

    const interactive = mount({ interactive: true });
    expect(interactive.host.querySelector('button')).toBeTruthy();
  });

  it('emits toggledChange only when interactive', () => {
    const readonly = mount({ interactive: false });
    const readonlyListener = vi.fn();
    readonly.ref.instance.toggledChange.subscribe(readonlyListener);
    (readonly.host.querySelector('.chip') as HTMLElement).click();
    expect(readonlyListener).not.toHaveBeenCalled();

    const interactive = mount({ interactive: true });
    const interactiveListener = vi.fn();
    interactive.ref.instance.toggledChange.subscribe(interactiveListener);
    (interactive.host.querySelector('button') as HTMLButtonElement).click();
    expect(interactiveListener).toHaveBeenCalledTimes(1);
    expect(interactiveListener).toHaveBeenCalledWith(makeLabel());
  });

  it('stops click propagation so a chip inside a card does not open the card', () => {
    const interactive = mount({ interactive: true });
    const propagated = vi.fn();
    interactive.host.addEventListener('click', propagated);
    (interactive.host.querySelector('button') as HTMLButtonElement).click();
    expect(propagated).not.toHaveBeenCalled();
  });

  it('surfaces aria-pressed only when interactive', () => {
    const readonly = mount({ interactive: false, toggled: true });
    const readonlyButton = readonly.host.querySelector('button');
    expect(readonlyButton).toBeNull();

    const onChip = mount({ interactive: true, toggled: true });
    const onButton = onChip.host.querySelector('button')!;
    expect(onButton.getAttribute('aria-pressed')).toBe('true');

    const offChip = mount({ interactive: true, toggled: false });
    expect(offChip.host.querySelector('button')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('uses the label name as the aria-label in non-compact mode', () => {
    const { host } = mount();
    expect(host.querySelector('.chip')!.getAttribute('aria-label')).toBe('bug');
  });

  it('uses "Label {name}" as the aria-label in compact mode (no visible name)', () => {
    const { host } = mount({ compact: true });
    expect(host.querySelector('.chip')!.getAttribute('aria-label')).toBe('Label bug');
  });
});
