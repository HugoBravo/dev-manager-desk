# Exploration: main-shell-redesign

## Current State

The application shell lives in `ModulesShellPage` (`src/app/modules/modules-shell/modules-shell.page.{ts,html,scss}`). It is the layout component for the `/modules` route subtree (see `src/app/modules/modules.routes.ts`), which hosts two feature areas: `projects` and `kanban`.

Today the shell:

- Wraps everything in `mat-sidenav-container` with a `mat-sidenav` (260px, fixed width) on the left and `mat-sidenav-content` on the right.
- The sidenav uses `mat-nav-list` with three entries: **Projects** (`folder` icon), **KANBAN** (`view_kanban` icon), and **CERRAR** (logout action). The sidenav has no header (avatar / user name) and no footer.
- The toolbar (`mat-toolbar color="primary"`) sits above the content and currently hosts: hamburger toggle, "Dev Manager Desk" title, `app-toolbar-project-picker`, theme menu (light/dark/system), `user.name` text, and a logout icon button.
- The router outlet is wrapped in `<main class="shell-main">` with 24px padding.

The Material theme uses `theme-type: color-scheme` with `mat.$cyan-palette` (primary) and `mat.$orange-palette` (tertiary). `ThemeService` toggles `color-scheme` on `<html>` at runtime, so all `--mat-sys-*` tokens flip automatically.

`AuthService.user` exposes a signal of `{ id, name, email, email_verified_at } | null`; today only `name` is rendered in the toolbar.

There is one existing test file: `src/app/layout/toolbar-project-picker/toolbar-project-picker.component.spec.ts`. No `*.spec.ts` for the shell page itself today.

## Affected Areas

- `src/app/modules/modules-shell/modules-shell.page.ts` — restructure signals/methods: keep `sidenavMode`/`sidenavOpened`/`isHandset`; remove toolbar-only concerns if moved; add `appName` signal or constant for "Dev Manager Desk" + version.
- `src/app/modules/modules-shell/modules-shell.page.html` — repaint sidenav (avatar+name header, nav list, footer with app/version) and toolbar (hamburger + title + theme only). Keep `<router-outlet />` structure unchanged.
- `src/app/modules/modules-shell/modules-shell.page.scss` — rewrite visual tokens for dark sidebar, full-height sticky footer inside sidenav, toolbar simplification, content area. No behavioral changes.
- `src/app/layout/toolbar-project-picker/` — keep the component unchanged. It will be re-mounted inside the sidebar instead of the toolbar. The component self-routes on project change; moving its host element doesn't affect that effect.
- `src/styles.css`, `src/material-theme.scss` — global styles stay as-is. Tokens used: `--mat-sys-surface`, `--mat-sys-surface-container`, `--mat-sys-on-surface`, `--mat-sys-on-surface-variant`, `--mat-sys-outline-variant`, `--mat-sys-secondary-container`, `--mat-sys-on-secondary-container`.

## Approaches

1. **Single-page rewrite of `ModulesShellPage`** — keep one component, rewrite its template + scss to match the reference layout (dark sidenav with avatar header + footer, minimal toolbar). Move `app-toolbar-project-picker` from toolbar into the sidebar (just below the avatar). Replace user-name text in toolbar with an avatar+name header at the top of the sidenav.
   - Pros: smallest blast radius, no new files, no public API change. Routing/sidenav state/breakpoint behavior all stay the same. Easiest to review.
   - Cons: template gets longer. Could split into sub-components later if it grows.
   - Effort: **Low**

2. **Split shell into header / sidebar / content sub-components** — extract `ShellHeader`, `ShellSidebar`, `ShellFooter`, keep `ModulesShellPage` as orchestrator.
   - Pros: better separation of concerns; each part becomes independently testable and reusable.
   - Cons: more files, more changes, larger PR, more review surface. Overkill for a visual-only change.
   - Effort: **Medium**

3. **Keep current structure but only restyle via global CSS** — leave templates alone, add a separate stylesheet that overrides Material defaults.
   - Pros: zero template diff.
   - Cons: hard to express the new structure (avatar header, footer with version, picker relocation) without touching the template. Fighting Material's `mat-sidenav`/`mat-toolbar` defaults via overrides is brittle and hurts a11y/contrast.
   - Effort: **Medium-High (fighting the framework)**

## Recommendation

Approach **1**. It's the minimal, honest change: rewrite the template + SCSS of the shell page to match the reference visual while keeping every behavioral signal, route, and service call intact. No new files, no API changes, no spec drift. The shell will continue to pass through `/modules/projects` and `/modules/kanban` routes; the project picker keeps working from its new mount point (its internal `effect()` doesn't care where it renders); theme toggle stays where it always was.

## Risks

- **Color contrast / a11y in dark sidebar**: the reference image is very dark with mid-gray text. We must verify WCAG AA contrast (4.5:1 for body text) against `var(--mat-sys-surface-container)` or whatever surface we pick, otherwise the a11y audit will fail.
- **`<mat-toolbar color="primary">` color shift**: today the toolbar uses the primary cyan palette. The reference toolbar is a slate/blue-gray with white text — closer to `surface` or a custom `--shell-toolbar-bg`. If we keep `color="primary"` we'll get cyan; if we want the reference look we need to drop the `color` attribute and style the toolbar explicitly.
- **Project picker host**: it's currently styled to live inline in the toolbar. Moving it into the sidebar (below the avatar block) may need a tiny SCSS tweak on the picker side to fit a vertical layout. The component itself doesn't change.
- **Avatar fallback**: `User` has no `avatar_url`. Reference image shows a circular avatar — we need to fall back to initials in a colored circle when there's no image. Use `user.name` initials.
- **Hamburger toggle behavior on desktop**: today `sidenavMode` is `side` on desktop with `sidenavOpened=true`. The reference layout has a permanent dark sidebar visible on desktop (similar). Keeping current behavior is correct.

## Open Questions for User

None — answered in pre-flight.

## Ready for Proposal

Yes. Proceed to `proposal.md` covering capability `shell-layout` with delta: dark sidebar with avatar header + version footer, minimal top toolbar, preserved routes and services.