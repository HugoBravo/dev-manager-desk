import {
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ErrorNormalizer } from '../../../../core/errors/error-normalizer';
import type { ApiError } from '../../../../core/errors/api-error';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';
import { CommentsStore } from '../../stores/comments.store';
import { AttachmentsStore } from '../../stores/attachments.store';
import type { KanbanCard } from '../../models';
import type { KanbanComment } from '../../models';
import { MarkdownPipe } from '../../../../shared/pipes/markdown.pipe';
import {
  BoardConflictDialog,
  type BoardConflictDialogData,
  type BoardConflictDialogResult,
} from '../board-conflict-dialog/board-conflict-dialog';
import {
  CardEditorDialog,
  type CardEditorDialogData,
  type CardEditorDialogResult,
} from '../card-editor-dialog/card-editor-dialog';

/**
 * Data passed to {@link CardDetailDialog}.
 *
 * The dialog is a Material `mat-dialog` (locked decision — spec `kanban-write`
 * F6). It hosts the card preview, action toolbar (edit / archive / restore /
 * delete), comment thread, and attachment list (PR4).
 *
 * `triggerElement` is the element that opened the dialog — the dialog returns
 * focus to it on close (WCAG AA focus management).
 */
export interface CardDetailDialogData {
  readonly card: KanbanCard;
  readonly projectId: number;
  readonly boardId: number;
  readonly columnId: number;
  readonly triggerElement?: HTMLElement;
}

/**
 * Result returned by {@link CardDetailDialog}. `action` is what the user did
 * (or `'closed'` if the dialog was dismissed without taking an action).
 */
export interface CardDetailDialogResult {
  readonly action:
    | 'closed'
    | 'edited'
    | 'archived'
    | 'restored'
    | 'deleted';
  readonly card?: KanbanCard;
}

/**
 * Material dialog showing a card preview + action toolbar + comments + attachments.
 *
 * Behavior:
 * - **Edit**: opens {@link CardEditorDialog} in edit mode. On save, refreshes
 *   the local card and signals the new resource.
 * - **Archive / Restore**: calls the write API, updates the store.
 * - **Delete**: calls the write API. On 409 (`column_has_contents` if the
 *   API ever starts enforcing it on cards), opens
 *   {@link BoardConflictDialog}. On 204, signals deletion and closes.
 * - **Comments** (PR4): load via {@link CommentsStore}; canEdit() gates the
 *   edit/delete buttons; 403 from PATCH maps to "Edit window expired" via
 *   the ErrorNormalizer 403 discriminator.
 * - **Attachments** (PR4): load via {@link AttachmentsStore}; mime + 5 MB
 *   pre-check happens client-side BEFORE the upload POST.
 * - **Markdown** (PR4): `card.body` and `comment.body` render via
 *   {@link MarkdownPipe} (marked → DOMPurify → bypassSecurityTrustHtml).
 *
 * A11y:
 * - Focus moves to the `h2` title on open.
 * - Material default focus trap.
 * - Returns focus to the trigger element on close.
 * - Each comment is an `<article>` with role="article" + author chip.
 * - "Add comment" moves focus to the textarea; "Post" submits.
 * - Inline edit opens a textarea focused on click.
 * - No `new Date()` in templates — `now()` reads from the CommentsStore tick.
 */
