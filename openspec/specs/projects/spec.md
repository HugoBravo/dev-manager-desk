# Spec: projects

## Purpose

Define the `/modules/projects` index page and the per-project mutation lifecycle (edit, archive, unarchive, delete) as exposed by the Angular UI. The page renders the authenticated user's projects from `ProjectService`, exposes a creation CTA, and a per-card overflow menu with destructive actions wired to the existing Laravel REST endpoints.

The page does not own business state — `ProjectService` is the single source of truth for the list and the active selection; components are presentational.

## Requirements

### R1 — Edit project (modify)

The user MUST be able to edit a project's `name` and `description` from the projects page via the per-card overflow menu (`ProjectCardMenu`) → `Edit` action. The editor opens as a Material dialog reusing `ProjectEditorDialog` in `mode: 'edit'`, prefilled with the current project values. On save, the page PATCHes `/api/v1/projects/{id}` with `{ name, description }`.

#### Scenario: Successful edit updates the project card without page reload

**Given** the user is on the projects page and the project list is loaded
**When** the user clicks the per-card menu "Edit" action and saves the editor with a new name
**Then** the visible card reflects the new name
**And** no full-page reload happens.

#### Scenario: Edit with empty name keeps the dialog open

**Given** the editor is open in `mode: 'edit'`
**When** the user clears the name field and tries to submit
**Then** the dialog stays open
**And** no PATCH is issued.

#### Scenario: Server returns 422 on edit

**Given** the editor was saved with `name = "Bad"`
**When** the server responds with 422
**Then** a snackbar surfaces the normalized error message
**And** the visible list is unchanged.

#### Scenario: Server returns 404 on edit

**Given** the project was deleted between menu open and PATCH
**When** the server responds with 404
**Then** the project is removed from the visible list.

#### Scenario: Double-submit guard disables the save button while PATCH is in flight

**Given** the editor is open with valid input
**When** the user clicks Save
**Then** the Save button is disabled until the PATCH resolves.

#### Scenario: Cancel or Escape closes the dialog with no mutation and restores focus to the menu trigger

**Given** the editor is open
**When** the user clicks Cancel or presses Escape
**Then** the dialog closes with `{ action: 'cancel' }`
**And** focus returns to the menu trigger button that opened it.

### R2 — Archive project

The user MUST be able to archive an active project from the per-card overflow menu → `Archive`. The action opens a destructive confirm dialog (`ConfirmDialog` in `mode: 'archive'`). On confirm, the page PATCHes `/api/v1/projects/{id}` with `{ archived_at: now() }`. The default view hides archived projects; the project disappears from the list optimistically. A snackbar appears with an `Undo` action for 10 seconds that calls `unarchive(id)`.

#### Scenario: Confirming archive hides the project from the default list

**Given** the user is on the projects page with an active project visible
**When** the user clicks the per-card menu "Archive" and confirms
**Then** the project disappears from the default list
**And** a snackbar appears with an `Undo` action.

#### Scenario: Snackbar Undo restores the project in place

**Given** a project was just archived
**When** the user clicks the snackbar's `Undo` action within 10 seconds
**Then** the page PATCHes `archived_at: null` for that project
**And** the project reappears in the active list.

#### Scenario: Archiving an already-archived project is a no-op visible to the user

**Given** a project is already archived (idempotent at the backend)
**When** the user archives it again
**Then** the API returns 200
**And** the visible UI shows no change because the card is hidden.

#### Scenario: Server error on archive surfaces a snackbar with the normalized error

**Given** an archive PATCH fails
**When** the server returns 5xx
**Then** a snackbar surfaces the normalized error message
**And** the visible list is unchanged.

#### Scenario: Active project stays selectable after being archived

**Given** the archived project is the active project in the toolbar picker
**When** the archive succeeds
**Then** `currentId` is NOT cleared
**And** the toolbar still shows the archived project as selected.

### R3 — Unarchive project

The user MUST be able to restore an archived project from the per-card overflow menu → `Unarchive`. The action is immediate (no confirm dialog): the page PATCHes `/api/v1/projects/{id}` with `{ archived_at: null }` and prepends the server-truth `Project` to the active list.

#### Scenario: Unarchive immediately reflects in the active list

**Given** the projects page is showing archived projects
**When** the user clicks "Unarchive" on a card
**Then** the project moves from the archived section to the active section
**And** a snackbar confirms.

#### Scenario: Unarchive keeps the active id valid when the unarchived project was the active selection

**Given** the unarchived project is the active project in the toolbar picker
**When** the unarchive succeeds
**Then** `currentId` is unchanged and the toolbar still shows it as selected.

#### Scenario: Server error on unarchive leaves the card in the archived section

**Given** a 5xx response on unarchive PATCH
**When** the request fails
**Then** the card remains in the archived section
**And** a snackbar surfaces the normalized error.

