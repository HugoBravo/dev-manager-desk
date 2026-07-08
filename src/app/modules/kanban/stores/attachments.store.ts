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
    this._loading.set(true);
    this._error.set(null);
    try {
      const list = await firstValueFrom(
        this.api.listAttachments(projectId, boardId, columnId, cardId),
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
    this._uploading.set(true);
    this._error.set(null);
    try {
      const created = await firstValueFrom(
        this.api.uploadAttachment(projectId, boardId, columnId, cardId, file),
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
    await firstValueFrom(
      this.api.deleteAttachment(
        projectId,
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