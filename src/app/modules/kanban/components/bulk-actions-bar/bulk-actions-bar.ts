import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

/**
 * Selection-driven action bar rendered by `BoardsListPage` when at
 * least one board is selected. Pure presentational component; the
 * page owns the selection set and the routing into
 * `KanbanWriteApi.bulk*` endpoints.
 *
 * Visibility is gated by an `@if (count() > 0)` host clause — never
 * via CSS `display: none` or `[hidden]`, so the component contributes
 * nothing to the DOM when no boards are selected.
 *
 * The prefix menu ("Add prefix…" / "Remove prefix…") uses Material's
 * `mat-menu` so the dropdown overlay reuses the project's standard
 * focus-trap and keyboard navigation. Real prefix text is collected
 * elsewhere (the page-side dialog); this component only signals the
 * intent.
 */
@Component({
  selector: 'app-bulk-actions-bar',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './bulk-actions-bar.html',
  styleUrl: './bulk-actions-bar.scss',
})
export class BulkActionsBar {
  /** Number of selected boards. The bar hides when this is `0`. */
  readonly count = input(0);
  /**
   * Names of selected boards. Reserved for future display copy (e.g.
   * the snackbar message after a bulk delete). The component does
   * not iterate the list in the current template — kept here so the
   * page's selection set has a single source-of-truth binding.
   */
  readonly selectedNames = input<readonly string[]>([]);

  /** Emitted when the user clicks "Move to trash". */
  readonly bulkDelete = output<void>();
  /** Emitted when the user picks "Add prefix…" from the menu. */
  readonly bulkAddPrefix = output<void>();
  /** Emitted when the user picks "Remove prefix…" from the menu. */
  readonly bulkRemovePrefix = output<void>();

  /**
   * Human-friendly count: `1`, `2`, … or `99+` when the selection
   * grows past 99 to keep the UI compact.
   */
  protected readonly countDisplay = computed(() => {
    const n = this.count();
    if (n <= 99) {
      return `${n}`;
    }
    return '99+';
  });

  protected onMoveToTrash(): void {
    this.bulkDelete.emit();
  }

  protected onAddPrefix(): void {
    this.bulkAddPrefix.emit();
  }

  protected onRemovePrefix(): void {
    this.bulkRemovePrefix.emit();
  }
}
