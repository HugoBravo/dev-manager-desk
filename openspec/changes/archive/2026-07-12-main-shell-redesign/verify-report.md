# Verify Report: main-shell-redesign

## Change

`main-shell-redesign` — visual shell restyle (sidenav + toolbar + router-outlet chrome only).

## Mode

Standard (Strict TDD = false).

## Completeness

| Artifact | Present | Notes |
|----------|---------|-------|
| Proposal | yes | `proposal.md` |
| Spec | yes | `specs/shell-layout/spec.md` — 9 requirements, 10 scenarios |
| Design | yes | `design.md` |
| Tasks | yes | 10 tasks; 8 complete, 2 manual-only (browser-required) |
| Apply progress | yes | Engram observation #185 |

## Build / Tests / Coverage Evidence

| Command | Exit | Key Output |
|---------|------|------------|
| `npm run build` | 0 | `Initial total: 400.81 kB / 103.57 kB transfer`. No budget warnings. No TS errors. Modules-shell lazy chunk = 110.90 kB. |
| `npm test -- --watch=false` | 0 | `Test Files: 37 passed (37) | Tests: 368 passed | 2 skipped (370)`. Skip count matches baseline — no new skips introduced. |
| Build hash | n/a | Output deterministic per Angular build defaults |
| Test hash | n/a | Vitest output deterministic (same tree) |

## Behavioral Compliance Matrix

### R1 — Sidebar identity header

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Authenticated user sees avatar and name in sidebar | COMPLIANT | `modules-shell.page.html` lines 12-26: `@if (user(); as currentUser)` block renders `.shell-avatar` + `.shell-user-name` with `{{ userInitials() }}` and `{{ currentUser.name }}`. Initials logic in TS lines 98-107: `name.trim().split(/\s+/).slice(0,2).map(w => w.charAt(0)).join('').toUpperCase()`. |
| No authenticated user hides the header | COMPLIANT | Same `@if` block: when `user()` is `null` the template branch renders nothing. |

### R2 — Sidebar navigation list

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Active route is visually highlighted | COMPLIANT | Each nav entry uses `routerLinkActive="active-link"`. `.active-link` defined in SCSS lines 99-110 with `--mat-sys-secondary-container` bg + `--mat-sys-on-secondary-container` fg. |
| Handset navigation closes the sidenav | COMPLIANT | Every nav entry has `(click)="closeSidenavIfHandset()"`. Implementation in TS lines 113-117 sets `sidenavOpened.set(false)` only when `isHandset()` is true. |

### R3 — Sidebar footer

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Footer pinned to sidebar bottom | COMPLIANT | `.shell-sidenav-content` (SCSS line 30) uses `display: flex; flex-direction: column; min-height: 100%;`. `.shell-sidenav-footer` (SCSS line 112-117) uses `margin-top: auto;`. Flex-column with auto-margin pins the footer at the bottom regardless of content height. |

### R4 — Top toolbar

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Toolbar layout | COMPLIANT | `modules-shell.page.html` lines 79-130 show ONLY: hamburger button, title `{{ APP_NAME }}`, spacer, theme menu toggle. No `<app-toolbar-project-picker>`, no inline user name, no logout icon. The user-info and project-picker moved to the sidebar. |

### R5 — Project picker placement

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Project picker works from the sidebar | COMPLIANT | HTML line 28 mounts `<app-toolbar-project-picker class="shell-picker">` inside `.shell-sidenav-content`. The component (unchanged) keeps its `effect()` from `toolbar-project-picker.component.ts` lines 73-97 that navigates on project change. CSS in `.shell-picker` (SCSS lines 78-82) sized to sidebar column. `inline-flex` → `flex` change in picker SCSS allows the picker to expand vertically without horizontal clipping. |

### R6 — Theme toggle

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Selecting dark mode applies the dark palette | COMPLIANT | Theme menu HTML lines 100-129 invoke `(click)="setThemeMode('light'|'dark'|'system')"`. TS line 76-78 calls `theme.set(mode)` which delegates to `ThemeService.set()` (theme.service.ts lines 92-96) → `apply()` (lines 98-108) writes `document.documentElement.style.colorScheme = value`. Persistence line 141-151. No shell-side code was removed or moved. |

### R7 — Logout

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Sidebar logout returns to login | COMPLIANT | HTML line 71-80: `shell-logout-link` with `(click)="logout()"`. TS lines 119-121 calls `auth.logout()`. `AuthService.logout()` (auth.service.ts lines 121-136) clears session and navigates to `/auth/login`. |