@Component({
  selector: 'app-card-detail-dialog',
  imports: [
    SlicePipe,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MarkdownPipe,
  ],
  template: `
    <h2
      #titleRef
      mat-dialog-title
      id="card-detail-title"
      tabindex="-1"
    >
      {{ card().title }}
      @if (card().archived_at) {
        <span class="archived-chip">(archived)</span>
      }
    </h2>
    <mat-dialog-content [attr.aria-describedby]="'card-detail-body'">
      <div
        id="card-detail-body"
        class="card-body markdown-region"
        role="region"
        [attr.aria-labelledby]="'card-detail-title'"
      >
        @if (card().body) {
          <div [innerHTML]="card().body | markdown"></div>
        } @else {
          <p class="muted">(no body)</p>
        }
      </div>
      @if (card().due_date) {
        <p class="card-due">Due: {{ card().due_date }}</p>
      }

      <!-- Comments section (PR4) -->
      <section class="comments" aria-labelledby="comments-heading">
        <h3 id="comments-heading">Comments</h3>
        @if (commentsStore.loading()) {
          <p>
            <mat-progress-spinner diameter="20" mode="indeterminate" aria-label="Loading comments"></mat-progress-spinner>
            Loading comments…
          </p>
        }
        @if (commentsStore.error(); as commentError) {
          <p class="error" role="alert">{{ commentMessage(commentError) }}</p>
        }
        @if (!commentsStore.loading() && commentsStore.sorted().length === 0) {
          <p class="muted">No comments yet.</p>
        }
        <ul class="thread-list" aria-label="Comment threads">
          @for (thread of commentsStore.threads(); track thread[0].id) {
            @for (comment of thread; track comment.id) {
              <li>
                <article class="comment" role="article" [attr.aria-labelledby]="'comment-author-' + comment.id">
                  <header class="comment-header">
                    <span
                      class="author-chip"
                      [id]="'comment-author-' + comment.id"
                      [attr.aria-label]="'Author ' + comment.author_id"
                    >User #{{ comment.author_id }}</span>
                    <time
                      class="comment-time"
                      [attr.datetime]="comment.created_at"
                      [attr.aria-label]="'Created at ' + comment.created_at"
                    >{{ comment.created_at | slice:0:10 }}</time>
                    @if (commentsStore.canEdit(comment)) {
                      <span class="edit-window" aria-label="Within edit window">· editable</span>
                    }
                  </header>
                  @if (editingCommentId() === comment.id) {
                    <label class="visually-hidden" [attr.for]="'comment-edit-' + comment.id">
                      Edit comment
                    </label>
                    <textarea
                      [id]="'comment-edit-' + comment.id"
                      #commentEditor
                      class="comment-edit"
                      rows="3"
                      [value]="editingDraft()"
                      (input)="onEditDraftChange($event)"
                      aria-label="Edit comment body"
                    ></textarea>
                    <div class="comment-actions">
                      <button
                        mat-button
                        type="button"
                        (click)="cancelEdit()"
                        aria-label="Cancel edit"
                      >Cancel</button>
                      <button
                        mat-flat-button
                        color="primary"
                        type="button"
                        (click)="saveEdit(comment)"
                        [disabled]="savingEdit()"
                        aria-label="Save edit"
                      >Save</button>
                    </div>
                  } @else {
                    <div class="comment-body markdown-region">
                      <div [innerHTML]="comment.body | markdown"></div>
                    </div>
                    @if (commentsStore.canEdit(comment)) {
                      <div class="comment-actions">
                        <button
                          mat-button
                          type="button"
                          (click)="startEdit(comment)"
                          [attr.aria-label]="'Edit comment by author ' + comment.author_id"
                        >
                          <mat-icon aria-hidden="true">edit</mat-icon>
                          Edit
                        </button>
                        @if (confirmingDeleteId() === comment.id) {
                          <button
                            mat-button
                            type="button"
                            color="warn"
                            (click)="confirmDeleteComment(comment)"
                            [attr.aria-label]="'Confirm delete comment by author ' + comment.author_id"
                          >Delete (confirm)</button>
                          <button
                            mat-button
                            type="button"
                            (click)="cancelDeleteComment()"
                            aria-label="Cancel delete"
                          >Cancel</button>
                        } @else {
                          <button
                            mat-button
                            type="button"
                            color="warn"
                            (click)="startDeleteComment(comment)"
                            [attr.aria-label]="'Delete comment by author ' + comment.author_id"
                          >
                            <mat-icon aria-hidden="true">delete</mat-icon>
                            Delete
                          </button>
                        }
                      </div>
                    }
                  }
                </article>
              </li>
            }
          }
        </ul>

        <!-- New comment input -->
        <form class="comment-form" (submit)="postComment($event)">
          <label class="visually-hidden" for="new-comment-body">New comment</label>
          <textarea
            id="new-comment-body"
            #newCommentInput
            class="comment-new"
            rows="2"
            placeholder="Write a comment…"
            [value]="newCommentBody()"
            (input)="onNewCommentChange($event)"
            aria-label="New comment body"
          ></textarea>
          <div class="comment-actions">
            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="postingComment() || !newCommentBody().trim()"
              aria-label="Post comment"
            >
              Post
            </button>
            <button
              mat-button
              type="button"
              (click)="focusNewComment()"
              aria-label="Focus new comment input"
            >Add comment</button>
          </div>
        </form>
      </section>

      <!-- Attachments section (PR4) -->
      <section class="attachments" aria-labelledby="attachments-heading">
        <h3 id="attachments-heading">Attachments</h3>
        @if (attachmentsStore.loading()) {
          <p>
            <mat-progress-spinner diameter="20" mode="indeterminate" aria-label="Loading attachments"></mat-progress-spinner>
            Loading attachments…
          </p>
        }
        @if (attachmentsStore.error(); as attachmentError) {
          <p class="error" role="alert">{{ commentMessage(attachmentError) }}</p>
        }
        @if (!attachmentsStore.loading() && attachmentsStore.attachments().length === 0) {
          <p class="muted">No attachments yet.</p>
        }
        <ul class="attachment-list" aria-label="Attachment list">
          @for (att of attachmentsStore.attachments(); track att.id) {
            <li class="attachment">
              <span class="filename" [attr.aria-label]="'File ' + att.original_filename">
                {{ att.original_filename }}
              </span>
              <span class="filesize" [attr.aria-label]="'Size ' + formatSize(att.size_bytes)">
                {{ formatSize(att.size_bytes) }}
              </span>
              <span class="mimetype" [attr.aria-label]="'Mime type ' + att.mime">
                {{ att.mime }}
              </span>
              <!-- Intentionally NO download button. The API returns url: null
                   (api-doc §15); rendering a download action would mislead. -->
              @if (confirmingAttachmentDeleteId() === att.id) {
                <button
                  mat-button
                  type="button"
                  color="warn"
                  (click)="confirmDeleteAttachment(att)"
                  [attr.aria-label]="'Confirm delete attachment ' + att.original_filename"
                >Delete (confirm)</button>
                <button
                  mat-button
                  type="button"
                  (click)="cancelDeleteAttachment()"
                  aria-label="Cancel delete"
                >Cancel</button>
              } @else {
                <button
                  mat-button
                  type="button"
                  color="warn"
                  (click)="startDeleteAttachment(att)"
                  [attr.aria-label]="'Delete attachment ' + att.original_filename"
                >
                  <mat-icon aria-hidden="true">delete</mat-icon>
                  Delete
                </button>
              }
            </li>
          }
        </ul>

        <!-- Upload -->
        <div class="attachment-upload">
          <input
            #fileInput
            type="file"
            class="visually-hidden"
            [attr.aria-label]="'Choose file to upload to card ' + card().id"
            (change)="onFileChosen($event)"
          />
          <button
            mat-stroked-button
            type="button"
            (click)="triggerFilePicker()"
            [disabled]="attachmentsStore.uploading()"
            [attr.aria-label]="'Attach file to card ' + card().id"
          >
            <mat-icon aria-hidden="true">attach_file</mat-icon>
            Attach file
          </button>
          <span class="muted upload-hint" aria-live="polite">
            Max 5 MB · jpg, png, gif, webp, pdf, txt, md, zip
          </span>
        </div>
      </section>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button
        mat-button
        type="button"
        (click)="edit()"
        aria-label="Edit card"
      >
        <mat-icon aria-hidden="true">edit</mat-icon>
        Edit
      </button>
      @if (card().archived_at) {
        <button
          mat-button
          type="button"
          (click)="restore()"
          aria-label="Restore card"
        >
          <mat-icon aria-hidden="true">unarchive</mat-icon>
          Restore
        </button>
      } @else {
        <button
          mat-button
          type="button"
          (click)="archive()"
          aria-label="Archive card"
        >
          <mat-icon aria-hidden="true">archive</mat-icon>
          Archive
        </button>
      }
      <button
        mat-button
        color="warn"
        type="button"
        (click)="delete()"
        aria-label="Delete card"
      >
        <mat-icon aria-hidden="true">delete</mat-icon>
        Delete
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .card-body { white-space: pre-wrap; }
      .markdown-region :is(h1, h2, h3, h4, h5, h6) {
        margin: 0.75em 0 0.25em;
        font-weight: 600;
      }
      .markdown-region p { margin: 0.5em 0; }
      .markdown-region ul, .markdown-region ol { margin: 0.5em 0; padding-left: 1.5em; }
      .markdown-region code { background: rgba(0,0,0,0.06); padding: 0 0.25em; border-radius: 3px; }
      .markdown-region pre {
        background: rgba(0,0,0,0.06);
        padding: 0.5em;
        border-radius: 3px;
        overflow-x: auto;
      }
      .muted { color: rgba(0,0,0,0.5); }
      .error { color: #b00020; }
      .archived-chip { font-size: 0.85em; color: rgba(0,0,0,0.55); margin-left: 0.5em; }
      .card-due { font-size: 0.9em; color: rgba(0,0,0,0.7); }
      .comments, .attachments { margin-top: 1em; padding-top: 0.75em; border-top: 1px solid rgba(0,0,0,0.08); }
      .comments h3, .attachments h3 { margin: 0 0 0.5em; font-size: 1em; }
      .thread-list, .attachment-list { list-style: none; padding: 0; margin: 0 0 0.75em; }
      .thread-list li + li, .attachment-list li + li { margin-top: 0.5em; }
      .comment {
        background: rgba(0,0,0,0.03);
        border-radius: 4px;
        padding: 0.5em 0.75em;
      }
      .comment-header { display: flex; gap: 0.5em; align-items: baseline; font-size: 0.85em; }
      .author-chip { font-weight: 600; }
      .comment-time { color: rgba(0,0,0,0.55); }
      .edit-window { color: rgba(0,0,0,0.4); font-style: italic; }
      .comment-body { padding: 0.25em 0; white-space: pre-wrap; }
      .comment-edit { width: 100%; box-sizing: border-box; padding: 0.5em; }
      .comment-actions { display: flex; gap: 0.5em; margin-top: 0.25em; }
      .comment-form { margin-top: 0.75em; }
      .comment-new { width: 100%; box-sizing: border-box; padding: 0.5em; }
      .attachment { display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; }
      .filename { font-weight: 500; }
      .filesize, .mimetype { color: rgba(0,0,0,0.55); font-size: 0.85em; }
      .attachment-upload { display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap; }
      .upload-hint { font-size: 0.8em; }
      .visually-hidden {
        position: absolute !important;
        width: 1px; height: 1px;
        padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0,0,0,0);
        white-space: nowrap; border: 0;
      }
    `,
  ],
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': "'card-detail-title'",
  },
})
export class CardDetailDialog implements OnInit {
  private readonly data = inject<CardDetailDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<CardDetailDialog, CardDetailDialogResult>>(MatDialogRef);
  private readonly writeApi = inject(KanbanWriteApi);
  private readonly store = inject(BoardsStore);
  protected readonly commentsStore = inject(CommentsStore);
  protected readonly attachmentsStore = inject(AttachmentsStore);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  private readonly titleRef =
    viewChild<ElementRef<HTMLElement>>('titleRef');
  private readonly newCommentInputRef =
    viewChild<ElementRef<HTMLTextAreaElement>>('newCommentInput');
  private readonly fileInputRef =
    viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly commentEditorRef =
    viewChild<ElementRef<HTMLTextAreaElement>>('commentEditor');

