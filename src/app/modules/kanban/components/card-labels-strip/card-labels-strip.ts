import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { KanbanLabel } from '../../models';
import { LabelChip } from '../label-chip/label-chip';

/**
 * Read-only horizontal strip of label chips. Used in two places:
 *
 * 1. The card preview on `BoardDetailPage` (`compact=true`,
 *    `maxVisible=5`) — shows up to five color dots then a `+N` chip.
 * 2. The card body in `CardDetailDialog` (`compact=false`) — chips
 *    with the label name in white/black text per the chip's color.
 *
 * A11y: in compact mode the strip is `aria-hidden="true"` and the
 * individual chips carry their own `aria-label` so screen readers
 * announce the labels on demand (the `CardDetailDialog` heading is
 * the canonical landmark). In non-compact mode the strip is a
 * `<ul>` with `role="list"` and each chip is an `<li>`; the visual
 * names carry the meaning.
 */
@Component({
  selector: 'app-card-labels-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LabelChip],
  template: `
    @if (labels().length === 0) {
      <span class="empty" aria-hidden="true"></span>
    } @else if (compact()) {
      <span
        class="strip compact"
        role="group"
        [attr.aria-label]="ariaGroupLabel()"
        [attr.aria-hidden]="ariaHidden() ? 'true' : null"
      >
        @for (label of visible(); track label.id) {
          <app-label-chip [label]="label" [compact]="true" />
        }
        @if (overflowCount() > 0) {
          <span class="overflow" [attr.aria-label]="'+' + overflowCount() + ' more labels'"
            >+{{ overflowCount() }}</span
          >
        }
      </span>
    } @else {
      <ul class="strip" role="list" [attr.aria-label]="ariaGroupLabel()">
        @for (label of labels(); track label.id) {
          <li>
            <app-label-chip [label]="label" [compact]="false" />
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .strip {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.25em;
        align-items: center;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .strip.compact {
        gap: 0.2em;
      }
      .strip li {
        list-style: none;
      }
      .overflow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.5em;
        height: 1.2em;
        padding: 0 0.35em;
        font-size: 0.75em;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.55);
        background: rgba(0, 0, 0, 0.08);
        border-radius: 999px;
      }
      .empty {
        display: block;
        height: 0;
      }
    `,
  ],
})
export class CardLabelsStrip {
  readonly labels = input.required<readonly KanbanLabel[]>();
  readonly compact = input<boolean>(false);
  /**
   * Cap on rendered chips. `null` = show all. When over the cap, a
   * `+N` chip is appended.
   */
  readonly maxVisible = input<number | null>(null);
  /**
   * When true, the strip is hidden from assistive tech. The card
   * preview uses this to avoid spamming screen-reader users with
   * "Label bug, Label P1, …" on every card they scan; the user gets
   * the full list when they open the detail dialog.
   */
  readonly ariaHidden = input<boolean>(false);

  protected readonly visible = computed(() => {
    const cap = this.maxVisible();
    if (cap === null) {
      return this.labels();
    }
    return this.labels().slice(0, cap);
  });

  protected readonly overflowCount = computed(() => {
    const cap = this.maxVisible();
    if (cap === null) {
      return 0;
    }
    return Math.max(0, this.labels().length - cap);
  });

  protected readonly ariaGroupLabel = computed(() => {
    const n = this.labels().length;
    if (n === 0) {
      return 'No labels';
    }
    if (n === 1) {
      return '1 label';
    }
    return `${n} labels`;
  });
}
