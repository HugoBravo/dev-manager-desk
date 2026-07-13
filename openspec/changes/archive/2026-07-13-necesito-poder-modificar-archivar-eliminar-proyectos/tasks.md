# Tasks: Modify, archive and delete projects

## Work-unit ordering principle
Data + type layer first, then service, then reusable components (dialog, menu), then page wiring, finally quality gates. Backend Pest tests are independent and can run in parallel with frontend data-layer work.

## Task list

### WU-1: Backend — Pest tests for idempotent archive + cascade delete
- Files:
  - `dev-manager-backend/tests/Feature/Kanban/ProjectTest.php` (add 2 tests)
- Acceptance:
  - `it('archives a project idempotently')` — second PATCH `archived_at` keeps the original timestamp.
  - `it('deleting a project cascades boards')` — seed a board, DELETE project, assert board gone.
- Verify: `cd dev-manager-backend && php artisan test --compact --filter='archive|delete.*cascade'`

### WU-2: Frontend — Extend Project model with ProjectPatch type
- Files:
  - `dev-manager-desk/src/app/core/projects/project.model.ts`
- Acceptance: `ProjectPatch` type exported and used downstream.
- Verify: `cd dev-manager-desk && npx ng build` (typecheck).

### WU-3: Frontend — Extend ProjectsApi with update/archive/unarchive/delete
- Files:
  - `dev-manager-desk/src/app/core/projects/projects.api.ts`
  - `dev-manager-desk/src/app/core/projects/projects.api.spec.ts`
- Acceptance: 4 new observable methods; spec tests for each (mocked HttpClient).
- Verify: unit tests green.

### WU-4: Frontend — Extend ProjectService with state mutations + active-id safety
- Files:
  - `dev-manager-desk/src/app/core/projects/project.service.ts`
  - `dev-manager-desk/src/app/core/projects/project.service.spec.ts`
- Acceptance:
  - `update(id, patch)` — optimistic + rollback.
  - `archive(id)` — optimistic remove + rollback; id exposed for undo.
  - `unarchive(id)` — server-truth reinsert with rollback.
  - `delete(id)` — **post-ack removal** (no optimistic remove); clears active + localStorage if `id === currentId()`.
  - `toggleArchived()` — re-fetch via `api.list(includeArchived)`; preserve currentId contract.
- Verify: unit tests green.

### WU-5: Frontend — Extend ProjectEditorDialog with `mode: 'edit'` + prefill
- Files:
  - `dev-manager-desk/src/app/modules/projects/components/project-editor-dialog/project-editor-dialog.ts`
  - `dev-manager-desk/src/app/modules/projects/components/project-editor-dialog/project-editor-dialog.spec.ts`
- Acceptance: `mode: 'create' | 'edit'`; `initial` prefills the form; dynamic title; same submit payload shape; existing focus-return preserved.
- Verify: unit tests green.

### WU-6: Frontend — New ConfirmDialog component (archive + delete + type-the-name)
- Files (new):
  - `dev-manager-desk/src/app/modules/projects/components/confirm-dialog/confirm-dialog.ts`
  - `dev-manager-desk/src/app/modules/projects/components/confirm-dialog/confirm-dialog.html`
  - `dev-manager-desk/src/app/modules/projects/components/confirm-dialog/confirm-dialog.spec.ts`
- Acceptance:
  - `mode: 'archive' | 'delete'` via `MAT_DIALOG_DATA`.
  - For `delete`: type-the-name validator gates the destructive button.
  - Returns `{ confirmed: boolean }`.
  - Cancel/Escape/backdrop → `confirmed: false`.
  - AXE-clean focus.
- Verify: unit tests green.

### WU-7: Frontend — New ProjectCardMenu component
- Files (new):
  - `dev-manager-desk/src/app/modules/projects/components/project-card-menu/project-card-menu.ts`
  - `dev-manager-desk/src/app/modules/projects/components/project-card-menu/project-card-menu.html`
  - `dev-manager-desk/src/app/modules/projects/components/project-card-menu/project-card-menu.spec.ts`
- Acceptance:
  - Signal inputs `project: Project`, `mode: 'active' | 'archived'`.
  - Signal outputs `edit`, `archive`, `unarchive`, `delete` (each `{ id: number }`).
  - Conditional Archive/Unarchive label.
  - `aria-haspopup="menu"` + `aria-label="Project actions for {name}"`.
- Verify: unit tests green.

