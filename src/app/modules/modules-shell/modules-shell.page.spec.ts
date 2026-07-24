import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { API_CONFIG } from '../../core/config/api-config';
import { ModulesShellPage } from './modules-shell.page';

const API_BASE_URL = 'http://localhost:8000/api';

describe('ModulesShellPage', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeAll(() => {
    // jsdom declares `window.matchMedia` as `undefined` but the `in`
    // operator returns `true`. The theme service falls through to call
    // it and crashes. Stub a no-op matcher up front for all specs in
    // this file.
    originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia,
    });
  });

  afterAll(() => {
    if (originalMatchMedia === undefined) {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    } else {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ModulesShellPage, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      ],
    }).compileComponents();
  });

  afterEach(() => window.localStorage.clear());

  function createShell(): ReturnType<typeof TestBed.createComponent<ModulesShellPage>> {
    const fixture = TestBed.createComponent(ModulesShellPage);
    fixture.detectChanges();
    return fixture;
  }

  describe('sidebar nav labels (uppercase requirement)', () => {
    it('renders PROJECTS, TASKS, SECRETS, USERS, and CERRAR as uppercase literal text', () => {
      const fixture = createShell();
      const host = fixture.nativeElement as HTMLElement;
      const visibleLabels = Array.from(
        host.querySelectorAll('a[mat-list-item] span[matlistitemtitle], a.mat-mdc-list-item span'),
      )
        .map((el) => (el.textContent ?? '').trim())
        .filter((text) => text.length > 0);

      expect(visibleLabels).toEqual(
        expect.arrayContaining(['PROJECTS', 'TASKS', 'SECRETS', 'USERS', 'CERRAR']),
      );
      // The lowercase variants from the prior implementation must NOT
      // appear — labels are now literal uppercase strings (no CSS
      // text-transform dependency).
      expect(visibleLabels).not.toEqual(
        expect.arrayContaining(['Projects', 'Tasks', 'Secrets', 'Users']),
      );
    });

    it('does not render a Kanban navigation link or visible KANBAN label', () => {
      const fixture = createShell();
      const host = fixture.nativeElement as HTMLElement;
      const visibleLabels = Array.from(
        host.querySelectorAll('a[mat-list-item] span[matlistitemtitle], a.mat-mdc-list-item span'),
      ).map((el) => (el.textContent ?? '').trim());

      expect(host.querySelector('a[routerLink="kanban"]')).toBeNull();
      expect(visibleLabels).not.toContain('KANBAN');
    });

    it('exposes sentence-case aria-label values on every nav link (not the uppercase visual text)', () => {
      const fixture = createShell();
      const host = fixture.nativeElement as HTMLElement;
      const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('a[mat-list-item]'));
      // Skip the logout button (it carries the explicit `aria-label="Cerrar sesion"`).
      const navLinks = links.filter((a) => a.hasAttribute('routerLink'));
      expect(navLinks.length).toBeGreaterThanOrEqual(3);
      for (const link of navLinks) {
        const aria = (link.getAttribute('aria-label') ?? '').trim();
        expect(aria.length).toBeGreaterThan(0);
        // aria-label should NOT be uppercase — screen readers should
        // speak "Projects", not shout "PROJECTS". The visible text in
        // the template is uppercase; the accessible name stays
        // sentence-case.
        expect(aria).not.toBe(aria.toUpperCase());
      }
    });

    it('keeps the logout button accessible name localized (Cerrar sesion)', () => {
      const fixture = createShell();
      const host = fixture.nativeElement as HTMLElement;
      const logout = host.querySelector<HTMLButtonElement>('.shell-logout-link');
      expect(logout).not.toBeNull();
      expect(logout?.getAttribute('aria-label')).toBe('Cerrar sesion');
      // Visual label is still the literal "CERRAR" string.
      expect(logout?.textContent ?? '').toContain('CERRAR');
    });
  });

  describe('sidebar feature link wiring', () => {
    it('wires each feature nav anchor with the matching routerLink segment', () => {
      const fixture = createShell();
      const host = fixture.nativeElement as HTMLElement;
      const routerLinks = Array.from(
        host.querySelectorAll<HTMLAnchorElement>('a[mat-list-item][routerLink]'),
      ).map((a) => a.getAttribute('routerLink') ?? '');
      expect(routerLinks).toEqual(['projects', 'tasks', 'secrets', 'users']);
    });

    it('anchors are NOT rendered as <button> with manual handlers (router contract)', () => {
      // Anchor (link) semantics with routerLink directive is the
      // contract we promised — clicking PROJECTS must use the router,
      // not a hand-rolled click handler that bypasses navigation.
      const fixture = createShell();
      const host = fixture.nativeElement as HTMLElement;
      for (const segment of ['projects', 'tasks', 'secrets', 'users']) {
        const link = Array.from(host.querySelectorAll<HTMLAnchorElement>('a[mat-list-item]')).find(
          (a) => (a.getAttribute('routerLink') ?? '') === segment,
        );
        expect(link).toBeDefined();
        expect(link!.tagName).toBe('A');
        expect(link?.getAttribute('ariaCurrentWhenActive')).toBe('page');
      }
    });

    // Per-feature click-then-router-navigate tests live in
    // toolbar-project-picker.component.spec.ts (where the router is
    // available with a real route config). Mounting `ModulesShellPage`
    // here via `TestBed.createComponent` does NOT register the parent
    // `/modules` route in the router's tree, so the `RouterLink`
    // directive cannot resolve hrefs and the click → navigate path
    // fails with NG04002. The wiring above — `routerLink` attribute +
    // `<a>` semantics + `ariaCurrentWhenActive` — is the part of the
    // contract this spec owns.
  });

  describe('sidebar collapse / expand', () => {
    it('toggles sidebarCollapsed via the toggle button (aria-expanded mirrors state)', () => {
      const fixture = createShell();
      const host = fixture.nativeElement as HTMLElement;
      const toggle = host.querySelector<HTMLButtonElement>('.shell-sidebar-toggle');
      expect(toggle).not.toBeNull();
      expect(toggle?.getAttribute('aria-expanded')).toBe('true');

      toggle?.click();
      fixture.detectChanges();

      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
      const aside = host.querySelector<HTMLElement>('.shell-sidebar');
      expect(aside?.classList.contains('collapsed')).toBe(true);
    });
  });

  describe('theme menu (sanity)', () => {
    it('renders a theme toggle button with an accessible label', () => {
      const fixture = createShell();
      const host = fixture.nativeElement as HTMLElement;
      const theme = host.querySelector<HTMLButtonElement>('.shell-theme');
      expect(theme).not.toBeNull();
      expect(theme?.getAttribute('aria-label') ?? '').toMatch(/Cambiar tema/);
    });
  });
});
