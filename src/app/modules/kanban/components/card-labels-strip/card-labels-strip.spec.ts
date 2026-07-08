import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { KanbanLabel } from '../../models';
import { CardLabelsStrip } from './card-labels-strip';

const label = (id: number, name: string, color: string): KanbanLabel => ({
  id,
  name,
  color,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

function mount(opts: {
  labels?: readonly KanbanLabel[];
  compact?: boolean;
  maxVisible?: number | null;
  ariaHidden?: boolean;
}): { ref: ComponentRef<CardLabelsStrip>; host: HTMLElement } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [CardLabelsStrip] });
  const fixture = TestBed.createComponent(CardLabelsStrip);
  fixture.componentRef.setInput('labels', opts.labels ?? []);
  fixture.componentRef.setInput('compact', opts.compact ?? false);
  fixture.componentRef.setInput('maxVisible', opts.maxVisible ?? null);
  fixture.componentRef.setInput('ariaHidden', opts.ariaHidden ?? false);
  fixture.detectChanges();
  return { ref: fixture.componentRef, host: fixture.nativeElement as HTMLElement };
}

describe('CardLabelsStrip', () => {
  it('renders nothing visible when labels is empty (no empty <ul>)', () => {
    const { host } = mount({ labels: [] });
    expect(host.querySelector('ul, .strip.compact')).toBeNull();
  });

  it('renders every label as a chip in non-compact mode', () => {
    const labels = [label(1, 'bug', '#ef4444'), label(2, 'p1', '#f59e0b')];
    const { host } = mount({ labels });
    const chips = host.querySelectorAll('app-label-chip');
    expect(chips.length).toBe(2);
    expect(host.querySelector('ul')!.getAttribute('role')).toBe('list');
  });

  it('renders chips in compact mode inside a role=group span', () => {
    const { host } = mount({
      labels: [label(1, 'bug', '#ef4444')],
      compact: true,
    });
    const group = host.querySelector('.strip.compact')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.querySelector('app-label-chip')).toBeTruthy();
  });

  it('caps visible chips to maxVisible and shows a +N chip for the overflow', () => {
    const labels = [
      label(1, 'a', '#ef4444'),
      label(2, 'b', '#f59e0b'),
      label(3, 'c', '#10b981'),
      label(4, 'd', '#3b82f6'),
    ];
    const { host } = mount({ labels, compact: true, maxVisible: 2 });
    const chips = host.querySelectorAll('app-label-chip');
    expect(chips.length).toBe(2);
    const overflow = host.querySelector('.overflow');
    expect(overflow?.textContent?.trim()).toBe('+2');
    expect(overflow?.getAttribute('aria-label')).toBe('+2 more labels');
  });

  it('omits the +N chip when the count fits in the cap', () => {
    const labels = [label(1, 'a', '#ef4444')];
    const { host } = mount({ labels, compact: true, maxVisible: 5 });
    expect(host.querySelector('.overflow')).toBeNull();
  });

  it('marks the compact strip aria-hidden when the caller asks for it', () => {
    const { host } = mount({
      labels: [label(1, 'a', '#ef4444')],
      compact: true,
      ariaHidden: true,
    });
    expect(host.querySelector('.strip.compact')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('exposes a meaningful group label (singular vs plural)', () => {
    const none = mount({ labels: [] });
    expect(none.host.querySelector('.empty, ul, .strip') ?? none.host).toBeTruthy();

    const one = mount({ labels: [label(1, 'a', '#ef4444')], compact: true });
    expect(one.host.querySelector('.strip.compact')!.getAttribute('aria-label')).toBe('1 label');

    const two = mount({
      labels: [label(1, 'a', '#ef4444'), label(2, 'b', '#f59e0b')],
      compact: true,
    });
    expect(two.host.querySelector('.strip.compact')!.getAttribute('aria-label')).toBe('2 labels');
  });
});
