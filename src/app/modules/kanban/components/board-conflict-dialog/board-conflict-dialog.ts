import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

/**
 * Conflict data passed to {@link BoardConflictDialog}. The dialog is opened
 * when a destructive write returns a typed 409 (`board_has_contents` or
 * `column_has_contents`) — see api-doc §10.3 + spec `kanban-write` F7.
 *
 * `entityType` is what failed to delete; `entityName` is the human label;
 * `navigateTarget` (optional) is the route the user can jump to so they can
 * inspect the offending parent. When the server does not return a target
 * id, this is `null` and the "Open" action is disabled.
 *
 * S4: accepts `(string | number)[]` so callers can pass the result of
 * {@link buildBoardRoute} directly. Angular's router coerces number path
 * segments to strings at navigation time, so the dialog does not need to
 * stringify them before opening.
 */
export interface BoardConflictDialogData {
  readonly entityType: 'board' | 'column';
  readonly entityName: string;
  readonly navigateTarget: readonly (string | number)[] | null;
  readonly message: string;
}

/**
 * Result returned by {@link BoardConflictDialog}. `navigateTo` is set when
 * the user clicks "Open" — the caller (page / dialog opener) is responsible
 * for actually navigating.
 */
export type BoardConflictDialogResult =
  | { readonly action: 'cancel' }
  | {
      readonly action: 'open';
      readonly navigateTo: readonly (string | number)[];
    };

/**
 * Material confirmation dialog for typed 409 conflicts. Used by the card /
 * column / board delete flows. The dialog intentionally is NOT the same
 * component as the editor — the dialog is destructive-action-only and must
 * not be confused with the create/edit dialog.
 *
 * A11y: focus is trapped (Material default); title `aria-labelledby`; copy
 * exposed via `aria-describedby` so screen-reader users hear the conflict
 * context when the dialog opens.
 */
@Component({
  selector: 'app-board-conflict-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './board-conflict-dialog.html',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'conflict-title'",
  },
})
export class BoardConflictDialog {
  protected readonly data = inject<BoardConflictDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<BoardConflictDialog, BoardConflictDialogResult>>(MatDialogRef);

  protected readonly titleText = computed(() => {
    if (this.data.entityType === 'board') {
      return 'Board has contents';
    }
    return 'Column has contents';
  });

  protected cancel(): void {
    this.ref.close({ action: 'cancel' });
  }

  protected open(): void {
    const target = this.data.navigateTarget;
    if (!target) {
      return;
    }
    this.ref.close({ action: 'open', navigateTo: target });
  }
}