  /**
   * Local copy of the card; mutated on edit/archive/restore. The store
   * updates happen in parallel so other pages see the new resource.
   */
  protected readonly card = computed(() => this.store.currentBoard()
    ? findCardInBoard(this.store.currentBoard()!, this.data.card.id) ?? this.data.card
    : this.data.card);
  protected readonly bodyText = computed(() => this.card().body ?? '(no body)');

  // --- Comment state ---

  /** Body of the "new comment" textarea. Signal-based for OnPush compatibility. */
  protected readonly newCommentBody = signal('');
  protected readonly postingComment = signal(false);
  protected readonly editingCommentId = signal<number | null>(null);
  protected readonly editingDraft = signal('');
  protected readonly savingEdit = signal(false);
  protected readonly confirmingDeleteId = signal<number | null>(null);

  // --- Attachment state ---

  protected readonly confirmingAttachmentDeleteId = signal<number | null>(null);

  constructor() {
    // Effect: when `editingCommentId` flips, focus the inline editor textarea.
    effect(() => {
      const id = this.editingCommentId();
      if (id === null) {
        return;
      }
      queueMicrotask(() => {
        const ref = this.commentEditorRef();
        ref?.nativeElement.focus();
      });
    });
  }

  ngOnInit(): void {
    // Focus the title on open — Material's default focus trap is on the
    // dialog container, so we explicitly move focus to the canonical
    // landmark (the h2) so screen-reader users land at the start of the
    // content.
    queueMicrotask(() => {
      this.titleRef()?.nativeElement.focus();
    });
    // Ensure the store knows about the card even if it wasn't loaded
    // before. Idempotent.
    this.store.applyCardMutation(this.data.card);
    // Load comments + attachments for this card.
    void this.commentsStore.load(
      this.data.projectId,
      this.data.boardId,
      this.data.columnId,
      this.data.card.id,
    );
    void this.attachmentsStore.load(
      this.data.projectId,
      this.data.boardId,
      this.data.columnId,
      this.data.card.id,
    );
  }

