# Tasks: main-shell-redesign

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~220 (HTML +80, SCSS +90, TS +20, picker SCSS ±5) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Repaint shell + relocate picker | PR 1 | `npm run build` + manual axe DevTools sweep | `npm start` then visit `/modules/kanban` and `/modules/projects` | `git revert` of the single commit restores the previous shell |

## Phase 1: Component members

- [x] 1.1 Add `APP_NAME = 'Dev Manager Desk'` and `APP_VERSION = '0.0.0'` constants to `ModulesShellPage` (`src/app/modules/modules-shell/modules-shell.page.ts`).
- [x] 1.2 Add `userInitials` `computed()` deriving up to 2 capitals from `user().name`; fallback to empty string when no user.

## Phase 2: Template repaint

- [x] 2.1 In `modules-shell.page.html`, restructure the sidenav: avatar header (`@if (user()) { ... }`) + `<app-toolbar-project-picker>` + `<mat-nav-list>` + footer (`{{ APP_NAME }}` / `v{{ APP_VERSION }}`).
- [x] 2.2 In the same file, repaint the toolbar: keep hamburger, title (`{{ APP_NAME }}`), and theme menu; remove inline user name + logout icon (logout stays in sidebar).
- [x] 2.3 Keep `<router-outlet />` inside `<main class="shell-main">` untouched.

## Phase 3: Styles

- [x] 3.1 In `modules-shell.page.scss`, replace sidebar bg with `--mat-sys-surface-container`, add `--shell-toolbar-bg: #1f2733;` (or resolved neutral token), apply to toolbar, drop any cyan-specific overrides.
- [x] 3.2 Add `.shell-sidenav-content { display: flex; flex-direction: column; }` + `.shell-sidenav-footer { margin-top: auto; }` to pin the footer.
- [x] 3.3 Add `.shell-avatar` styles (40px circle, `--mat-sys-primary-container` bg, `--mat-sys-on-primary-container` fg, flex-centered text).
- [x] 3.4 Adjust `.shell-picker` to vertical layout (`margin: 0 0 16px 0; width: 100%;`), and update `toolbar-project-picker.component.scss` so `.picker-field { max-width: 100%; }`.

## Phase 4: Verification

- [x] 4.1 Run `npm run build` — must succeed without budget errors.
- [x] 4.2 Run `npm test` — `toolbar-project-picker.component.spec.ts` must still pass.
- [ ] 4.3 Manual: walk every scenario in `openspec/changes/main-shell-redesign/specs/shell-layout/spec.md` on `/modules/kanban` (light + dark theme). _Owner: human. Requires a browser._
- [ ] 4.4 Manual: axe DevTools on `/modules/kanban` — zero AA-contrast violations on the shell. _Owner: human. Requires a browser._

Note: tasks 4.3 and 4.4 are intentionally left for the user to run in a real browser. Code inspection plus the existing test suite covered everything achievable without a browser. See `verify-report.md` for the verdict (PASS WITH WARNINGS) and the small a11y fix (added `id="primary-sidenav"` on the sidenav) that was applied during verify.