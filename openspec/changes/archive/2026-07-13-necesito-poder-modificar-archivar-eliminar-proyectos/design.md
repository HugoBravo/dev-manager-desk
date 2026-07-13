# Design: Modify, archive and delete projects

## Architecture overview
Pure UI/service-layer addition. No new backend endpoints. Every action hits existing Laravel routes (`PATCH`, `DELETE`, `GET ?include_archived=1`). The change adds an `update/archive/unarchive/delete` slice to the Angular `core/projects` module and a small reusable component pair (`project-card-menu`, `confirm-dialog`) under `modules/projects/components/`. State remains centralized in `ProjectService`; components are presentational.

## Backend changes

### Endpoints (existing — no new routes)

| Method | Path | Purpose | Used for |
|---|---|---|---|
| PATCH  | `/api/v1/projects/{id}` | Update fields including `archived_at` | modify, archive, unarchive |
| DELETE | `/api/v1/projects/{id}` | Hard delete (cascade via FK) | delete |
| GET    | `/api/v1/projects?include_archived=0\|1` | List active or all | archived toggle |

### Service layer
None expected. `ProjectController` already encapsulates modify/archive/unarchive/delete logic.

### Migrations / model
None. Schema already has `archived_at` (datetime, nullable) and the cascadeOnDelete FK from `boards.project_id`.

### Tests (Pest)
Add minimal coverage only for new edge cases:
- `archives a project idempotently` — PATCH `archived_at` twice → second call returns 200 with same timestamp persisted (no duplicate update).
- `deleting a project cascades boards` — seed a board under the project, DELETE the project, assert board is gone (FK cascade).

## Frontend changes

### File-by-file

#### `core/projects/project.model.ts`
Add `ProjectPatch` for type-safe PATCH payloads:
```ts
export type ProjectPatch = Partial<Pick<Project, 'name' | 'description' | 'archived_at'>>;
```

#### `core/projects/projects.api.ts`
Add four thin wrappers (Observables, envelope-unwrapped):
- `update(id: number, patch: ProjectPatch): Observable<Project>` — PATCH `/v1/projects/{id}`.
- `archive(id: number): Observable<Project>` — `update(id, { archived_at: new Date().toISOString() })`.
- `unarchive(id: number): Observable<Project>` — `update(id, { archived_at: null })`.
- `delete(id: number): Observable<void>` — DELETE `/v1/projects/{id}`, expect 204, map to `void`.

#### `core/projects/project.service.ts`
Centralize all mutations here so components stay presentational.

- `update(id, patch)` — snapshot prior value, optimistic `update`, rollback on error; on 404, remove from list.
- `archive(id)` — snapshot, optimistic remove from `projects()`; rollback on error. Caller drives the snackbar; service exposes the id for undo.
- `unarchive(id)` — PATCH, on success insert the returned `Project` at the head of the active list (it will be visible because `archived_at === null`); rollback on error.
- `delete(id)` — snapshot, optimistic remove on 204; **only remove locally after 204 received** (REQ-4.4 forbids optimistic removal). If `id === currentId()`, call `setActive(null)` to clear localStorage + signal.
- New signal `_includeArchived` (default false) + `includeArchived()` readonly getter + `toggleArchived()` method that re-calls `api.list()` and replaces `projects()` while honoring the bootstrap contract (preserve stored id if still present).

#### `modules/projects/components/project-editor-dialog/project-editor-dialog.ts`
- Extend `ProjectEditorDialogData.mode` union: `'create' | 'edit'`.
- Add `initial?: { name: string; description: string | null }` to data.
- On `ngOnInit`, if `mode === 'edit'`, prefill the form signal with `initial.name/description` (normalize `null` to `''`).
- Title becomes dynamic: `'New project'` for create, `'Edit project'` for edit.
- On submit, the dialog returns the trimmed `name` + normalized `description` (same `ProjectEditorDialogResult` shape as today). Caller decides whether to call `create` or `update`.

#### `modules/projects/components/project-card-menu/project-card-menu.ts/.html`
- Standalone component (`@Component({ selector: 'app-project-card-menu' })`).
- Signal inputs: `project: Project`, `mode: 'active' | 'archived'`.
- Signal outputs: `edit`, `archive`, `unarchive`, `delete` — each emits `{ id: number }`.
- Template: `mat-icon-button[matMenuTriggerFor]="menu"` with `more_vert` icon + `mat-menu` showing items conditionally.
- Accessibility: `aria-haspopup="menu"`, `aria-label="Project actions for {project.name}"`.

#### `modules/projects/components/confirm-dialog/confirm-dialog.ts/.html`
- Generic reusable confirm dialog driven by `MAT_DIALOG_DATA`:
  - `title: string`
  - `message: string`
  - `mode: 'archive' | 'delete'`
  - `projectName?: string` (required for `mode: 'delete'`)
- For `mode: 'delete'`, render a Material text field bound via signal forms with a custom validator enforcing `value === projectName`. Delete button is disabled until the field is valid.
- Returns `{ confirmed: boolean }` (true on confirm action, false on cancel/Escape/backdrop).

