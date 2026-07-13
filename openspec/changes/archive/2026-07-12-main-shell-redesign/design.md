# Design: main-shell-redesign

## Technical Approach

Single-page rewrite of `ModulesShellPage` (`src/app/modules/modules-shell/modules-shell.page.{ts,html,scss}`) and a light touch on `ToolbarProjectPickerComponent`'s SCSS. All Angular Material modules already imported by the shell stay; no new module imports. All existing signals (`sidenavOpened`, `isHandset`, `sidenavMode`, `themeMode`, `user`) stay; one new `computed()` (`userInitials`) and two constants (`APP_NAME`, `APP_VERSION`) are added. No service changes, no router changes.

The shell stays a `mat-sidenav-container`; only the inner DOM and SCSS change.

## Architecture Decisions

### Decision: Stay single component

**Choice**: Rewrite `ModulesShellPage` template + SCSS only. Do not extract sub-components.
**Alternatives considered**: Extract `ShellSidebar`, `ShellHeader`, `ShellFooter` sub-components.
**Rationale**: Visual-only change. Sub-components add review surface and file churn for zero behavioral gain. The template is still under 100 lines after the rewrite.

### Decision: Drop `color="primary"` from `mat-toolbar`

**Choice**: Remove the `color` attribute and set explicit `background-color` via a new `--shell-toolbar-bg` CSS variable scoped to the shell.
**Alternatives considered**: Keep `color="primary"` and accept the cyan toolbar.
**Rationale**: The reference layout uses a neutral toolbar that doesn't compete with the sidebar for visual weight. The cyan would also clash with the cyan avatar circle. Custom CSS variable keeps the override scoped.

### Decision: Project picker rehosts to sidebar

**Choice**: Move `<app-toolbar-project-picker>` from the toolbar to the sidebar, below the user header.
**Alternatives considered**: Keep picker in the toolbar behind a menu trigger.
**Rationale**: User explicitly chose this layout. The picker's internal `effect()` on `current()` + `currentUrl()` is host-agnostic — rehosting has zero behavioral risk. Tiny SCSS tweak on the picker (max-width, vertical margin) to fit the narrower sidebar column.

### Decision: Avatar = initials in a colored circle

**Choice**: Compute initials from `user.name`, render as `<div class="avatar">{{ initials }}</div>` styled with `--mat-sys-primary-container` background and `--mat-sys-on-primary-container` text.
**Alternatives considered**: Fetch `avatar_url` from backend (doesn't exist on User today).
**Rationale**: Zero new dependencies, zero new requests, works offline, deterministic. Initials extraction: `name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()`. Empty string fallback: render a generic `person` icon instead.

### Decision: Footer pinned with flex column

**Choice**: Use `display: flex; flex-direction: column;` on the sidenav content wrapper so the footer gets `margin-top: auto`.
**Alternatives considered**: `position: absolute; bottom: 0` on the footer.
**Rationale**: Flex layout adapts naturally to dynamic content height and respects the sidenav scroll container if it ever needs one.

## Data Flow

No new data flow. Existing flows stay intact:

```
ModulesShellPage
├── themeMode (ThemeService.mode) ───> themeMenu
├── user (AuthService.user) ─────────> avatar header + name
├── sidenavOpened / sidenavMode ─────> mat-sidenav bindings
└── appName / appVersion (constants) ─> sidebar footer + toolbar title

ToolbarProjectPickerComponent (rehosted)
└── projectService.projects / current ───> mat-select + navigation effect
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/app/modules/modules-shell/modules-shell.page.html` | Modify | Repaint sidenav with header (avatar + name), nav list, footer; repaint toolbar (hamburger + title + theme only); relocate `<app-toolbar-project-picker>` to the sidebar. |
| `src/app/modules/modules-shell/modules-shell.page.scss` | Modify | Dark sidebar (`--mat-sys-surface-container`), custom toolbar bg, flex column for footer pinning, avatar styles, nav hover/focus styles, active-link styles. |
| `src/app/modules/modules-shell/modules-shell.page.ts` | Modify | Add `userInitials` computed, `APP_NAME` constant, `APP_VERSION` constant (read from `package.json` at build time via `ngDevMode`/string literal — actually `APP_VERSION` will be a literal string synced manually to `package.json`). |
| `src/app/layout/toolbar-project-picker/toolbar-project-picker.component.scss` | Modify | Constrain `.picker-field` `max-width: 100%` and remove toolbar-specific horizontal margin. |

## Interfaces / Contracts

```ts
// ModulesShellPage additions
protected readonly APP_NAME = 'Dev Manager Desk';
protected readonly APP_VERSION = '0.0.0'; // mirror of package.json
protected readonly userInitials = computed(() => {
  const name = this.user()?.name ?? '';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();
});
```

No new types, no new service methods, no new modules.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Manual | WCAG AA contrast on every text/bg pair in the shell | Run axe DevTools on `/modules/kanban` with light + dark themes. |
| Manual | All 9 spec scenarios | Walk through each scenario in `specs/shell-layout/spec.md` against `ng serve` + a real browser. |
| Existing | `toolbar-project-picker.component.spec.ts` | Re-run to confirm the SCSS tweak didn't break the component (it shouldn't, but be sure). |

No new automated tests: the change is visual-only and the shell page has no `.spec.ts` today. Adding shell-page tests now would expand scope beyond the user's "es solo un cambio visual" constraint.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is touched. The change is constrained to template + SCSS + a couple of computed/constant members.

## Migration / Rollout

No migration required. Single commit, single PR. Toggle the toolbar toggle, navigate around, confirm visual + theme persistence. Rollback is `git revert`.

## Open Questions

None.