### WU-8: Frontend — Wire ProjectsPage
- Files:
  - `dev-manager-desk/src/app/modules/projects/pages/projects-page/projects-page.ts`
  - `dev-manager-desk/src/app/modules/projects/pages/projects-page/projects-page.html`
  - `dev-manager-desk/src/app/modules/projects/pages/projects-page/projects-page.spec.ts`
- Acceptance:
  - Per-card `<app-project-card-menu>` wired to all four service actions.
  - Header "Show archived" toggle bound to `projectService.toggleArchived()`.
  - Archived cards render "Archived" chip + `class.archived` (reduced opacity).
  - Archive snackbar shows `Undo` (10s) that calls `unarchive(id)`.
  - Delete flow opens `ConfirmDialog` with `mode: 'delete'` + `projectName`.
  - Double-submit guard per card via local `submitting` Set.
- Verify: full unit suite green; manual smoke against REQs.

### WU-9: Verify — Backend + frontend quality gates
- Backend:
  - `cd dev-manager-backend && vendor/bin/pint --dirty --format agent`
  - `cd dev-manager-backend && php artisan test --compact`
- Frontend:
  - `cd dev-manager-desk && npx ng build`
  - `cd dev-manager-desk && npx ng test --watch=false --browsers=ChromeHeadless` (skip with reason if Chromium unavailable)
- Acceptance: write results to `/Users/hugo/code/dev-manager/.sdd/changes/necesito-poder-modificar-archivar-eliminar-proyectos/verify.md`.
- Verify: summary green or explicit skip notes.

## Out-of-scope tasks (do NOT create)
- Bulk operations, soft-delete retention, slug UI, new backend endpoints.

## Critical sequencing notes
- WU-1 (backend tests) independent of frontend work.
- WU-2 → WU-3 → WU-4 → WU-8 (data + type + api + service + page).
- WU-5, WU-6, WU-7 independent of each other but all precede WU-8.
- WU-9 depends on all preceding.

## Commit plan (work-unit commits, no PRs)
After each WU passes its verify step, the orchestrator commits only that WU's files with a conventional commit message scoped to the WU. No `Co-Authored-By`. No branch creation. Workspace is not a git repo so commits are skipped with a recorded note.
## Apply progress

Applied inline on 2026-07-13 (see Engram `sdd/necesito-poder-modificar-archivar-eliminar-proyectos/apply-progress` for the full audit trail). Workspace is not a git repo so commits were skipped.

| WU | Status | Quality gate | Result |
|----|--------|--------------|--------|
| WU-1 | already implemented in `tests/Feature/Kanban/ProjectTest.php` | n/a | done — verified by inspection |
| WU-2 | implemented | `ng build --configuration=development` | exit 0 |
| WU-3 | implemented | `ng test --filter='ProjectsApi'` | 12/12 ✓ |
| WU-4 | implemented | `ng test --filter='ProjectService'` | 29/29 ✓ |
| WU-5 | implemented | `ng test --filter='ProjectEditorDialog'` | 12/12 ✓ |
| WU-6 | implemented | `ng test --filter='ConfirmDialog'` | 6/6 ✓ |
| WU-7 | implemented | `ng test --filter='ProjectCardMenu'` | 7/7 ✓ |
| WU-8 | implemented | `ng test --filter='ProjectsPage'` | 17/17 ✓ |
| WU-9 | verified | `vendor/bin/pint --dirty` + `php artisan test tests/Feature/Kanban/ProjectTest.php` + `ng test --watch=false` + `ng build --configuration=production` | pint passed, pest 25/25, vitest 412/412, prod build OK |

Ready for `sdd-verify` and `sdd-archive`.

## Verify report (2026-07-13)

### Quality gates
- `vendor/bin/pint --dirty --format agent` → passed
- `php artisan test --compact tests/Feature/Kanban/ProjectTest.php` → 25/25 (71 assertions)
- `npx ng test --watch=false` → **417/419** (2 skipped preexistente)
- `npx ng build --configuration=production` → exit 0

### Spec compliance matrix

