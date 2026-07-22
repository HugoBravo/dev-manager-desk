import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { ErrorNormalizer } from '../../../../core/errors/error-normalizer';
import type { ApiError } from '../../../../core/errors/api-error';
import type { KanbanCard, KanbanLabel } from '../../models';
import { LabelsStore } from '../../stores/labels.store';
import { BoardsStore } from '../../stores/boards.store';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { LabelChip } from '../label-chip/label-chip';
import {
  LabelManagerDialog,
  type LabelManagerDialogData,
  type LabelManagerDialogResult,
} from '../label-manager-dialog/label-manager-dialog';

/**
 * Inline label picker embedded in `CardDetailDialog`. Renders the
 * user's label library as toggleable chips; click on a chip flips
 * whether the card has that label.
 *
 * ## Debounced sync
 *
 * Toggles do NOT fire one PUT per click. Instead each click mutates
 * `pendingIds` immediately (optimistic UI), schedules a 250 ms
 * debounced flush, and a single `syncCardLabels` request commits the
 * final set. Multiple toggles within 250 ms coalesce to one request —
 * the typical "click 3 chips" interaction generates one HTTP call,
 * not three.
 *
 * ## Rollback on error
 *
 * When the request fails:
 *   1. Roll `pendingIds` back to `lastCommittedIds` (the previous
 *      successful set).
 *   2. Emit `syncError` so the dialog can surface a snackbar.
 *   3. Do NOT retry — the user can re-tap after seeing the error.
 *
 * While a flush is in flight, NEW toggles are queued by mutating
 * `pendingIds`; the next debounce window restarts. A `syncing()`
 * signal drives the spinner.
 */
