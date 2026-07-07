import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ProjectsApi } from './projects.api';
import { ErrorNormalizer } from '../errors/error-normalizer';
import type { ApiError } from '../errors/api-error';
import type { Project } from './project.model';

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

  private readonly _projects = signal<readonly Project[]>([]);
  private readonly _currentId = signal<number | null>(this.readStoredId());
  private readonly _bootstrapped = signal(false);
  private readonly _bootstrapError = signal<ApiError | null>(null);

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
   * Update the active project AND persist to localStorage. Setting `null`
   * clears the persisted value.
   */
  setActive(project: Project | null): void {
    const id = project?.id ?? null;
    this._currentId.set(id);
    this.persistId(id);
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