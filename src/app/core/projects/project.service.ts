import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ProjectsApi } from './projects.api';
import { ErrorNormalizer } from '../errors/error-normalizer';
import type { ApiError } from '../errors/api-error';
import type { Project, ProjectPatch } from './project.model';
import { TasksService } from '../tasks/tasks.service';

const STORAGE_KEY = 'dev-manager-desk:project:selected';
const LEGACY_STORAGE_KEY = 'dm:selectedProjectId';

/**
 * Single source of truth for the active project. Persists the selection to
 * localStorage and revalidates it against the server's project list on
 * bootstrap. Archived/missing ids are silently cleared.
 *
 * ## Bootstrap contract (spec `project-selection` F3 + scenario 4)
 *
 * Three outcomes, distinguished:
 * 1. Fetch succeeds AND stored id is in response → keep it (set `current`).
 * 2. Fetch succeeds AND stored id is NOT in response → clear localStorage
 *    + signal `null` (server confirms the project is gone).
 * 3. Fetch FAILS (network, 5xx, timeout) → preserve stored id + surface a
 *    non-blocking warning via `bootstrapError()`. The user is NOT logged
 *    out of their project by a transient network blip.
 */
@Service()
export class ProjectService {
  private readonly api = inject(ProjectsApi);
  /**
   * S4 (kanban-per-task): after the active project changes (e.g. a
   * freshly-created project becomes active), the active task may now
   * belong to a DIFFERENT project than the one the user was just
   * browsing. {@link TasksService.bootstrap} refreshes the task list
   * for the new project and clears a stale selection in one pass —
   * keeping `ProjectService` as the single source of truth for the
   * "which project am I on" question.
   */
  private readonly tasks = inject(TasksService);

  private readonly _projects = signal<readonly Project[]>([]);
  private readonly _currentId = signal<number | null>(this.readStoredId());
  private readonly _bootstrapped = signal(false);
  private readonly _bootstrapError = signal<ApiError | null>(null);
  private readonly _includeArchived = signal(false);

  readonly projects = this._projects.asReadonly();
  readonly currentId = this._currentId.asReadonly();
  readonly current = computed<Project | null>(() => {
    const id = this._currentId();
    if (id === null) {
      return null;
    }
    return this._projects().find((p) => p.id === id) ?? null;
  });
  readonly isBootstrapped = computed(() => this._bootstrapped());
  readonly bootstrapError = this._bootstrapError.asReadonly();
  /**
   * True when the user has toggled "Show archived" on the projects page.
   * The visible list contains archived projects when this flag is on;
   * the page layer derives `visibleProjects` from this signal.
   */
  readonly includeArchived = this._includeArchived.asReadonly();

  /**
   * Update the active project AND persist to localStorage. Setting `null`
   * clears the persisted value.
   */
  setActive(project: Project | null): void {
    const id = project?.id ?? null;
    this._currentId.set(id);
    this.persistId(id);
  }

  /**
   * Create a new project via the API, prepend it to the visible list, and
   * set it as the active project. Callers (typically the create-project
   * dialog) should `await` the promise to learn when the API call has
   * resolved; on rejection the list and active selection are unchanged so
   * the user can retry from the same context.
   *
   * S4 (kanban-per-task): once the new project is active, revalidate
   * the active task via {@link TasksService.bootstrap} so a task
   * belonging to the previous project is cleared, and the task list
   * for the new project starts empty until the user opens the tasks
   * module. We do this fire-and-forget — the create response is
   * already in the caller's hands by the time we kick off the task
   * revalidation, and a task-list failure must not roll back a
   * successful project create.
   */
  async create(input: { name: string; description?: string | null }): Promise<Project> {
    const project = await firstValueFrom(this.api.create(input));
    this._projects.update((list) => [project, ...list]);
    this.setActive(project);
    void this.tasks.bootstrap(project.id);
    return project;
  }