### R4 — Delete project (hard delete, type-the-name confirm)

The user MUST be able to permanently delete a project from the per-card overflow menu → `Delete`. The action opens a destructive confirm dialog (`ConfirmDialog` in `mode: 'delete'`) that requires the user to type the exact project name to enable the destructive button. On confirm, the page DELETEs `/api/v1/projects/{id}`. On 204 the project disappears from the list, the active project (if it was this one) is cleared from localStorage and the signal, and a snackbar confirms.

#### Scenario: Typing the wrong name keeps the Delete button disabled

**Given** the delete confirm dialog is open for a project named "Alpha"
**When** the user types "alph" into the confirmation field
**Then** the Delete button stays disabled.

#### Scenario: Typing the correct name enables Delete

**Given** the delete confirm dialog is open for a project named "Alpha"
**When** the user types "Alpha" exactly
**Then** the Delete button becomes enabled
**And** clicking it issues the DELETE.

#### Scenario: Deleted-active project clears localStorage and the active signal

**Given** the user is deleting their active toolbar project
**When** the DELETE returns 204
**Then** `localStorage["dev-manager-desk:project:selected"]` is removed
**And** the active signal becomes `null`.

#### Scenario: Server error on delete leaves the project in the list

**Given** the user clicked Delete on a project
**When** the server returns 5xx
**Then** the project remains in the visible list
**And** a snackbar surfaces the normalized error.

#### Scenario: Cancel or Escape closes the dialog without issuing DELETE

**Given** the delete confirm dialog is open
**When** the user clicks Cancel or presses Escape
**Then** the dialog closes with `{ confirmed: false }`
**And** no DELETE is issued.

### R5 — Show archived toggle

The projects page header MUST expose a `mat-slide-toggle` labeled "Show archived". When OFF (default), the list shows only projects with `archived_at === null`. When ON, the list includes archived projects appended, each rendered with an `Archived` chip badge and the `.archived` CSS class (reduced opacity).

#### Scenario: Default view hides archived; toggle exposes them with a badge

**Given** the projects list contains a mix of active and archived projects
**When** the user toggles "Show archived" ON
**Then** the list re-fetches with `?include_archived=1`
**And** archived cards render an `Archived` chip and reduced opacity.

#### Scenario: Toggling the switch refreshes the visible list and preserves the toolbar selection

**Given** the user has a stored active project
**When** the user toggles "Show archived"
**Then** the list refreshes
**And** if the active project is still present, it stays selected.

#### Scenario: Active project is never archived

**Given** the active project is in the toolbar picker
**When** the user archives it
**Then** the active signal stays valid (archive is a no-op for `currentId`).

### R6 — Per-card action menu

Each project card MUST expose a `more_vert` icon button that opens a Material `mat-menu` with three items: Edit, Archive|Unarchive, Delete. The Archive/Unarchive label switches based on the card's archived state. The trigger MUST expose `aria-haspopup="menu"` and a dynamic `aria-label="Project actions for {name}"`.

#### Scenario: Menu items reflect current state

**Given** an active project card
**When** the menu opens
**Then** the items are: Edit, Archive, Delete
**And** Archive is labelled "Archive".

#### Scenario: Archived cards show Unarchive

**Given** an archived project card
**When** the menu opens
**Then** the items are: Edit, Unarchive, Delete
**And** the action label reads "Unarchive".

#### Scenario: Menu trigger has correct ARIA

**Given** any project card
**When** the page renders
**Then** the menu trigger button has `aria-haspopup="menu"`
**And** `aria-label="Project actions for {project.name}"`.

#### Scenario: Edit and Delete are always available

**Given** any project card regardless of archived state
**When** the menu opens
**Then** the Edit and Delete items are always present.

## API contract

All endpoints are existing — no new routes.

| Method | Path | Used for | Notes |
|---|---|---|---|
| GET    | `/api/v1/projects?include_archived=0\|1` | list / toggle archived | existing |
| POST   | `/api/v1/projects` | create | existing (out of scope of this spec) |
| GET    | `/api/v1/projects/{id}` | read; not directly used by this change | existing |
| PATCH  | `/api/v1/projects/{id}` | modify, archive, unarchive | body: `{ name?, description?, archived_at? }`; envelope `{ data: Project }` |
| DELETE | `/api/v1/projects/{id}` | delete | returns 204 No Content |

Cross-owner and unknown id resolve to 404 (not 403), preserving the existing no-existence-leak contract.

## Out of scope

- Bulk operations (multi-select archive/delete).
- Restore from trash / soft-delete with retention window — delete is permanent.
- Renaming `slug` from the UI (slug stays server-managed; rename only affects `name`).
- New backend endpoints — existing CRUD covers all needs.
- Migrating other domains (kanban boards, cards) — these already cascade via FK.
