import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ApiError } from '../../../core/errors/api-error';
import type { KanbanLabel } from '../models';
import { KanbanApi } from '../api/kanban.api';
import {
  KanbanWriteApi,
  type CreateLabelPayload,
  type UpdateLabelPayload,
} from '../api/kanban-write.api';
import { BoardsStore } from './boards.store';

/**
 * Coarse-grained loading state for the labels store. `'idle'` means the
 * store has data (or has never been loaded). The other variants are
 * exclusive — a list fetch does not block a write, and vice versa.
 */
export type LabelsStoreLoading = 'idle' | 'list' | 'create' | 'update' | 'delete' | 'sync';

/**
 * Signal-backed store for the authenticated user's label library.
 *
 * The library is global (NOT scoped to a project): a user has one set of
 * labels and applies them to cards across all of their projects. The
 * store is a *cache*; the write API is responsible for normalizing the
 * request and routing errors through `ErrorNormalizer` (W3 contract).
 *
 * Cross-store coupling: when a label is deleted, the FK cascade on the
 * server removes the pivot rows but the cards still carry the label in
 * the local cache. {@link remove} walks `BoardsStore` to prune the
 * stale reference, mirroring how `CommentsStore` / `AttachmentsStore`
 * already handle their own cascade concerns.
 */
@Service()
export class LabelsStore {
  private readonly api = inject(KanbanApi);
  private readonly writeApi = inject(KanbanWriteApi);
  private readonly boards = inject(BoardsStore);

  private readonly _labels = signal<readonly KanbanLabel[]>([]);
  private readonly _loading = signal<LabelsStoreLoading>('idle');
  private readonly _error = signal<ApiError | null>(null);
  /**
   * True after the first `load()` attempt has settled. We use this to
   * short-circuit `ensureLoaded()` when the cache is empty BECAUSE
   * the server returned an empty list (not because we never tried).
   * Without this flag every dialog open would re-issue the GET.
   */
  private loadAttempted = false;

  readonly labels = this._labels.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly isListLoading = computed(() => this._loading() === 'list');
  readonly isSyncing = computed(() => this._loading() === 'sync');

  /**
   * Fetch the user's label library. Sets the `error` signal on failure
   * and returns `null` so callers using `await` don't have to wrap in
   * try/catch (the page reads `store.error()` for the user message).
   */
  async load(): Promise<readonly KanbanLabel[] | null> {
    this._loading.set('list');
    this._error.set(null);
    try {
      const list = await firstValueFrom(this.api.listLabels());
      this._labels.set(list);
      this.loadAttempted = true;
      return list;
    } catch (err) {
      this._error.set(toApiError(err));
      this.loadAttempted = true;
      return null;
    } finally {
      this._loading.set('idle');
    }
  }

  /**
   * Refetch the library only when it was never loaded AND no list
   * fetch is in flight. Used by the card detail dialog so the picker
   * is ready without forcing a refresh on every dialog open. An
   * empty cache is NOT a reason to refetch — the user may genuinely
   * have no labels yet.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loadAttempted || this._loading() === 'list') {
      return;
    }
    await this.load();
  }

  /**
   * Create a label. On success, appends to the cache (preserving the
   * server's name-ASC ordering by re-sorting locally).
   */
  async create(payload: CreateLabelPayload): Promise<KanbanLabel | null> {
    this._loading.set('create');
    this._error.set(null);
    try {
      const label = await firstValueFrom(this.writeApi.createLabel(payload));
      const next = sortByName([...this._labels(), label]);
      this._labels.set(next);
      return label;
    } catch (err) {
      this._error.set(toApiError(err));
      return null;
    } finally {
      this._loading.set('idle');
    }
  }

  /**
   * Update a label's name and/or color. Patches the matching row and
   * re-sorts the cache so the alphabetical order is preserved.
   */
  async update(labelId: number, payload: UpdateLabelPayload): Promise<KanbanLabel | null> {
    this._loading.set('update');
    this._error.set(null);
    try {
      const updated = await firstValueFrom(this.writeApi.updateLabel(labelId, payload));
      const next = sortByName(this._labels().map((l) => (l.id === updated.id ? updated : l)));
      this._labels.set(next);
      return updated;
    } catch (err) {
      this._error.set(toApiError(err));
      return null;
    } finally {
      this._loading.set('idle');
    }
  }

  /**
   * Hard-delete a label. The server cascades the pivot rows; the
   * `BoardsStore` cache must also drop the label from every card that
   * carried it, otherwise the UI would render an orphan reference.
   */
  async remove(labelId: number): Promise<boolean> {
    this._loading.set('delete');
    this._error.set(null);
    try {
      await firstValueFrom(this.writeApi.deleteLabel(labelId));
      this._labels.set(this._labels().filter((l) => l.id !== labelId));
      this.boards.pruneLabelFromCards(labelId);
      return true;
    } catch (err) {
      this._error.set(toApiError(err));
      return false;
    } finally {
      this._loading.set('idle');
    }
  }

  /**
   * Public writer for the cache. Used by tests and by the label manager
   * dialog when it wants to commit a state without an HTTP round-trip
   * (e.g. undo). The dialog never needs this; the public `update`
   * method covers the dialog's needs.
   */
  readonly labelsCache = {
    set: (next: readonly KanbanLabel[]) => this._labels.set(next),
    update: (fn: (prev: readonly KanbanLabel[]) => readonly KanbanLabel[]) =>
      this._labels.update(fn),
  };

  /**
   * Test/seed hook: marks the store as "already attempted to load" so
   * `ensureLoaded()` short-circuits without an HTTP request. Production
   * code never calls this — the natural `load()` flow handles the flag.
   */
  __markLoadedForTests(): void {
    this.loadAttempted = true;
  }
}

function sortByName(list: readonly KanbanLabel[]): readonly KanbanLabel[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function toApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'kind' in err) {
    return err as ApiError;
  }
  return {
    kind: 'network',
    status: 0,
    message:
      err &&
      typeof err === 'object' &&
      'message' in err &&
      typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'Could not reach the server.',
  };
}
