# Spec: shell-layout

## Purpose

Define the visual chrome of the `/modules` route subtree: the persistent sidebar, the top toolbar, and the router outlet container. The shell is purely navigation chrome — it does not own business state and does not load feature data directly.

## Requirements

### R1 — Sidebar identity header

The sidebar MUST render a header block at the top containing:
- A circular avatar showing the initials of the authenticated user (up to 2 capital letters, derived from `user.name` split on whitespace).
- The user's `name` text adjacent to the avatar.

The header MUST be hidden when no user is authenticated (`AuthService.user` is `null`).

#### Scenario: Authenticated user sees avatar and name in sidebar

**Given** a user with `name = "Hugo Perez"` is authenticated
**When** the shell renders on `/modules/kanban`
**Then** the sidebar header shows a circular avatar with the text `HP`
**And** the text `Hugo Perez` is shown next to the avatar.

#### Scenario: No authenticated user hides the header

**Given** no user is authenticated
**When** the shell mounts
**Then** the sidebar header is not rendered.

### R2 — Sidebar navigation list

The sidebar MUST render a navigation list with one entry per registered feature route plus a logout entry. The entries currently required are:
- **Projects** (icon: `folder`, route: `/modules/projects`)
- **KANBAN** (icon: `view_kanban`, route: `/modules/kanban`)
- **CERRAR** (icon: `logout`, action: logout, no route)

The active route MUST be highlighted using `--mat-sys-secondary-container` background and `--mat-sys-on-secondary-container` foreground.

Clicking a route entry on a handset viewport MUST close the sidenav.

#### Scenario: Active route is visually highlighted

**Given** the user is on `/modules/kanban`
**When** the sidebar renders
**Then** the KANBAN entry has the active-link background color
**And** the Projects entry does not.

#### Scenario: Handset navigation closes the sidenav

**Given** the viewport matches `Breakpoints.Handset`
**And** the sidenav is open
**When** the user taps the Projects entry
**Then** the router navigates to `/modules/projects`
**And** the sidenav closes.

### R3 — Sidebar footer

The sidebar MUST render a footer block at the bottom containing the application name (`Dev Manager Desk`) and version (`0.0.0` from `package.json`). The footer MUST remain pinned to the bottom of the sidebar regardless of content height.

#### Scenario: Footer pinned to sidebar bottom

**Given** the sidebar has minimal content
**When** the sidebar renders
**Then** the footer is visually pinned to the bottom edge of the sidebar container.

### R4 — Top toolbar

The top toolbar MUST render, in order:
- A hamburger button (`menu` icon) that toggles the sidenav (hidden on desktop where the sidenav is permanent).
- The application title `Dev Manager Desk`.
- A theme toggle menu (`light_mode`, `dark_mode`, `brightness_auto` options) at the right edge.

The toolbar MUST NOT render the project picker or user text (those move to the sidebar per R1 and a dedicated placement rule below).

#### Scenario: Toolbar layout

**Given** any route under `/modules`
**When** the toolbar renders
**Then** the toolbar shows exactly three controls: hamburger, title, theme toggle.

### R5 — Project picker placement

The project picker (`app-toolbar-project-picker`) MUST be rendered inside the sidebar, below the user header and above the navigation list. It MUST keep its existing internal navigation behavior (when the active project changes, the router navigates to `/modules/kanban/projects/{id}/boards`).

#### Scenario: Project picker works from the sidebar

**Given** the user is on `/modules/kanban`
**And** there are two projects available: A and B
**When** the user selects project B in the sidebar picker
**Then** the router navigates to `/modules/kanban/projects/B/boards`.

### R6 — Theme toggle

The theme toggle MUST offer `Light`, `Dark`, and `System` options. The currently active mode MUST be visually indicated in the menu. Selecting an option MUST update the global theme immediately and persist the choice.

#### Scenario: Selecting dark mode applies the dark palette

**Given** the user is on any `/modules/*` route with `system` theme active
**When** the user opens the theme menu and selects Dark
**Then** `document.documentElement.style.colorScheme` is `dark`
**And** `--mat-sys-surface` resolves to the dark palette value
**And** the choice is persisted to `localStorage`.

### R7 — Logout

A logout control MUST be present in the sidebar (as the last nav entry) and MUST clear the session and navigate to `/auth/login`.

#### Scenario: Sidebar logout returns to login

**Given** an authenticated user is on `/modules/kanban`
**When** the user clicks the CERRAR entry in the sidebar
**Then** the session is cleared
**And** the router navigates to `/auth/login`.

### R8 — Router outlet container

The router outlet MUST be rendered inside a scrollable main region below the toolbar. The main region MUST have visible padding so content never touches the toolbar or sidebar edges.

#### Scenario: Routed pages render inside the shell

**Given** the user navigates to `/modules/kanban`
**When** the kanban feature mounts
**Then** the kanban page renders inside the shell main region
**And** the sidebar and toolbar remain visible.

### R9 — Accessibility

Every interactive element MUST have an accessible name. Sidebar text against the sidebar background MUST meet WCAG AA contrast (4.5:1 for normal text). The sidenav MUST expose `aria-label="Menu principal"` and the toggle button MUST expose `aria-expanded` reflecting the sidenav state.

#### Scenario: Hamburger announces sidenav state

**Given** the sidenav is closed
**When** assistive tech reads the hamburger button
**Then** it announces `Alternar menu lateral, collapsed`.