# Proposal: main-shell-redesign

## Intent

The application shell (`ModulesShellPage`) currently looks like a generic Material demo: cyan primary toolbar, plain nav list, no app identity. We want it to feel like a real product — a dark, structured layout that establishes visual hierarchy and matches the rest of the desk. The shell is purely a navigation chrome; routes, services, and feature pages stay unchanged.

## Scope

### In Scope
- Restyle `ModulesShellPage` template + SCSS to match a dark sidebar / minimal top toolbar layout.
- Move `app-toolbar-project-picker` from the toolbar into the sidebar (below the user header).
- Add a user header (avatar + name) at the top of the sidebar and an app/version footer at the bottom.
- Drop `color="primary"` on the toolbar to allow a neutral surface that pairs with the dark sidebar.

### Out of Scope
- No route changes (`/modules/projects`, `/modules/kanban` stay).
- No service changes (`AuthService`, `ThemeService`, `ProjectService`, `ToolbarProjectPickerComponent` internals untouched).
- No new components, no new spec files, no new tests beyond what already exists.
- No Material theme recompile. Token-based restyling only.
- No new feature areas (Dashboard, Caja, Tours, etc. from the reference image are out of scope).

## Capabilities

### New Capabilities
- `shell-layout`: defines the visual chrome of the `/modules` route subtree — sidebar header (avatar + user name), navigation list, sidebar footer (app name + version), top toolbar (hamburger + app title + theme toggle), and the router outlet container.

### Modified Capabilities
None. No existing `openspec/specs/` content to alter — this is the first capability on this project.

## Approach

Approach 1 from the exploration: single-page rewrite of `ModulesShellPage` template + SCSS only. Keep every signal (`sidenavOpened`, `isHandset`, `sidenavMode`, `themeMode`), every method (`toggleSidenav`, `closeSidenavIfHandset`, `setThemeMode`, `logout`), and every imported module. The only template relocations are: project picker from toolbar to sidebar, user name text from toolbar to sidebar header (as avatar + name).

Tokens used: `--mat-sys-surface-container` (sidebar background), `--mat-sys-on-surface-variant` (muted text), `--mat-sys-outline-variant` (subtle dividers), `--mat-sys-surface` (content), `--mat-sys-on-surface` (body text), `--mat-sys-secondary-container` + `--mat-sys-on-secondary-container` (active nav item). Toolbar gets a custom neutral background via a new `--shell-toolbar-bg` CSS variable scoped to `:host` to avoid global bleed.

Avatar: small component method `userInitials()` returns up to 2 capital letters from `user.name`. Render as a circle with `var(--mat-sys-primary-container)` background and `var(--mat-sys-on-primary-container)` foreground. No external avatar service.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/modules/modules-shell/modules-shell.page.html` | Modified | Repaint sidenav (avatar header, nav, footer) and toolbar (hamburger + title + theme only). |
| `src/app/modules/modules-shell/modules-shell.page.scss` | Modified | Dark sidebar surface, custom toolbar bg, sticky footer, vertical project picker spacing, avatar styles. |
| `src/app/modules/modules-shell/modules-shell.page.ts` | Modified | Add `userInitials()`, `appName`, `appVersion` members. Remove `themeIcon`/`themeLabel` if unused (kept). No service deps changed. |
| `src/app/layout/toolbar-project-picker/toolbar-project-picker.component.scss` | Modified (light touch) | Allow picker to fit a vertical sidebar column instead of horizontal toolbar. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| WCAG AA contrast fails in dark sidebar | Med | Validate every text-on-bg combo with a contrast check; use `--mat-sys-on-surface` (not `-variant`) for body text. |
| Toolbar `color="primary"` cyan looks wrong after removal | Low | Apply explicit `background-color` via `--shell-toolbar-bg` and `color` via `--mat-sys-on-surface`. |
| Project picker overflows sidebar width | Low | Constrain picker `max-width` to sidebar width minus padding. |
| Avatar initials look broken for non-ASCII names | Low | Use `name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()` — Unicode-safe. |

## Rollback Plan

Single-file revert: `git revert` of the shell page commits. No DB migration, no token changes, no service contract changes. Project picker keeps working from the toolbar in the previous layout.

## Dependencies

None.

## Success Criteria

- [ ] Sidebar is dark with a visible avatar + `user.name` header, navigation list with active-link styling, and an app/version footer at the bottom.
- [ ] Top toolbar contains only hamburger, app title, and theme toggle.
- [ ] `/modules/projects` and `/modules/kanban` routes still resolve and render without errors.
- [ ] Theme toggle (light / dark / system) still cycles; sidebar colors flip correctly.
- [ ] Project picker still triggers navigation on selection.
- [ ] Logout still works from the sidebar.
- [ ] All interactive elements meet WCAG AA contrast.