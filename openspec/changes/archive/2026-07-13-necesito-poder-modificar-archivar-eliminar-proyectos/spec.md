# Spec: Modify, archive and delete projects

## Scope
In-scope capabilities (numbered list of REQs):

- REQ-1 Edit project name and description from the projects page.
- REQ-2 Archive an active project with confirm + Undo.
- REQ-3 Unarchive an archived project.
- REQ-4 Hard-delete a project behind a type-the-name confirmation.
- REQ-5 Toggle visibility of archived projects from the projects page.
- REQ-6 Per-card action menu that exposes Edit / Archive|Unarchive / Delete.

## Requirements

### REQ-1: Edit project (modify)
**Given** the user is on the projects page and the project list is loaded
**When** the user clicks the per-card menu "Edit" action
**Then** the editor dialog opens in `mode: 'edit'` prefilled with the current `name` and `description`
**And** on save, PATCH `/api/v1/projects/{id}` with `{ name, description }` and the list reflects the change on success.

#### Scenarios
- REQ-1.1: Successful edit updates the project card without page reload.
- REQ-1.2: Edit with empty `name` (after trim) keeps the dialog open; no PATCH is issued.
- REQ-1.3: Server returns 422 — dialog stays open, snackbar surfaces `ErrorNormalizer.toUserMessage(err)`; no local mutation.
- REQ-1.4: Server returns 404 — project is removed from the visible list (cross-owner or already deleted).
- REQ-1.5: Double-submit guard disables the save button while PATCH is in flight.
- REQ-1.6: Cancel / Escape closes the dialog with no mutation and returns focus to the menu trigger.

### REQ-2: Archive project
**Given** the user is on the projects page with an active project visible
**When** the user clicks the per-card menu "Archive"
**Then** a confirm dialog asks for confirmation
**And** on confirm, PATCH `/api/v1/projects/{id}` with `{ archived_at: now() }` is issued
**And** the project disappears from the default list
**And** a snackbar appears with an `Undo` action for 10 seconds that triggers `unarchive(id)`.

#### Scenarios
- REQ-2.1: Confirming archive hides the project from the default list (optimistic remove; rollback on server error).
- REQ-2.2: Snackbar `Undo` restores the project in place via PATCH `archived_at: null`.
- REQ-2.3: Archiving an already-archived project is a no-op visible to the user (idempotent at the server; UI shows no change because the card is not visible).
- REQ-2.4: Server error on archive surfaces a snackbar with `ErrorNormalizer.toUserMessage()` and the list is unchanged.
- REQ-2.5: If the archived project was the active project in the toolbar, the active signal stays valid (archived projects are still selectable for read-only views) — backend invariant.

### REQ-3: Unarchive project
**Given** the projects page is showing archived projects (toggle on)
**When** the user clicks "Unarchive" on a card
**Then** PATCH `archived_at: null` is issued, the project moves from the archived section to the active section, and a snackbar confirms.

#### Scenarios
- REQ-3.1: Unarchive immediately reflects in the active list (optimistic move with rollback on error).
- REQ-3.2: If the unarchived project was the active project (in toolbar picker), the active signal stays valid.
- REQ-3.3: Server error surfaces a snackbar; the card remains in the archived section.

### REQ-4: Delete project (hard delete, type-the-name confirm)
**Given** the user is on the projects page
**When** the user clicks "Delete" on a card
**Then** a destructive confirm dialog requires the user to type the project name exactly to enable the Delete button
**And** on confirm, DELETE `/api/v1/projects/{id}` is called
**And** on 204 the project disappears from the list, the active project (if it was this one) is cleared from localStorage and the signal, and a snackbar confirms.

#### Scenarios
- REQ-4.1: Typing the wrong name keeps the Delete button disabled.
- REQ-4.2: Typing the correct name enables Delete; pressing it issues the DELETE.
- REQ-4.3: Deleted-active project clears localStorage key `dev-manager-desk:project:selected` and resets the active signal to null.
- REQ-4.4: Server error on delete surfaces a snackbar; project remains in the list (no optimistic removal — must not lose data on a failed delete).
- REQ-4.5: Cancel / Escape closes the dialog without issuing DELETE; focus returns to the menu trigger.

### REQ-5: Show archived toggle
**Given** the projects page header
**When** the user toggles "Show archived"
**Then** the project list flips between `include_archived=false` (default — active section only) and `include_archived=true` (active section + archived section appended, each card showing an "Archived" badge).

#### Scenarios
- REQ-5.1: Default view hides archived; toggle exposes them with an "Archived" badge and reduced opacity (CSS class `archived`).
- REQ-5.2: Toggling the switch refreshes the visible list by calling `ProjectService.toggleArchived()`; the current toolbar selection is preserved if still valid.
- REQ-5.3: Active project (toolbar) is never archived (assertion: backend invariant — see REQ-2.5).

### REQ-6: Per-card action menu
**Given** each project card
**Then** a `mat-icon-button` (`more_vert`) opens a `mat-menu` with: Edit, Archive|Unarchive (conditional), Delete.

#### Scenarios
- REQ-6.1: Menu items reflect current state — active projects show "Archive"; archived projects show "Unarchive".
- REQ-6.2: Menu opens above the card without clipping at viewport edges (Material handles positioning).
- REQ-6.3: Menu trigger has `aria-haspopup="menu"` and `aria-label="Project actions for {name}"` for screen readers.
- REQ-6.4: Edit and Delete are always available regardless of archived state (admin can still rename or delete archived projects).

## API contract
All endpoints already exist — no new routes.

| Method | Path | Used for | Notes |
|---|---|---|---|
| GET    | `/api/v1/projects?include_archived=0\|1` | list / toggle archived | existing |
| POST   | `/api/v1/projects` | (out of scope — create already works) | existing |
| GET    | `/api/v1/projects/{id}` | (read; not directly used by this change) | existing |
| PATCH  | `/api/v1/projects/{id}` | modify, archive, unarchive | body: `{ name?, description?, archived_at? }`; envelope `{ data: Project }` |
| DELETE | `/api/v1/projects/{id}` | delete | returns 204 No Content |

Cross-owner and unknown id resolve to 404 (not 403), preserving the existing no-existence-leak contract.

## Out of scope
- Bulk operations (multi-select archive/delete).
- Restore from trash / soft-delete with retention window — delete is permanent.
- Renaming `slug` from the UI (slug stays server-managed; rename only affects `name`).
- New backend endpoints — existing CRUD covers all needs.
- Migrating other domains (kanban boards, cards) — these already cascade via FK.

## Acceptance criteria
- All REQs above pass their scenarios.
- AXE checks pass on the projects page with the new menu + dialogs.
- Existing tests still pass.
- New Pest tests added only if a new behavior is introduced (e.g., idempotent archive).
- New Karma tests cover the new service methods and component interactions.
- `vendor/bin/pint --dirty --format agent` passes after PHP changes.
- Frontend builds clean (`ng build`) with no new lint errors.