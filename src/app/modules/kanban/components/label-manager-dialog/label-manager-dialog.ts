import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { ErrorNormalizer } from '../../../../core/errors/error-normalizer';
import type { ApiError } from '../../../../core/errors/api-error';
import { LABEL_PALETTE, type KanbanLabel } from '../../models';
import { LabelsStore } from '../../stores/labels.store';

/**
 * Data passed to {@link LabelManagerDialog}.
 *
 * The dialog is openable from any surface that wants to manage the
 * user's label library (board header, card detail dialog, etc.). The
 * `triggerElement` is the element that opened the dialog; focus is
 * returned to it on close (WCAG AA focus management).
 */
export interface LabelManagerDialogData {
  readonly triggerElement?: HTMLElement;
}

/**
 * Result returned by {@link LabelManagerDialog}. The `action` mirrors
 * what the user did so the caller can decide whether to refetch
 * downstream caches (e.g. cards that referenced a deleted label).
 */
export interface LabelManagerDialogResult {
  readonly action: 'closed' | 'created' | 'updated' | 'deleted';
  readonly label?: KanbanLabel;
}

const NAME_MAX = 64;

/**
 * Material dialog for managing the authenticated user's label library.
 *
 * Two regions:
 * 1. **Create row** at the top — name input + 8-color palette +
 *    "Create" button. Disabled until both fields are valid.
 * 2. **List** of existing labels — each row has a color swatch
 *    (clickable to recolor), an inline-editable name, and a "Delete"
 *    button with a one-step confirm. The list region carries
 *    `aria-live="polite"` so screen readers announce additions and
 *    removals.
 *
 * The dialog is the only place where labels can be created, renamed,
 * recolored, or deleted. The card detail dialog only TOGGLES which
 * labels are applied to a card.
 *
 * Errors surface via a snackbar so the dialog stays open and the
 * user can correct the input. 422 field errors (e.g. duplicate name)
 * map to an inline message under the create row OR under the renamed
 * row, depending on which action triggered the error.
 */