@Component({
  selector: 'app-card-labels-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LabelChip, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="picker" role="group" aria-label="Card labels">
      @if (userLabels().length === 0) {
        <p class="empty muted">You don't have any labels yet. Create some in the label manager.</p>
      } @else {
        <div class="chips">
          @for (label of userLabels(); track label.id) {
            <app-label-chip
              [label]="label"
              [interactive]="true"
              [toggled]="hasLabel(label.id)"
              (toggledChange)="onToggle(label)"
            />
          }
        </div>
      }
      <div class="footer">
        @if (syncing()) {
          <mat-progress-spinner
            diameter="14"
            mode="indeterminate"
            aria-label="Saving label changes"
          ></mat-progress-spinner>
          <span class="muted">Saving…</span>
        }
        <button
          mat-button
          type="button"
          class="manage-link"
          (click)="openManager()"
          aria-label="Manage labels library"
        >
          <mat-icon aria-hidden="true">settings</mat-icon>
          Manage library…
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4em;
        align-items: center;
      }
      .footer {
        display: flex;
        align-items: center;
        gap: 0.5em;
        margin-top: 0.5em;
      }
      .muted {
        color: rgba(0, 0, 0, 0.55);
        font-size: 0.85em;
      }
      .empty {
        margin: 0.25em 0;
      }
      .manage-link {
        margin-left: auto;
      }
    `,
  ],
})
export class CardLabelsPicker {
  readonly card = input.required<KanbanCard>();
  readonly userLabels = input.required<readonly KanbanLabel[]>();
  /**
   * When `true`, the picker renders chips as read-only — `onToggle()` is a
   * no-op and the debounced flush short-circuits without issuing any HTTP
   * request. Used by hosts that want to display the current label set
   * without persisting changes (e.g. the create-card dialog, where the
   * card doesn't exist on the server yet and a sync would 404).
   *
   * Default `false`: the picker is interactive.
   */
  readonly disabled = input<boolean>(false);

  /**
   * Emitted after a successful sync with the new label set. The
   * dialog listens to this to commit the new card to the store.
   */
  readonly changed = output<KanbanCard>();
  /** Emitted on sync failure so the dialog can show a snackbar. */
  readonly syncError = output<ApiError>();

  private readonly labelsStore = inject(LabelsStore);
  private readonly boardsStore = inject(BoardsStore);
  private readonly writeApi = inject(KanbanWriteApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /**
   * Current optimistic set of label ids. Mutated on every toggle.
   * Rolled back to `lastCommittedIds` on a failed sync.
   */
  private readonly pendingIds = signal<readonly number[]>([]);
  /**
   * Snapshot of the most recent successfully-committed set. Used to
   * roll back on a failed sync. The store is the source of truth;
   * this signal is just a per-instance "last known good" cache.
   */
  private readonly lastCommittedIds = signal<readonly number[]>([]);
  protected readonly syncing = signal(false);

  /**
   * Handle to the debounce timer. Reassigned on every toggle so the
   * 250 ms window restarts. The flush effect is what reads it.
   */
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  /**
   * Token incremented on every toggle; the flush effect checks the
   * token before firing so a stale flush from an earlier timer
   * cannot overwrite a newer commit.
   */
  private generation = 0;
  /** The most recent generation that successfully committed. */
  private lastCommittedGeneration = 0;

  /**
   * Reactive: the set of label ids currently in `pendingIds` (or the
   * last-committed set while no pending change exists). Exposed for
   * tests and for downstream computed signals.
   */
  protected readonly currentIds = computed(() => {
    if (this.pendingIds().length > 0 || this.syncing()) {
      return this.pendingIds();
    }
    return this.lastCommittedIds();
  });

  constructor() {
    // Effect: when the bound card's labels change (e.g. a sync just
    // committed) AND the user has no in-flight changes, refresh
    // `lastCommittedIds` so the next toggle starts from the right
    // baseline.
    effect(() => {
      const cardLabels = this.card().labels.map((l) => l.id);
      this.lastCommittedIds.set(cardLabels);
      if (this.pendingIds().length === 0 && !this.syncing()) {
        // Nothing in flight; the canonical set is the card's labels.
      }
    });

    // Effect: schedule a debounced flush whenever `pendingIds`
    // changes. The effect is intentionally minimal — the actual
    // request lives in `flush()` so the debounce can be tested
    // without HTTP.
    effect(() => {
      const pending = this.pendingIds();
      if (this.debounceHandle !== null) {
        clearTimeout(this.debounceHandle);
      }
      this.debounceHandle = setTimeout(() => {
        this.debounceHandle = null;
        void this.flush(pending);
      }, 250);
    });
  }

  protected hasLabel(labelId: number): boolean {
    return this.currentIds().includes(labelId);
  }

  protected onToggle(label: KanbanLabel): void {
    if (this.disabled()) {
      // Display-only mode: the host wants to show the current set without
      // committing changes. The debounce effect also short-circuits, so
      // no HTTP traffic is generated.
      return;
    }
    if (this.syncing()) {
      // A flush is in flight. Optimistically update pendingIds; the
      // effect will restart the debounce. The user's tap is buffered.
      this.generation++;
    } else {
      this.generation++;
    }
    const next = this.currentIds().includes(label.id)
      ? this.currentIds().filter((id) => id !== label.id)
      : [...this.currentIds(), label.id];
    this.pendingIds.set(next);
  }

  /**
   * Open the label manager dialog. The picker waits for it to close
   * and re-fetches the library if the user added/removed labels.
   */
  protected async openManager(): Promise<void> {
    // The picker doesn't have a `triggerElement`; pass nothing.
    const data: LabelManagerDialogData = {};
    const ref = this.dialog.open<
      LabelManagerDialog,
      LabelManagerDialogData,
      LabelManagerDialogResult
    >(LabelManagerDialog, { data });
    const result = await firstValueFrom(ref.afterClosed());
    if (result && result.action !== 'closed') {
      await this.labelsStore.load();
      // If the user deleted a label, the card's label set may have
      // shrunk; refresh the committed set so the picker reflects it.
      this.lastCommittedIds.set(this.card().labels.map((l) => l.id));
      this.pendingIds.set([]);
    }
  }

  /**
   * Flush the current `pendingIds` to the server. Coalesced by the
   * 250 ms debounce in the constructor's effect.
   */
  private async flush(pending: readonly number[]): Promise<void> {
    if (this.disabled()) {
      // Display-only mode: the host asked us not to persist changes.
      // Even if a stale `pendingIds` set lingers from before the
      // disabled flag flipped, do not fire HTTP.
      return;
    }
    // No-op guard #1: an empty `pending` only means "nothing changed
    // since last user action" — the user's card still carries whatever
    // `lastCommittedIds` says. Re-PUT'ing an empty `label_ids` against
    // a card that already has labels would CLEAR the labels server-side
    // (the backend treats `[]` as "clear all"). So we skip the request
    // when there's nothing to flush.
    if (pending.length === 0) {
      return;
    }
    // No-op guard #2: if the pending set matches the last-committed
    // set, there's nothing to change. The debounce fires after mount
    // when the card arrives late, so this also covers that case.
    if (
      pending.length === this.lastCommittedIds().length &&
      pending.every((id) => this.lastCommittedIds().includes(id))
    ) {
      return;
    }

    const myGeneration = this.generation;
    this.syncing.set(true);
    try {
      const card = await firstValueFrom(
        this.writeApi.syncCardLabels(
          this.resolveProjectId(),
          this.boardsStore.taskId,
          this.resolveBoardId(),
          this.resolveColumnId(),
          this.card().id,
          pending,
        ),
      );
      if (myGeneration < this.lastCommittedGeneration) {
        // A newer generation has already committed; ignore this stale
        // result to avoid rolling back a more recent user action.
        return;
      }
      this.lastCommittedGeneration = myGeneration;
      this.lastCommittedIds.set(card.labels.map((l) => l.id));
      this.pendingIds.set([]);
      this.changed.emit(card);
    } catch (err) {
      // Roll back. Note: a newer generation may have queued more
      // toggles after this flush started; we only roll back to
      // `lastCommittedIds` so the next debounce window will retry
      // the new pending set.
      this.pendingIds.set([...this.lastCommittedIds()]);
      const apiError = err as ApiError;
      this.syncError.emit(apiError);
      this.snackBar.open(ErrorNormalizer.toUserMessage(apiError), 'Dismiss', {
        duration: 5000,
      });
    } finally {
      this.syncing.set(false);
    }
  }

  /**
   * The picker only receives a `KanbanCard`, not the full
   * project/board/column context the API expects. The dialog that
   * hosts the picker supplies the chain ids via {@link setChain}
   * once on mount.
   */
  private projectId: number | null = null;
  private boardId: number | null = null;
  private columnId: number | null = null;

  setChain(projectId: number, boardId: number, columnId: number): void {
    this.projectId = projectId;
    this.boardId = boardId;
    this.columnId = columnId;
  }

  private resolveProjectId(): number {
    if (this.projectId === null) {
      throw new Error('CardLabelsPicker: projectId not set; the host dialog must call setChain()');
    }
    return this.projectId;
  }

  private resolveBoardId(): number {
    if (this.boardId === null) {
      throw new Error('CardLabelsPicker: boardId not set; the host dialog must call setChain()');
    }
    return this.boardId;
  }

  private resolveColumnId(): number {
    if (this.columnId === null) {
      throw new Error('CardLabelsPicker: columnId not set; the host dialog must call setChain()');
    }
    return this.columnId;
  }

  /**
   * Test-only hook: forces an immediate flush bypassing the debounce.
   * Used by the picker spec to assert the sync behavior without
   * waiting on real timers.
   */
  protected __forceFlushForTests(): Promise<void> {
    if (this.debounceHandle !== null) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
    return this.flush(this.pendingIds());
  }
}