#### `modules/projects/pages/projects-page/projects-page.ts/.html`
- Header: add `mat-slide-toggle` labeled "Show archived" wired to `projectService.toggleArchived()`.
- Card list: each card includes `<app-project-card-menu>` and wires its outputs:
  - `edit` → open `ProjectEditorDialog` with `mode: 'edit'` + `initial`; on save call `projectService.update(id, payload)`, snackbar on success/failure.
  - `archive` → open `ConfirmDialog` with `mode: 'archive'`; on confirm call `projectService.archive(id)`, snackbar with Undo.
  - `unarchive` → call `projectService.unarchive(id)`, snackbar.
  - `delete` → open `ConfirmDialog` with `mode: 'delete'` + `projectName`; on confirm call `projectService.delete(id)`, snackbar.
- Snackbar with Undo: `MatSnackBar.open(message, 'Undo', { duration: 10000 })`; on action observable, call `projectService.unarchive(id)`.
- Archived badge: when `includeArchived` is on, archived cards render a small Material `mat-chip` "Archived" and a CSS class `archived` for reduced opacity.

### Snackbar copy (English; centralized as constants for future i18n)
- `archive.success`: `'Project "{name}" archived'`
- `archive.undo.label`: `'Undo'`
- `unarchive.success`: `'Project "{name}" restored'`
- `delete.success`: `'Project "{name}" deleted'`
- Error fallback: `ErrorNormalizer.toUserMessage(err)`

## State management
- All mutations live in `ProjectService`. Components are presentational.
- Optimistic update + rollback for `update`, `archive`, `unarchive`.
- `delete` is **post-confirmation only** — no optimistic removal (REQ-4.4 forbids it).
- `currentId` invariant preserved: deleting the active project clears localStorage + signal.
- `bootstrapError` semantics unchanged; network failures during mutations surface via snackbars, not the bootstrap signal.

## Testing strategy

### Pest (backend)
- `archives a project idempotently` — PATCH `archived_at` twice.
- `deleting a project cascades boards` — seed board, DELETE project, assert cascade.

### Karma/Jasmine (frontend)
- `projects.api.spec.ts` — HTTP wiring for `update`, `archive`, `unarchive`, `delete` (envelope unwrap + 204 mapping).
- `project.service.spec.ts` — signal mutations, rollback on error, active-id handling on delete, `toggleArchived()` re-fetch.
- `projects-page.spec.ts` — menu outputs trigger the right service calls; archived toggle flips the list; delete clears localStorage.
- `project-editor-dialog.spec.ts` — `mode: 'edit'` prefill + submit payload shape.
- `confirm-dialog.spec.ts` — type-the-name gates the destructive button; cancel/Escape returns `{ confirmed: false }`.
- `project-card-menu.spec.ts` — outputs emit with the correct id; conditional Archive/Unarchive label.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Hard delete is irreversible | Type-the-name confirm + 204 ack before removal |
| Optimistic update race | Rollback on 4xx/5xx; never remove on 401/403/404 without ack (delete uses post-ack removal) |
| Active project deleted | `setActive(null)` in service.delete clears localStorage + signal |
| Stale list after delete | Reload visible list on 404 in update/delete paths |
| Focus management across menu → confirm → snackbar | Reuse existing focus-return pattern from `ProjectEditorDialog.afterClosed()` |
| Double-submit on archive/delete | Per-call `isSubmitting` flag in the page disables the menu trigger |

## Out of scope
- Bulk archive/delete, soft-delete retention window, slug UI, new backend endpoints.

## File map (summary)
- NEW: `dev-manager-desk/src/app/modules/projects/components/project-card-menu/project-card-menu.ts`
- NEW: `dev-manager-desk/src/app/modules/projects/components/project-card-menu/project-card-menu.html`
- NEW: `dev-manager-desk/src/app/modules/projects/components/project-card-menu/project-card-menu.spec.ts`
- NEW: `dev-manager-desk/src/app/modules/projects/components/confirm-dialog/confirm-dialog.ts`
- NEW: `dev-manager-desk/src/app/modules/projects/components/confirm-dialog/confirm-dialog.html`
- NEW: `dev-manager-desk/src/app/modules/projects/components/confirm-dialog/confirm-dialog.spec.ts`
- MODIFY: `dev-manager-desk/src/app/core/projects/project.model.ts`
- MODIFY: `dev-manager-desk/src/app/core/projects/projects.api.ts`
- MODIFY: `dev-manager-desk/src/app/core/projects/projects.api.spec.ts`
- MODIFY: `dev-manager-desk/src/app/core/projects/project.service.ts`
- MODIFY: `dev-manager-desk/src/app/core/projects/project.service.spec.ts`
- MODIFY: `dev-manager-desk/src/app/modules/projects/components/project-editor-dialog/project-editor-dialog.ts`
- MODIFY: `dev-manager-desk/src/app/modules/projects/components/project-editor-dialog/project-editor-dialog.spec.ts`
- MODIFY: `dev-manager-desk/src/app/modules/projects/pages/projects-page/projects-page.ts`
- MODIFY: `dev-manager-desk/src/app/modules/projects/pages/projects-page/projects-page.html`
- MODIFY: `dev-manager-desk/src/app/modules/projects/pages/projects-page/projects-page.spec.ts`
- MODIFY: `dev-manager-backend/tests/Feature/Kanban/ProjectTest.php` (2 new tests)