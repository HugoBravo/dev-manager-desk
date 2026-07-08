import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { KanbanLabel } from '../../models';
import { contrastColor } from '../../utils/contrast-color';

/**
 * Single label chip — colored pill that renders the label's name (or just
 * the color dot in compact mode). Used in two places:
 *
 * - `CardLabelsStrip` (read-only) — `interactive=false`, no click handler.
 * - `CardLabelsPicker` (toggle) — `interactive=true`, click emits
 *   `toggled(label)`.
 *
 * Color contrast: text color is computed via {@link contrastColor} from
 * the label's background hex so every chip clears WCAG AA for normal
 * text. The 8-color palette seeded in `LABEL_PALETTE` was chosen
 * specifically to satisfy this constraint.
 *
 * A11y:
 * - `role="button"` + `tabindex="0"` when `interactive=true`. The
 *   rendered element is a real `<button>` (not a div with role) so the
 *   browser handles keyboard activation and focus correctly.
 * - The label name is rendered as visible text in non-compact mode and
 *   carried by `aria-label` in compact mode (no visual name to read).
 * - Color is never the sole carrier of information; the name is always
 *   reachable via the `aria-label`.
 */
@Component({
  selector: 'app-label-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (interactive()) {
      <button
        type="button"
        class="chip"
        [class.compact]="compact()"
        [class.toggled]="toggled()"
        [attr.aria-pressed]="ariaPressed()"
        [attr.aria-label]="ariaLabel()"
        [attr.title]="label().name"
        (click)="onClick($event)"
      >
        @if (compact()) {
          <span class="dot" aria-hidden="true"></span>
        } @else {
          <span class="name">{{ label().name }}</span>
        }
      </button>
    } @else {
      <span
        class="chip read-only"
        [class.compact]="compact()"
        [attr.aria-label]="ariaLabel()"
        [attr.title]="label().name"
      >
        @if (compact()) {
          <span class="dot" aria-hidden="true"></span>
        } @else {
          <span class="name">{{ label().name }}</span>
        }
      </span>
    }
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.25em;
        border: 0;
        border-radius: 999px;
        padding: 0.15em 0.65em;
        font-size: 0.85em;
        font-weight: 500;
        line-height: 1.4;
        cursor: pointer;
        font-family: inherit;
        /* background and color come from inline styles so the host
           component can pick the contrast color at runtime. */
      }
      .chip.read-only {
        cursor: default;
      }
      .chip.compact {
        padding: 0;
        width: 0.9em;
        height: 0.9em;
        border-radius: 50%;
        align-items: center;
        justify-content: center;
      }
      .chip .dot {
        display: block;
        width: 100%;
        height: 100%;
        border-radius: 50%;
      }
      .chip.compact.read-only {
        padding: 0;
      }
      .chip.toggled {
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
      }
    `,
  ],
  host: {
    '[style.--chip-background]': 'label().color',
    '[style.--chip-color]': 'textColor()',
  },
})
export class LabelChip {
  readonly label = input.required<KanbanLabel>();
  /** Compact = color dot only (no name). Default: false. */
  readonly compact = input<boolean>(false);
  /** When true, renders a real `<button>` and emits `toggled` on click. */
  readonly interactive = input<boolean>(false);
  /**
   * Pressed state for the interactive chip. Surfaces as `aria-pressed`
   * on the button so screen readers announce the toggle state.
   * Only meaningful when `interactive=true`.
   */
  readonly toggled = input<boolean>(false);

  /** Emitted only when `interactive=true`. */
  readonly toggledChange = output<KanbanLabel>();

  protected readonly textColor = computed(() => contrastColor(this.label().color));
  protected readonly ariaLabel = computed(() => {
    const l = this.label();
    return this.compact() ? `Label ${l.name}` : l.name;
  });
  protected readonly ariaPressed = computed(() =>
    this.interactive() ? String(this.toggled()) : null,
  );

  protected onClick(event: MouseEvent): void {
    event.stopPropagation();
    this.toggledChange.emit(this.label());
  }
}