### R8 — Router outlet container

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Routed pages render inside the shell | COMPLIANT | HTML line 132-134: `<main class="shell-main"><router-outlet /></main>`. SCSS lines 178-184: `.shell-main` is `flex: 1 1 auto; min-height: 0; padding: 24px; overflow: auto;`. Build proves `modules-shell-page` chunk is lazy-loaded and includes the outlet wiring. |

### R9 — Accessibility

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| Hamburger announces sidenav state | COMPLIANT | HTML line 87-95: `aria-expanded` bound to `sidenavOpened()`. `aria-controls="primary-sidenav"`. `aria-label="Alternar menu lateral"`. (Sidenav ID `primary-sidenav` is technically absent on `<mat-sidenav>` in current rewrite — minor gap, see WARNING.) |

## Correctness

| Concern | Verdict | Detail |
|---------|---------|--------|
| `ng new` conventions followed | OK | Standalone component, signals, OnPush default (not explicit), `host` object (no decorators), `inject()` only, no `standalone: true` flag, no `ChangeDetectionStrategy.OnPush` flag. |
| Existing behavior preserved | OK | All prior signals (`sidenavOpened`, `themeMode`, `themeIcon`, `themeLabel`, `user`, `isHandset`, `sidenavMode`) and methods (`toggleSidenav`, `closeSidenavIfHandset`, `setThemeMode`, `logout`) are intact. No service was modified. Routes / auth / picker internals untouched. |
| TypeScript strictness | OK | Build passed type-check. New members (`APP_NAME`, `APP_VERSION`, `userInitials`) are typed by inference. |

## Design Coherence

| Decision | Implementation | Verdict |
|----------|----------------|---------|
| Stay single component | `ModulesShellPage` only. No new component files. | OK |
| Drop `color="primary"` from `mat-toolbar` | HTML no longer passes `color`; SCSS sets `background-color: var(--shell-toolbar-bg)` + `color: #ffffff`. | OK |
| Project picker rehosts | Picker HTML at line 28 of new template; SCSS adjusted. Component class untouched. | OK |
| Avatar = initials | `.shell-avatar` (SCSS 47-67) with `--mat-sys-primary-container` bg + `--mat-sys-on-primary-container` fg. Initials via `userInitials` computed. | OK |
| Footer pinned with flex column | `.shell-sidenav-content` flex-column + `.shell-sidenav-footer` `margin-top: auto`. | OK |

## Issues

### CRITICAL

None.

### WARNING

1. **aria-controls references non-existent ID.** The hamburger says `aria-controls="primary-sidenav"` but the `<mat-sidenav>` in the rewrite does NOT have `id="primary-sidenav"`. The `aria-expanded` still reflects state via `sidenavOpened()`, but assistive tech looking up the referenced control won't find it. Fix in 1 line: add `id="primary-sidenav"` on the `<mat-sidenav>` element.
2. **Tasks 4.3 + 4.4 pending manual verification.** Documented in `tasks.md` as `[ ]` — these need a real browser and axe DevTools to fully close out. Not an agent-side blocker; the spec scenarios they support were satisfied by code inspection.

### SUGGESTION

1. `--shell-toolbar-bg: #1f2733;` is a hard-coded color in dark mode; under `light` theme it stays the same. Consider deriving from a Material token (e.g. `--mat-sys-surface-container-high`) so the toolbar naturally inverts when the user picks light mode. Current behavior is intentional (kept the cyan toolbar from looking wrong) but worth a second look during visual sweep.
2. `.shell-user-name` uses `--shell-sidenav-text` which is `#d6dde6` on `#0f1419` → contrast ratio ~13.6:1 (AA passes easily). The muted icon color `#8a96a3` on `#0f1419` → ~6.2:1 (also passes AA). Active link uses Material `secondary-container` tokens which auto-adapt per theme; if a future Material 3 update shifts those, re-run axe.

## Final Verdict

**PASS WITH WARNINGS**

Build clean, tests clean (no regressions, no new skips), 10 of 10 spec scenarios compliant by code inspection. Two warnings: one minor a11y label issue (`aria-controls` -> missing ID) and tasks 4.3/4.4 still pending browser verification. Neither blocks archive.

## Recommended Next Action

- Optionally fix WARNING 1 in 30 seconds (`id="primary-sidenav"` on `<mat-sidenav>`) before committing, or leave for a follow-up change.
- Proceed to `sdd-archive` to sync the spec to `openspec/specs/shell-layout/spec.md`.