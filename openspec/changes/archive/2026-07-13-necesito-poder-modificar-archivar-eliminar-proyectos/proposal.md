# Proposal: Necesito poder modificar, archivar y eliminar proyectos

## Why
The authenticated user can create and list projects, but cannot edit, archive, or delete them from the UI. The backend already supports every required operation (PATCH for modify and archived_at toggle, DELETE for hard delete), so this change is a pure UI/service layer addition wired to existing endpoints — plus minimal backend additions if any (likely none).

## What changes
- **Modify** — Rename and change description from the projects page via the existing `PATCH /api/v1/projects/{id}`.
- **Archive** — Set `archived_at = now()` from the projects page via PATCH; archived projects hide from the default list.
- **Unarchive** — Restore an archived project via PATCH (`archived_at: null`); show a "Show archived" toggle in the page.
- **Delete** — Hard-delete via `DELETE /api/v1/projects/{id}` behind a confirmation dialog.
- **Card actions menu** — Per-project `mat-menu` with Edit / Archive (or Unarchive) / Delete, scoped by ownership state.

## Out of scope
- Bulk operations (multi-select archive/delete).
- Restore from trash / soft-delete with retention window — delete is permanent.
- Renaming `slug` from the UI (slug stays server-managed; rename only affects `name`).
- New backend endpoints — existing CRUD covers all needs.
- Migrating other domains (kanban boards, cards) — these already cascade via FK.

## UX overview
- Project card gains an overflow `mat-icon-button` (`more_vert`) opening a `mat-menu` with three actions.
- Edit → reuses `ProjectEditorDialog` extended with `mode: 'edit'`, prefilled from the selected project.
- Archive → confirmation dialog ("Archive project? You can restore it later from the archived list."). On confirm: PATCH `archived_at`; snackbar with Undo (10s) calling unarchive.
- Unarchive → immediate action with snackbar; no confirm dialog.
- Delete → confirmation dialog with explicit name typing or destructive wording ("This permanently deletes the project and all its boards."). Snackbar on success; if the deleted project was active, clear localStorage + active signal.
- Header gains an "Archived" toggle chip that flips `include_archived` in the service; archived cards render with a subtle badge and reduced opacity.

## API surface
All endpoints already exist — no new routes.
- `PATCH /api/v1/projects/{id}` — used for modify (name/description) and archive/unarchive (`archived_at`).
- `DELETE /api/v1/projects/{id}` — used for hard delete (204 No Content).
- `GET /api/v1/projects?include_archived=1` — already wired in `ProjectsApi.list()`.

## Frontend additions
- `core/projects/projects.api.ts` — add `update(id, patch)`, `archive(id)`, `unarchive(id)`, `delete(id)`.
- `core/projects/project.service.ts` — add `update(id, patch)`, `setArchived(id, archived)`, `delete(id)` (mutates signals + persists active id).
- `core/projects/project.model.ts` — add `ProjectPatch` type.
- `modules/projects/components/project-editor-dialog/project-editor-dialog.ts` — extend `mode` union with `'edit'`, accept `initial` value, surface edit-mode submit.
- `modules/projects/components/project-card-menu/project-card-menu.ts/.html` — reusable per-card action menu (Edit / Archive|Unarchive / Delete).
- `modules/projects/components/confirm-dialog/confirm-dialog.ts/.html` — reusable destructive confirm (used by archive + delete with mode-specific copy).
- `modules/projects/pages/projects-page/projects-page.ts/.html` — wire menu actions, archived toggle chip, archived badge.

## Backend additions
- **None expected.** PATCH and DELETE routes already cover modify/archive/unarchive/delete.
- Add Pest test coverage only if a new edge case is discovered (e.g., archiving an already-archived project).

## Risks
- **Hard delete is irreversible** — confirmation must be unambiguous; never use a single click.
- **Optimistic update race** — if the server rejects (404/422), the local signal must roll back.
- **Active project cleared on delete** — if the deleted project is the toolbar selection, the bootstrap contract (F3 scenario 2) must be honored: clear localStorage + active signal immediately.
- **Focus management** — opening multiple dialogs (menu → confirm → snackbar) must keep focus predictable; verify AXE passes.
- **Permission 404 leak** — backend already returns 404 for cross-owner; the UI must treat 404 as "project no longer exists" and refresh the list.

## Test plan
- **Backend (Pest)** — only if new behavior: e.g., archiving an already-archived project returns 200 idempotent; unarchive returns 200 and clears `archived_at`.
- **Frontend unit** — `ProjectsApi` (update/archive/unarchive/delete HTTP wiring + envelope unwrap), `ProjectService` (signal mutations + active-id handling on delete).
- **Frontend component** — `projects-page` (clicking each menu item dispatches the right action, archived toggle flips the list, deleted-active clears localStorage), `project-editor-dialog` in `mode: 'edit'` (prefill + submit).
- **A11y** — manual AXE check on the new menu and confirm dialog; verify focus return on close.

## Conventions enforced
- **Laravel**: `declare(strict_types=1)`, `final class`, return types, Pest 4, `vendor/bin/pint --dirty --format agent` after edits.
- **Angular**: standalone components, signals + `@Service`, `inject()`, signal forms, native control flow (`@if`/`@for`), no `ngClass`/`ngStyle`, `data-testid` for E2E, WCAG AA (focus + ARIA + AXE).
- **Errors**: surface user messages via `ErrorNormalizer.toUserMessage()`; preserve the 404-not-403 cross-owner contract from `ProjectController`.

## Resolved decisions
1. **Delete confirmation** — type-the-name: user must type the exact project name to enable the destructive button. Zero accidental deletes.
2. **Archive undo** — snackbar with `Undo` button (10s) that calls `unarchive(id)`; dismiss leaves the project archived.
3. **Slug visibility** — hidden, server-managed. The edit dialog shows only `name` + `description`. Slug regenerates from name server-side.