@Component({
  selector: 'app-label-manager-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 #titleRef mat-dialog-title id="label-manager-title" tabindex="-1">Manage labels</h2>

    <mat-dialog-content class="content" [attr.aria-describedby]="'label-manager-create-error'">
      <form class="create-row" (submit)="onCreate($event)">
        <mat-form-field appearance="outline" class="name-field" subscriptSizing="dynamic">
          <mat-label>New label name</mat-label>
          <input
            #createNameInput
            matInput
            type="text"
            [(ngModel)]="createName"
            name="createName"
            [maxlength]="NAME_MAX"
            required
            aria-label="New label name"
            (keydown.enter)="onCreate($event)"
          />
          <mat-hint align="end">{{ createName.length }} / {{ NAME_MAX }}</mat-hint>
        </mat-form-field>
        <mat-button-toggle-group
          class="palette"
          aria-label="Color palette"
          [hideSingleSelectionIndicator]="true"
          [(ngModel)]="createColor"
          name="createColor"
        >
          @for (color of palette; track color) {
            <mat-button-toggle
              [value]="color"
              [attr.aria-label]="'Color ' + colorName(color)"
              [attr.title]="colorName(color)"
            >
              <span class="swatch" [style.background]="color" [attr.aria-hidden]="'true'"></span>
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="!canCreate() || store.loading() === 'create'"
          aria-label="Create new label"
        >
          @if (store.loading() === 'create') {
            <mat-progress-spinner
              diameter="16"
              mode="indeterminate"
              aria-label="Creating"
            ></mat-progress-spinner>
          } @else {
            <ng-container>Create</ng-container>
          }
        </button>
      </form>

      @if (createError(); as err) {
        <p class="error" id="label-manager-create-error" role="alert">{{ err }}</p>
      }

      <ul class="labels" aria-labelledby="label-manager-list-heading" aria-live="polite">
        <h3 id="label-manager-list-heading" class="visually-hidden">Your labels</h3>
        @if (store.loading() === 'list') {
          <li class="state-row">
            <mat-progress-spinner
              diameter="20"
              mode="indeterminate"
              aria-label="Loading labels"
            ></mat-progress-spinner>
            <span>Loading labels…</span>
          </li>
        } @else if (store.error(); as loadErr) {
          <li class="state-row error" role="alert">
            <span>{{ errorMessage(loadErr) }}</span>
          </li>
        } @else if (store.labels().length === 0) {
          <li class="state-row muted">No labels yet. Create your first above.</li>
        } @else {
          @for (label of store.labels(); track label.id) {
            <li class="label-row" [attr.data-label-id]="label.id">
              <button
                type="button"
                class="swatch-button"
                [attr.aria-label]="'Change color of label ' + label.name"
                (click)="startRecolor(label)"
              >
                <span class="swatch" [style.background]="label.color" aria-hidden="true"></span>
              </button>

              @if (renamingId() === label.id) {
                <mat-form-field
                  appearance="outline"
                  class="name-field rename-field"
                  subscriptSizing="dynamic"
                >
                  <mat-label>Rename label</mat-label>
                  <input
                    #renameInput
                    matInput
                    type="text"
                    [(ngModel)]="renameDraft"
                    [maxlength]="NAME_MAX"
                    required
                    aria-label="Rename label"
                    (keydown.enter)="commitRename($event, label)"
                    (keydown.escape)="cancelRename()"
                  />
                </mat-form-field>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="commitRename($event, label)"
                  [disabled]="!renameDraft.trim() || store.loading() === 'update'"
                  aria-label="Save label name"
                >
                  Save
                </button>
                <button
                  mat-button
                  type="button"
                  (click)="cancelRename()"
                  aria-label="Cancel rename"
                >
                  Cancel
                </button>
              } @else {
                <span class="label-name" [title]="label.name">{{ label.name }}</span>
                <button
                  mat-button
                  type="button"
                  class="rename-button"
                  (click)="startRename(label)"
                  [attr.aria-label]="'Rename label ' + label.name"
                >
                  <mat-icon aria-hidden="true">edit</mat-icon>
                  Rename
                </button>
              }

              @if (recoloringId() === label.id) {
                <mat-button-toggle-group
                  class="palette inline-palette"
                  aria-label="Pick a color"
                  [hideSingleSelectionIndicator]="true"
                  [(ngModel)]="recolorDraft"
                  (change)="commitRecolor(label, recolorDraft)"
                >
                  @for (color of palette; track color) {
                    <mat-button-toggle
                      [value]="color"
                      [attr.aria-label]="'Color ' + colorName(color)"
                      [attr.title]="colorName(color)"
                    >
                      <span
                        class="swatch"
                        [style.background]="color"
                        [attr.aria-hidden]="'true'"
                      ></span>
                    </mat-button-toggle>
                  }
                </mat-button-toggle-group>
              }

              @if (confirmingDeleteId() === label.id) {
                <span class="confirm-text">Delete this label?</span>
                <button
                  mat-button
                  type="button"
                  color="warn"
                  (click)="commitDelete(label)"
                  [disabled]="store.loading() === 'delete'"
                  [attr.aria-label]="'Confirm delete label ' + label.name"
                >
                  Delete (confirm)
                </button>
                <button
                  mat-button
                  type="button"
                  (click)="cancelDelete()"
                  aria-label="Cancel delete"
                >
                  Cancel
                </button>
              } @else {
                <button
                  mat-button
                  type="button"
                  color="warn"
                  (click)="startDelete(label)"
                  [attr.aria-label]="'Delete label ' + label.name"
                >
                  <mat-icon aria-hidden="true">delete</mat-icon>
                  Delete
                </button>
              }
            </li>
          }
        }
      </ul>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()" aria-label="Close label manager">
        Close
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .content {
        min-width: 28em;
      }
      .create-row {
        display: grid;
        grid-template-columns: minmax(8em, 1fr) auto auto;
        align-items: center;
        gap: 0.5em;
        margin-bottom: 0.5em;
      }
      .name-field {
        width: 100%;
      }
      .rename-field {
        flex: 1 1 auto;
      }
      .palette {
        display: inline-flex;
        flex-wrap: wrap;
      }
      .inline-palette {
        margin-left: 0.5em;
      }
      .swatch {
        display: inline-block;
        width: 1.1em;
        height: 1.1em;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.12);
        vertical-align: middle;
      }
      .swatch-button {
        background: transparent;
        border: 0;
        padding: 0.25em;
        cursor: pointer;
      }
      .swatch-button:focus-visible {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }
      .labels {
        list-style: none;
        padding: 0;
        margin: 0.5em 0 0;
        border-top: 1px solid rgba(0, 0, 0, 0.08);
      }
      .state-row {
        display: flex;
        align-items: center;
        gap: 0.5em;
        padding: 0.75em 0.25em;
      }
      .state-row.error {
        color: #b00020;
      }
      .state-row.muted {
        color: rgba(0, 0, 0, 0.55);
      }
      .label-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5em;
        padding: 0.5em 0.25em;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      }
      .label-name {
        flex: 1 1 auto;
        font-weight: 500;
        min-width: 6em;
      }
      .rename-button {
        margin-left: auto;
      }
      .confirm-text {
        color: rgba(0, 0, 0, 0.7);
      }
      .error {
        color: #b00020;
        margin: 0.25em 0 0;
        font-size: 0.9em;
      }
      .visually-hidden {
        position: absolute !important;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'label-manager-title'",
  },
})
export class LabelManagerDialog {
  private readonly data = inject<LabelManagerDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<LabelManagerDialog, LabelManagerDialogResult>>(MatDialogRef);
  protected readonly store = inject(LabelsStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly NAME_MAX = NAME_MAX;
  protected readonly palette = LABEL_PALETTE;

  /** Create-row state. */
  protected createName = '';
  protected createColor = LABEL_PALETTE[0] ?? '#64748b';
  protected readonly createError = signal<string | null>(null);

  /** Per-row state. */
  protected readonly renamingId = signal<number | null>(null);
  protected renameDraft = '';
  protected readonly recoloringId = signal<number | null>(null);
  protected recolorDraft = '';
  protected readonly confirmingDeleteId = signal<number | null>(null);

  private readonly titleRef = viewChild<ElementRef<HTMLElement>>('titleRef');
  private readonly createNameInput = viewChild<ElementRef<HTMLInputElement>>('createNameInput');
  private readonly renameInputRef = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  constructor() {
    // Idempotent load — only fires when the cache is empty. The user
    // can still hit the list via a future refetch trigger.
    void this.store.ensureLoaded();
  }

  ngOnInit(): void {
    queueMicrotask(() => {
      this.titleRef()?.nativeElement.focus();
    });
  }

  // --- Create ---

  protected canCreate(): boolean {
    return this.createName.trim().length > 0 && this.createName.length <= NAME_MAX;
  }

  protected async onCreate(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canCreate()) {
      return;
    }
    this.createError.set(null);
    const created = await this.store.create({
      name: this.createName.trim(),
      color: this.createColor,
    });
    if (created === null) {
      this.createError.set(this.fieldOrFallback(this.store.error(), 'name'));
      return;
    }
    this.createName = '';
    this.createColor = LABEL_PALETTE[0] ?? '#64748b';
    this.ref.close({ action: 'created', label: created });
  }