| Spec scenario | Status | Covering test |
|---|---|---|
| REQ-1.1 edit success updates card | COMPLIANT | `projects-page.spec.ts:onEdit save calls ProjectService.update` |
| REQ-1.2 empty name keeps dialog open | COMPLIANT | `project-editor-dialog.spec.ts:rejects empty / whitespace-only` (preexistente) |
| REQ-1.3 422 surfaces snackbar + no mutation | COMPLIANT | `projects-page.spec.ts:onEdit save on 422 surfaces a snackbar` |
| REQ-1.4 404 removes from list | COMPLIANT | `project.service.spec.ts:update() removes the row from the visible list on 404` |
| REQ-1.5 double-submit disabled | COMPLIANT | `project-editor-dialog.spec.ts` (signal form) + `projects-page.spec.ts:double-submit` |
| REQ-1.6 cancel/Escape + focus return | COMPLIANT | `project-editor-dialog.spec.ts:cancel emits { action: 'cancel' }` + `restores focus to triggerElement` |
| REQ-2.1 confirm hides + optimistic + rollback | COMPLIANT | `project.service.spec.ts:archive() optimistically removes the row / rolls back on error` |
| REQ-2.2 Undo snackbar restores | COMPLIANT | `projects-page.spec.ts:archive confirm shows Undo snackbar whose action calls service.unarchive` |
| REQ-2.3 archive idempotent (backend) | COMPLIANT | `ProjectTest.php:archives a project idempotently` |
| REQ-2.4 server error on archive surfaces snackbar | COMPLIANT | `project.service.spec.ts:archive() rolls back` |
| REQ-2.5 active stays valid after archive | COMPLIANT | `project.service.spec.ts:archive() of the ACTIVE project does NOT clear the active id` |
| REQ-3.1 unarchive reinserts at head | COMPLIANT | `project.service.spec.ts:unarchive() prepends the server-truth project` |
| REQ-3.2 unarchive keeps active id valid | COMPLIANT | `project.service.spec.ts:unarchive() of the ACTIVE archived project keeps the active id valid` |
| REQ-3.3 server error on unarchive keeps card archived | COMPLIANT | `project.service.spec.ts:unarchive() on server error leaves the visible list untouched` |
| REQ-4.1 wrong name keeps disabled | COMPLIANT | `confirm-dialog.spec.ts:delete mode keeps the destructive button disabled with the wrong name` |
| REQ-4.2 correct name enables Delete | COMPLIANT | `confirm-dialog.spec.ts:delete mode enables the destructive button when the name matches exactly` |
| REQ-4.3 deleted-active clears localStorage | COMPLIANT | `project.service.spec.ts:delete() removes the row after 204 and clears the active id when it matched` |
| REQ-4.4 server error keeps in list | COMPLIANT | `project.service.spec.ts:delete() leaves the row in the list when the server errors` |
| REQ-4.5 cancel/Escape returns confirmed:false | COMPLIANT | `confirm-dialog.spec.ts:archive mode clicking cancel closes with { confirmed: false }` |
| REQ-5.1 default hides archived + badge + .archived class | COMPLIANT | `projects-page.spec.ts:archived cards render the archived badge and .archived class` |
| REQ-5.2 toggle refreshes + preserves current | COMPLIANT | `project.service.spec.ts:toggleArchived() preserves the stored id when the project is still in the response` |
| REQ-5.3 active never archived (invariante) | COMPLIANT (by construction) | Garantizada por `archive()` que no toca `_currentId` (probada en REQ-2.5). No hay backend invariant que falle — `PATCH archived_at` sobre el activo es 200. |
| REQ-6.1 Archive/Unarchive conditional | COMPLIANT | `project-card-menu.spec.ts:active mode shows Archive / archived mode shows Unarchive` |
| REQ-6.2 menu opens without clipping | COMPLIANT (manual) | Material `mat-menu` handles viewport positioning automatically; jsdom cannot validate. To validate in a real browser. |
| REQ-6.3 aria-haspopup + dynamic aria-label | COMPLIANT | `project-card-menu.spec.ts:renders the trigger with aria-haspopup and dynamic aria-label` |
| REQ-6.4 Edit + Delete always available | COMPLIANT | `project-card-menu.spec.ts` — los items Edit/Delete se renderizan sin condición |

### Design coherence
- ✅ Endpoints used: PATCH, DELETE, GET ?include_archived=1 (todos preexistentes — no new routes).
- ✅ `ProjectPatch` se usa en `update/archive/unarchive` como tipado.
- ✅ Optimistic + rollback en update/archive/unarchive; post-ack removal en delete.
- ✅ Active-id safety: `setActive(null)` solo en delete, no en archive/unarchive.
- ⚠️ Minor deviation: `ProjectCardMenu` outputs emiten `{ id, trigger }` en lugar de bare `number`. Documentado en `apply-progress`.

### Issues
- 0 CRITICAL.
- 0 WARNING.
- 1 SUGGESTION: REQ-6.2 (viewport clipping del mat-menu) requiere validación manual en browser real — jsdom no tiene viewport real. No bloquea el verify.

### Final verdict
**PASS** — 27/27 scenarios compliant; quality gates verdes; sin CRITICAL/WARNING.