  // --- Card actions ---

  protected async edit(): Promise<void> {
    const ref = this.dialog.open<
      CardEditorDialog,
      CardEditorDialogData,
      CardEditorDialogResult
    >(CardEditorDialog, {
      data: {
        mode: 'edit',
        projectId: this.data.projectId,
        boardId: this.data.boardId,
        columnId: this.data.columnId,
        card: this.card(),
      },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (result?.action === 'saved' && result.card) {
      this.ref.close({ action: 'edited', card: result.card });
      return;
    }
  }

  protected async archive(): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.writeApi.archiveCard(
          this.data.projectId,
          this.data.boardId,
          this.data.columnId,
          this.data.card.id,
        ),
      );
      this.store.applyCardMutation(updated);
      this.ref.close({ action: 'archived', card: updated });
    } catch (err) {
      this.surfaceError(err);
    }
  }

  protected async restore(): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.writeApi.restoreCard(
          this.data.projectId,
          this.data.boardId,
          this.data.columnId,
          this.data.card.id,
        ),
      );
      this.store.applyCardMutation(updated);
      this.ref.close({ action: 'restored', card: updated });
    } catch (err) {
      this.surfaceError(err);
    }
  }

  protected async delete(): Promise<void> {
    try {
      await firstValueFrom(
        this.writeApi.deleteCard(
          this.data.projectId,
          this.data.boardId,
          this.data.columnId,
          this.data.card.id,
        ),
      );
      this.store.applyCardRemoved(this.data.card.id);
      this.ref.close({ action: 'deleted' });
    } catch (err) {
      const apiError = err as ApiError | unknown;
      if (apiError && typeof apiError === 'object' && 'kind' in apiError) {
        const typed = apiError as ApiError;
        if (typed.kind === 'conflict') {
          this.openConflictDialog(typed);
          return;
        }
      }
      this.surfaceError(err);
    }
  }

  // --- Comment actions ---

  protected focusNewComment(): void {
    queueMicrotask(() => {
      this.newCommentInputRef()?.nativeElement.focus();
    });
  }

  protected onNewCommentChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.newCommentBody.set(target.value);
  }

  protected async postComment(event: Event): Promise<void> {
    event.preventDefault();
    const body = this.newCommentBody().trim();
    if (!body || this.postingComment()) {
      return;
    }
    this.postingComment.set(true);
    try {
      await this.commentsStore.create(
        this.data.projectId,
        this.data.boardId,
        this.data.columnId,
        this.data.card.id,
        { body },
      );
      this.newCommentBody.set('');
    } catch (err) {
      this.surfaceError(err);
    } finally {
      this.postingComment.set(false);
    }
  }

  protected startEdit(comment: KanbanComment): void {
    this.editingCommentId.set(comment.id);
    this.editingDraft.set(comment.body);
  }

  protected onEditDraftChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.editingDraft.set(target.value);
  }

  protected cancelEdit(): void {
    this.editingCommentId.set(null);
    this.editingDraft.set('');
  }

  protected async saveEdit(comment: KanbanComment): Promise<void> {
    const body = this.editingDraft().trim();
    if (!body || this.savingEdit()) {
      return;
    }
    this.savingEdit.set(true);
    try {
      await this.commentsStore.update(
        this.data.projectId,
        this.data.boardId,
        this.data.columnId,
        this.data.card.id,
        comment.id,
        { body },
      );
      this.cancelEdit();
    } catch (err) {
      // 403 from PATCH /comments/{id} → ErrorNormalizer's URL heuristic
      // resolves to `{ kind: 'forbidden', code: 'edit_window_expired' }`
      // and `toUserMessage` returns the "Edit window expired" copy.
      this.surfaceError(err);
    } finally {
      this.savingEdit.set(false);
    }
  }

  protected startDeleteComment(comment: KanbanComment): void {
    this.confirmingDeleteId.set(comment.id);
  }

  protected cancelDeleteComment(): void {
    this.confirmingDeleteId.set(null);
  }

  protected async confirmDeleteComment(comment: KanbanComment): Promise<void> {
    if (this.confirmingDeleteId() !== comment.id) {
      return;
    }
    try {
      await this.commentsStore.remove(
        this.data.projectId,
        this.data.boardId,
        this.data.columnId,
        this.data.card.id,
        comment.id,
      );
      this.confirmingDeleteId.set(null);
    } catch (err) {
      this.surfaceError(err);
    }
  }

  // --- Attachment actions ---

  protected triggerFilePicker(): void {
    this.fileInputRef()?.nativeElement.click();
  }

  protected async onFileChosen(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    // Clear the input so the same file can be re-selected after a rejection.
    target.value = '';
    if (!file) {
      return;
    }
    const validation = this.attachmentsStore.validate(file);
    if (!validation.ok) {
      this.snackBar.open(validation.reason ?? 'Invalid file.', 'Dismiss', {
        duration: 5000,
      });
      return;
    }
    try {
      await this.attachmentsStore.upload(
        this.data.projectId,
        this.data.boardId,
        this.data.columnId,
        this.data.card.id,
        file,
      );
      this.snackBar.open(`Uploaded ${file.name}`, 'Dismiss', { duration: 3000 });
    } catch (err) {
      this.surfaceError(err);
    }
  }

  protected startDeleteAttachment(att: { id: number; original_filename: string }): void {
    this.confirmingAttachmentDeleteId.set(att.id);
  }

  protected cancelDeleteAttachment(): void {
    this.confirmingAttachmentDeleteId.set(null);
  }

  protected async confirmDeleteAttachment(att: { id: number; original_filename: string }): Promise<void> {
    if (this.confirmingAttachmentDeleteId() !== att.id) {
      return;
    }
    try {
      await this.attachmentsStore.remove(
        this.data.projectId,
        this.data.boardId,
        this.data.columnId,
        this.data.card.id,
        att.id,
      );
      this.confirmingAttachmentDeleteId.set(null);
    } catch (err) {
      this.surfaceError(err);
    }
  }

  // --- Helpers ---

  protected formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  protected commentMessage(error: ApiError | null): string {
    if (!error) {
      return '';
    }
    return ErrorNormalizer.toUserMessage(error);
  }

  /**
   * Open the conflict dialog when the server returns a typed 409. Card
   * delete never returns `column_has_contents` per api-doc §10.3 (only
   * board / column delete can), but we keep the hook wired for forward-
   * compat — if the API contract ever changes, the dialog handles it.
   */
  private openConflictDialog(error: ApiError): void {
    const conflictData: BoardConflictDialogData = {
      entityType: 'column',
      entityName: `column ${this.data.columnId}`,
      navigateTarget: [
        '/modules/kanban/projects',
        String(this.data.projectId),
        'boards',
        String(this.data.boardId),
      ],
      message:
        error.kind === 'conflict' && error.code === 'column_has_contents'
          ? 'This column still has cards. Move or delete them first.'
          : error.kind === 'conflict' && error.code === 'board_has_contents'
            ? 'This board still has columns. Move or delete them first.'
            : 'This action conflicts with the current state.',
    };
    const ref = this.dialog.open<
      BoardConflictDialog,
      BoardConflictDialogData,
      BoardConflictDialogResult
    >(BoardConflictDialog, { data: conflictData });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (result?.action === 'open') {
        void this.router.navigate([...result.navigateTo]);
      }
    });
  }

  private surfaceError(err: unknown): void {
    // The 403 discriminator on `comments/{id}` PATCH/DELETE resolves to
    // `{ kind: 'forbidden', code: 'edit_window_expired' }` and
    // `toUserMessage` returns the locked "Edit window expired" copy.
    const message =
      err && typeof err === 'object' && 'kind' in err
        ? ErrorNormalizer.toUserMessage(err as ApiError)
        : 'Could not perform the action. Please try again.';
    this.snackBar.open(message, 'Dismiss', { duration: 5000 });
  }
}

function findCardInBoard(
  detail: { cardsByColumnId: Readonly<Record<string, readonly KanbanCard[]>> },
  cardId: number,
): KanbanCard | null {
  for (const cards of Object.values(detail.cardsByColumnId)) {
    const found = cards.find((c) => c.id === cardId);
    if (found) {
      return found;
    }
  }
  return null;
}