  // --- Rename ---

  protected startRename(label: KanbanLabel): void {
    this.renamingId.set(label.id);
    this.renameDraft = label.name;
    this.confirmingDeleteId.set(null);
    this.recoloringId.set(null);
    queueMicrotask(() => {
      const ref = this.renameInputRef();
      ref?.nativeElement.focus();
      ref?.nativeElement.select();
    });
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.renameDraft = '';
  }

  protected async commitRename(event: Event, label: KanbanLabel): Promise<void> {
    event.preventDefault();
    const next = this.renameDraft.trim();
    if (!next || next === label.name) {
      this.cancelRename();
      return;
    }
    const updated = await this.store.update(label.id, { name: next });
    if (updated === null) {
      this.snackBar.open(this.fieldOrFallback(this.store.error(), 'name'), 'Dismiss', {
        duration: 5000,
      });
      return;
    }
    this.cancelRename();
    this.ref.close({ action: 'updated', label: updated });
  }

  // --- Recolor ---

  protected startRecolor(label: KanbanLabel): void {
    this.recoloringId.set(label.id);
    this.recolorDraft = label.color;
    this.renamingId.set(null);
    this.confirmingDeleteId.set(null);
  }

  protected async commitRecolor(label: KanbanLabel, color: string): Promise<void> {
    if (color === label.color) {
      this.recoloringId.set(null);
      return;
    }
    const updated = await this.store.update(label.id, { color });
    if (updated === null) {
      this.snackBar.open(this.fieldOrFallback(this.store.error(), 'color'), 'Dismiss', {
        duration: 5000,
      });
      return;
    }
    this.recoloringId.set(null);
    this.ref.close({ action: 'updated', label: updated });
  }

  // --- Delete ---

  protected startDelete(label: KanbanLabel): void {
    this.confirmingDeleteId.set(label.id);
    this.renamingId.set(null);
    this.recoloringId.set(null);
  }

  protected cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  protected async commitDelete(label: KanbanLabel): Promise<void> {
    if (this.confirmingDeleteId() !== label.id) {
      return;
    }
    const ok = await this.store.remove(label.id);
    if (!ok) {
      this.snackBar.open(ErrorNormalizer.toUserMessage(this.store.error()!), 'Dismiss', {
        duration: 5000,
      });
      this.confirmingDeleteId.set(null);
      return;
    }
    this.confirmingDeleteId.set(null);
    this.ref.close({ action: 'deleted', label });
  }

  // --- Helpers ---

  protected colorName(hex: string): string {
    const idx = LABEL_PALETTE.indexOf(hex as (typeof LABEL_PALETTE)[number]);
    if (idx === -1) {
      return hex;
    }
    return ['slate', 'red', 'amber', 'emerald', 'cyan', 'blue', 'violet', 'pink'][idx] ?? hex;
  }

  protected errorMessage(err: ApiError | null): string {
    if (!err) {
      return '';
    }
    return ErrorNormalizer.toUserMessage(err);
  }

  protected fieldOrFallback(err: ApiError | null, field: string): string {
    if (err && err.kind === 'validation' && err.fieldErrors) {
      const list = err.fieldErrors[field];
      if (list && list.length > 0) {
        return list[0]!;
      }
    }
    if (err) {
      return ErrorNormalizer.toUserMessage(err);
    }
    return 'Could not save the label. Please try again.';
  }

  protected close(): void {
    this.ref.close({ action: 'closed' });
  }
}
