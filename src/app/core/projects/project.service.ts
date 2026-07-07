import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { catchError, of } from 'rxjs';

import { ProjectsApi } from './projects.api';
import type { Project } from './project.model';

const STORAGE_KEY = 'dm:selectedProjectId';

/**
 * Single source of truth for the active project. Persists the selection to
 * localStorage and revalidates it against the server's project list on
 * bootstrap. Archived/missing ids are silently cleared.
 */
@Service()
export class ProjectService {
  private readonly api = inject(ProjectsApi);

  private readonly _projects = signal<readonly Project[]>([]);
  private readonly _currentId = signal<number | null>(this.readStoredId());
  private readonly _bootstrapped = signal(false);

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
   */
  async bootstrap(): Promise<void> {
    if (this._bootstrapped()) {
      return;
    }

    const projects = await firstValueFrom(
      this.api.list().pipe(
        catchError(() => of([] as Project[])),
      ),
    );

    // Strip archived projects from the visible list (the spec excludes them
    // by default and silently clears the stored id if it points at one).
    const visible = projects.filter((p) => p.archived_at === null);
    this._projects.set(visible);

    const storedId = this._currentId();
    if (storedId !== null) {
      const exists = visible.some((p) => p.id === storedId);
      if (!exists) {
        this._currentId.set(null);
        this.persistId(null);
      }
    }

    this._bootstrapped.set(true);
  }

  private readStoredId(): number | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
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
