import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ApiError } from '../../../core/errors/api-error';
import type { KanbanAttachment } from '../models';
import {
  AttachmentsApi,
  ATTACHMENT_MIME_ALLOWLIST,
  ATTACHMENT_MAX_BYTES,
} from '../api/attachments.api';

/**
 * Result of an attachment validation check (mime + size). `ok === true`
 * means the upload may proceed; `ok === false` means the dialog should
 * surface `reason` via snackbar and NOT call the API.
 */
export interface AttachmentValidation {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Attachments state for the currently open card dialog. Signal-backed,
 * flat list (no client-side threading; attachments have no parent).
 *
 * Mime and size pre-checks run HERE, not in the API client, so the dialog
 * can show feedback without round-tripping. The server enforces the same
 * rules (api-doc §9.2) and returns 422 `attachment_mime_blocked` /
 * standard 422 for size, but the dialog should never reach that path for
 * a file it pre-rejected.
 */
@Service()
export class AttachmentsStore {
  private readonly api = inject(AttachmentsApi);

  private readonly _attachments = signal<readonly KanbanAttachment[]>([]);
  private readonly _loading = signal(false);
  private readonly _uploading = signal(false);
  private readonly _error = signal<ApiError | null>(null);

  /**
   * The currently-active task id. Set via {@link setTaskId} from the page
   * that owns the route param (S2); cleared via {@link clearTaskId} on
   * navigation away. Every URL-scoped API call reads this slot.
   */
  private _taskId: number | null = null;

  /**
   * Bind the store to a specific task. Called by the owning page on init
   * and on route-param change.
   */
  setTaskId(taskId: number): void {
    this._taskId = taskId;
  }

  /**
   * Clear the task binding. Call this on route cleanup so a stale taskId
   * doesn't leak into the next page's API calls.
   */
  clearTaskId(): void {
    this._taskId = null;
  }

  /**
   * Read-only access to the active task id. Throws if not set; use this in
   * callers that need to forward the id to write APIs directly.
   */
  get taskId(): number {
    if (this._taskId === null) {
      throw new Error(
        'AttachmentsStore: taskId is not set. Call setTaskId(taskId) before triggering API calls.',
      );
    }
    return this._taskId;
  }

  readonly attachments = this._attachments.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly uploading = this._uploading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly count = computed(() => this._attachments().length);

  /**
   * Pre-flight validation: mime allowlist + 5 MB ceiling. The dialog calls
   * this BEFORE `upload()`; on `ok === false` it surfaces `reason` via
   * snackbar and skips the HTTP call entirely.
   */
  validate(file: File): AttachmentValidation {
    if (!ATTACHMENT_MIME_ALLOWLIST.has(file.type)) {
      return {
        ok: false,
        reason: `File type "${file.type || 'unknown'}" is not allowed.`,
      };
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      return {
        ok: false,
        reason: `File too large (max 5 MB).`,
      };
    }
    return { ok: true };
  }

  async load(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
  ): Promise<void> {
    const taskId = this.taskId;
    this._loading.set(true);
    this._error.set(null);
    try {
      const list = await firstValueFrom(
        this.api.listAttachments(projectId, taskId, boardId, columnId, cardId),
      );
      this._attachments.set(list);
    } catch (err) {
      this._error.set((err as ApiError) ?? null);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Upload a single file. The caller MUST have run `validate(file)` first;
   * this method does not re-validate (it trusts the caller) so the
   * UX of an immediate "File too large" snackbar is preserved.
   */
  async upload(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    file: File,
  ): Promise<KanbanAttachment> {
    const taskId = this.taskId;
    this._uploading.set(true);
    this._error.set(null);
    try {
      const created = await firstValueFrom(
        this.api.uploadAttachment(projectId, taskId, boardId, columnId, cardId, file),
      );
      this._attachments.update((list) => [...list, created]);
      return created;
    } finally {
      this._uploading.set(false);
    }
  }

  async remove(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    attachmentId: number,
  ): Promise<void> {
    const taskId = this.taskId;
    await firstValueFrom(
      this.api.deleteAttachment(
        projectId,
        taskId,
        boardId,
        columnId,
        cardId,
        attachmentId,
      ),
    );
    this._attachments.update((list) =>
      list.filter((a) => a.id !== attachmentId),
    );
  }

  reset(): void {
    this._attachments.set([]);
    this._error.set(null);
    this._loading.set(false);
    this._uploading.set(false);
  }
}