  /**
   * Patch a project. Optimistic merge into the visible list; on success
   * the row is replaced with the server response (server-truth). On 404
   * the row is removed (cross-owner or already deleted). On any other
   * error the optimistic change is rolled back and the error is rethrown
   * so the page can surface it via snackbar.
   */
  async update(id: number, patch: ProjectPatch): Promise<Project> {
    const snapshot = this._projects();
    this._projects.update((list) =>
      list.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

    try {
      const updated = await firstValueFrom(this.api.update(id, patch));
      this._projects.update((list) =>
        list.map((p) => (p.id === id ? updated : p)),
      );
      return updated;
    } catch (err) {
      const status = httpStatus(err);
      if (status === 404) {
        // Project no longer exists (cross-owner or already deleted) —
        // remove from list silently; page layer will reconcile.
        this._projects.update((list) => list.filter((p) => p.id !== id));
        throw err;
      }
      // Roll back optimistic merge for everything else.
      this._projects.set(snapshot);
      throw err;
    }
  }

  /**
   * Archive a project. Optimistically removes the row from the visible
   * list; on error rolls back. The returned `Project` carries the new
   * `archived_at` so callers can drive an "Undo" snackbar.
   */
  async archive(id: number): Promise<Project> {
    const snapshot = this._projects();
    this._projects.update((list) => list.filter((p) => p.id !== id));

    try {
      return await firstValueFrom(this.api.archive(id));
    } catch (err) {
      this._projects.set(snapshot);
      throw err;
    }
  }

  /**
   * Unarchive a project. No optimistic mutation — the project is hidden
   * in the default view (where the user toggled Unarchive from the
   * "Show archived" view), so an in-place update would be invisible. On
   * success the server-truth `Project` is reinserted at the head so it
   * appears when the user toggles "Show archived" off.
   */
  async unarchive(id: number): Promise<Project> {
    const updated = await firstValueFrom(this.api.unarchive(id));
    this._projects.update((list) => {
      const filtered = list.filter((p) => p.id !== id);
      return [updated, ...filtered];
    });
    return updated;
  }

  /**
   * Hard-delete a project. NO optimistic removal — REQ-4.4 forbids losing
   * data on a failed delete. On 204 the row is removed; if the deleted
   * project was the active one, the localStorage key + signal are cleared
   * (the toolbar cannot show a deleted project).
   */
  async delete(id: number): Promise<void> {
    await firstValueFrom(this.api.delete(id));
    this._projects.update((list) => list.filter((p) => p.id !== id));
    if (this._currentId() === id) {
      this.setActive(null);
    }
  }

  /**
   * Flip the `includeArchived` flag and re-fetch the list. When the flag
   * is on, the backend returns both active and archived projects; the
   * page layer is responsible for rendering them with an "Archived"
   * badge. Honors the bootstrap contract: if the stored id is still
   * present in the response, keep it; otherwise clear localStorage +
   * signal.
   *
   * Failures DO NOT throw — they surface via `bootstrapError()` so the
   * page can show a non-blocking snackbar while keeping the previous
   * list intact.
   */
  async toggleArchived(): Promise<void> {
    const next = !this._includeArchived();
    this._includeArchived.set(next);

    const storedId = this._currentId();

    try {
      const projects = await firstValueFrom(this.api.list(next));
      this._projects.set(projects);

      if (storedId !== null) {
        const exists = projects.some((p) => p.id === storedId);
        if (!exists) {
          this._currentId.set(null);
          this.persistId(null);
        }
      }
      this._bootstrapError.set(null);
    } catch (err) {
      this._bootstrapError.set(toApiError(err));
    }
  }

  /**
   * Hydrate the project list from the server and revalidate the stored id.
   * Must be called inside an injection context (constructor or
   * `runInInjectionContext`) so `inject()` resolves.
   *
   * Network failures DO NOT clear the stored id — the user keeps their
   * last-known selection and `bootstrapError()` is set so the toolbar can
   * show a non-blocking "Last known project (offline)" indicator.
   */
  async bootstrap(): Promise<void> {
    if (this._bootstrapped()) {
      return;
    }

    const storedId = this._currentId();

    try {
      const projects = await firstValueFrom(this.api.list());

      // Strip archived projects from the visible list (the spec excludes
      // them by default and silently clears the stored id if it points at
      // one).
      const visible = projects.filter((p) => p.archived_at === null);
      this._projects.set(visible);

      if (storedId !== null) {
        const exists = visible.some((p) => p.id === storedId);
        if (!exists) {
          this._currentId.set(null);
          this.persistId(null);
        }
      }

      this._bootstrapError.set(null);
    } catch (err) {
      // Network / 5xx / timeout — preserve the stored id (if any) and the
      // last-known projects list. The UI can render `bootstrapError()` as
      // a non-blocking snackbar.
      this._bootstrapError.set(toApiError(err));
    }

    this._bootstrapped.set(true);
  }

  private readStoredId(): number | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    // One-time migration: read the legacy short key, write it to the new
    // spec-mandated key, and delete the old one. Avoids logging users out
    // after the upgrade.
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy !== null) {
      try {
        window.localStorage.setItem(STORAGE_KEY, legacy);
      } catch {
        // Storage unavailable; ignore — fall through to read new key.
      }
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private persistId(id: number | null): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      if (id === null) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, String(id));
      }
    } catch {
      // Storage may be unavailable (private mode, quota). In-memory state
      // still works for the current session.
    }
  }
}

/**
 * Narrow whatever the API layer threw into an ApiError. `ProjectsApi.list`
 * lets `HttpErrorResponse` bubble up; route it through `ErrorNormalizer`
 * so the full status matrix (network vs 5xx vs 401, etc.) is honored.
 * Anything non-`HttpErrorResponse` is wrapped as a network error.
 */
function toApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'kind' in err) {
    return err as ApiError;
  }
  if (err && typeof err === 'object' && 'status' in err && 'statusText' in err) {
    // HttpErrorResponse — preserve URL-based discriminator context for 403
    // (project-selection never issues a comment PATCH/DELETE, so this only
    // ever maps to the generic forbidden branch — but we still want the
    // right `kind` for 5xx/401/etc.).
    return ErrorNormalizer.fromHttpErrorResponse(err as never);
  }
  return {
    kind: 'network',
    status: 0,
    message:
      err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
        ? ((err as { message: string }).message)
        : 'Could not reach the server. Check your connection and try again.',
  };
}

/**
 * Extract the HTTP status from whatever the API layer threw. Returns
 * `null` for non-HTTP errors (network failures, generic JS errors).
 * Used by mutation handlers to discriminate 404 from generic failures
 * without leaking the full `HttpErrorResponse` shape into the service.
 */
function httpStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === 'number') {
      return status;
    }
  }
  return null;
}