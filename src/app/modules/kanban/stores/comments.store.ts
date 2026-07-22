import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import type { ApiError } from '../../../core/errors/api-error';
import type { KanbanComment } from '../models';
import { CommentsApi, type CommentBodyRequest } from '../api/comments.api';

/**
 * How long (in minutes) the server allows comment authors to edit or delete
 * their own comments. Mirrors `kanban.comment_edit_window_minutes` in the
 * backend (api-doc §8.4). 15 minutes is the documented default.
 */
export const COMMENT_EDIT_WINDOW_MINUTES = 15;

export const COMMENT_EDIT_WINDOW_MS =
  COMMENT_EDIT_WINDOW_MINUTES * 60 * 1000;

/**
 * Comments state for the currently open card dialog. Signal-backed,
 * flat-list-per-card. Thread grouping (per api-doc §14) is the consumer's
 * concern — `groupThreads()` is provided as a convenience.
 *
 * `canEdit()` is the only place edit-window logic lives; both the template
 * (button visibility) and the editor (snackbar on 403) read from it. The
 * rule is non-negotiable per api-doc §8.4:
 *
 *     comment.author_id === current_user.id
 *     AND now() - comment.updated_at < 15 minutes
 *
 * If the server's window has drifted from the client's (e.g. config change),
 * the server is the source of truth — `canEdit()` is a hint, not a guarantee.
 * The 403 → "Edit window expired" snackbar still fires if the client let the
 * user click but the server rejected.
 */
@Service()
export class CommentsStore {
  private readonly api = inject(CommentsApi);
  private readonly auth = inject(AuthService);

  private readonly _comments = signal<readonly KanbanComment[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<ApiError | null>(null);
  /** Updates every 30s so `canEdit()` recomputes as the window closes. */
  private readonly _tick = signal(Date.now());

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
        'CommentsStore: taskId is not set. Call setTaskId(taskId) before triggering API calls.',
      );
    }
    return this._taskId;
  }

  readonly comments = this._comments.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  /** Sorted by `created_at` ASC for stable thread rendering. */
  readonly sorted = computed(() =>
    [...this._comments()].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ),
  );

  constructor() {
    if (typeof window !== 'undefined') {
      window.setInterval(() => this._tick.set(Date.now()), 30_000);
    }
  }

  /** Current `Date.now()` value — exposed so the dialog can avoid `new Date()` in templates. */
  readonly now = computed(() => this._tick());

  /**
   * Edit-window guard for a single comment. Returns true ONLY when both
   * conditions hold:
   *   1. The current user is the author.
   *   2. `now() - comment.updated_at < COMMENT_EDIT_WINDOW_MS`.
   *
   * This is the SAME predicate the server enforces (api-doc §8.4). When the
   * predicate disagrees with the server (clock drift, etc.), the 403 response
   * from PATCH/DELETE surfaces as the "Edit window expired" snackbar.
   */
  canEdit(comment: KanbanComment): boolean {
    const user = this.auth.user();
    if (!user) {
      return false;
    }
    if (String(user.id) !== String(comment.author_id)) {
      return false;
    }
    const updatedMs = new Date(comment.updated_at).getTime();
    if (!Number.isFinite(updatedMs)) {
      return false;
    }
    return this._tick() - updatedMs < COMMENT_EDIT_WINDOW_MS;
  }

  /**
   * Convenience: group flat comments into thread buckets by author chain.
   * A "thread" is a top-level comment (parent_id === null) plus all
   * same-author replies (parent_id pointing back into the thread). See
   * api-doc §14 for the full thread-per-author semantics.
   */
  readonly threads = computed(() => groupThreads(this.sorted()));

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
        this.api.listComments(projectId, taskId, boardId, columnId, cardId),
      );
      this._comments.set(list);
    } catch (err) {
      this._error.set((err as ApiError) ?? null);
    } finally {
      this._loading.set(false);
    }
  }

  async create(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    body: CommentBodyRequest,
  ): Promise<KanbanComment> {
    const taskId = this.taskId;
    const created = await firstValueFrom(
      this.api.createComment(projectId, taskId, boardId, columnId, cardId, body),
    );
    this._comments.update((list) => [...list, created]);
    return created;
  }

  async update(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    commentId: number,
    body: CommentBodyRequest,
  ): Promise<KanbanComment> {
    const taskId = this.taskId;
    const updated = await firstValueFrom(
      this.api.updateComment(
        projectId,
        taskId,
        boardId,
        columnId,
        cardId,
        commentId,
        body,
      ),
    );
    this._comments.update((list) =>
      list.map((c) => (c.id === updated.id ? updated : c)),
    );
    return updated;
  }

  async remove(
    projectId: number,
    boardId: number,
    columnId: number,
    cardId: number,
    commentId: number,
  ): Promise<void> {
    const taskId = this.taskId;
    await firstValueFrom(
      this.api.deleteComment(projectId, taskId, boardId, columnId, cardId, commentId),
    );
    this._comments.update((list) => list.filter((c) => c.id !== commentId));
  }

  reset(): void {
    this._comments.set([]);
    this._error.set(null);
    this._loading.set(false);
  }
}

/**
 * Group flat comments into thread buckets. Each top-level comment
 * (`parent_id === null`) starts a new thread; same-author replies attach
 * to the most-recent comment by the same author in the thread. Different-
 * author replies always start a new thread (api-doc §14).
 *
 * Returns threads in the order their root comments appear in the input.
 */
function groupThreads(comments: readonly KanbanComment[]): readonly (readonly KanbanComment[])[] {
  const buckets: KanbanComment[][] = [];
  for (const c of comments) {
    if (c.parent_id === null) {
      buckets.push([c]);
      continue;
    }
    // Find the most recent thread whose last entry shares the same author.
    // api-doc §14: cross-author parent_id is rejected with 422, so when
    // parent_id is set the parent MUST be in some earlier thread.
    let attached = false;
    for (let i = buckets.length - 1; i >= 0; i--) {
      const thread = buckets[i];
      if (!thread) {
        continue;
      }
      const last = thread[thread.length - 1];
      if (last && String(last.author_id) === String(c.author_id)) {
        thread.push(c);
        attached = true;
        break;
      }
    }
    if (!attached) {
      // Orphan reply (no preceding same-author comment) — start a new bucket.
      // The server enforces the same-author constraint, so this branch is
      // defensive only.
      buckets.push([c]);
    }
  }
  return buckets;
}