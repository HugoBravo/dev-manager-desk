import { DestroyRef, Service, computed, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'dev-manager-desk:theme';

const QUERY = '(prefers-color-scheme: dark)';

/**
 * Source of truth for the application theme. Persists the user's choice to
 * localStorage and, when the choice is `system`, mirrors the OS-level
 * `prefers-color-scheme` media query.
 *
 * ## How the dark variant actually flips
 *
 * The Material theme is compiled with `theme-type: color-scheme`, which emits
 * CSS variables using the native `light-dark(light, dark)` function. That
 * function reads the `color-scheme` property from the element where the
 * variable is declared. So toggling is just setting `color-scheme: light |
 * dark | light dark` on `<html>` at runtime — no recompile, no class swap.
 *
 * ## Why not a `.dark` class on `<html>`?
 *
 * We could, but `light-dark()` is the modern, cascade-friendly way: every
 * Material token resolves itself from CSS, the cascade handles nested
 * `color-scheme` overrides for free, and there's exactly one property to
 * reconcile.
 */
@Service()
export class ThemeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly mediaQuery: MediaQueryList | null =
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(QUERY)
      : null;

  private readonly _mode = signal<ThemeMode>(this.readStoredMode());

  readonly mode = this._mode.asReadonly();

  /**
   * Resolved color-scheme property value to apply to `<html>`. `system`
   * resolves to the current OS preference; the explicit modes resolve to
   * themselves.
   */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const mode = this._mode();
    if (mode === 'system') {
      return this.systemPreference();
    }
    return mode;
  });

  /**
   * OS-level preference. Tracked as a signal so `resolved()` recomputes when
   * the user changes their system theme while the tab is open AND the active
   * mode is `system`.
   */
  private readonly systemPreference = signal<'light' | 'dark'>(
    this.readSystemPreference(),
  );

  constructor() {
    this.apply(this.resolved());
    this.destroyRef.onDestroy(() => this.detachMediaListener());

    // Track OS-level changes only while the user is on `system`. When they
    // pick `light` or `dark` explicitly we ignore the media query entirely.
    if (this.mediaQuery !== null) {
      this.mediaQuery.addEventListener('change', this.onSystemChange);
    }
  }

  /**
   * Cycle the mode: `system` → `light` → `dark` → `system`. Used by the
   * toolbar toggle button.
   */
  cycle(): void {
    const next: ThemeMode =
      this._mode() === 'system'
        ? 'light'
        : this._mode() === 'light'
          ? 'dark'
          : 'system';
    this.set(next);
  }

  /**
   * Set the mode explicitly and persist it. The resolved value is applied
   * to `<html>` immediately.
   */
  set(mode: ThemeMode): void {
    this._mode.set(mode);
    this.persist(mode);
    this.apply(this.resolved());
  }

  private apply(value: 'light' | 'dark'): void {
    if (typeof document === 'undefined') {
      return;
    }
    // `light dark` keeps both palettes in scope (so `light-dark()` keeps
    // resolving) but biases the form controls, scrollbars, and the default
    // `<input>` colors toward the active variant. Setting only `light` or
    // `dark` would force the opposite UA defaults to be discarded, which
    // we want to avoid — `light-dark()` still works the same either way.
    document.documentElement.style.colorScheme = value;
  }

  private onSystemChange = (event: MediaQueryListEvent): void => {
    this.systemPreference.set(event.matches ? 'dark' : 'light');
    if (this._mode() === 'system') {
      this.apply(this.resolved());
    }
  };

  private detachMediaListener(): void {
    if (this.mediaQuery !== null) {
      this.mediaQuery.removeEventListener('change', this.onSystemChange);
    }
  }

  private readStoredMode(): ThemeMode {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 'system';
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
    return 'system';
  }

  private readSystemPreference(): 'light' | 'dark' {
    if (this.mediaQuery === null) {
      return 'light';
    }
    return this.mediaQuery.matches ? 'dark' : 'light';
  }

  private persist(mode: ThemeMode): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage may be unavailable (private mode, quota). In-memory state
      // still works for the current session.
    }
  }
}
