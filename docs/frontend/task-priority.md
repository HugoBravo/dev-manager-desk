# Add task priority to the Angular client

The backend now persists and returns task priority as exactly `HIGH`, `MEDIUM`, or `LOW`. The Angular client should add that uppercase contract to its task model, API payloads, editor, list presentation, and tests; new tasks default to `MEDIUM`, while updates that omit priority preserve the current value.

## Quick path

1. **Extend the task model.** Add a `TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW'` type, add `priority` to `Task`, and include it in `TaskPatch` and task summaries where they are rendered.
2. **Preserve the API wire format.** Send uppercase values unchanged from `TasksApi.create()` and `TasksApi.update()`. Allow create to omit the field when the UI intentionally accepts the backend `MEDIUM` default; omit it on update only when priority is unchanged.
3. **Add the editor control.** Extend `TaskFormModel` in `task-editor-dialog.ts` with a three-option priority radiogroup that mirrors the existing segmented status control and initializes new tasks to `MEDIUM`.
4. **Present priority in task lists.** Show a readable label for every task without introducing priority sorting or filtering. Do not use color as the only signal.
5. **Lock the contract with tests.** Update model fixtures, API create/update tests, editor interaction tests, list rendering tests, and accessibility checks for all three values, the `MEDIUM` default, omitted updates, and HTTP 422 errors.

## Contract details

| Topic | Contract |
|---|---|
| Wire values | Uppercase strings only: `HIGH`, `MEDIUM`, `LOW` |
| Create default | Omitting `priority` stores and returns `MEDIUM` |
| Update omission | Omitting `priority` leaves the existing value unchanged |
| Validation | `URGENT`, lowercase values such as `high`, and `null` return HTTP 422 with `errors.priority` |
| Responses | Every task resource includes `data.priority` |
| Storage/API type | Plain string union; do not introduce a frontend numeric mapping |
| Current scope | Display and edit only; no priority sort, filter, or new endpoint |

## Frontend touchpoints

| File | Required change |
|---|---|
| `src/app/core/tasks/task.model.ts` | Add `TaskPriority`; expose `Task.priority`; include priority in writable and summary types as needed. |
| `src/app/core/tasks/tasks.api.ts` | Keep POST/PATCH payloads uppercase and response typing aligned with the backend resource. |
| `src/app/modules/tasks/components/task-editor-dialog/task-editor-dialog.ts` | Add priority to the Signal Form model, initialize create to `MEDIUM`, preserve edit values, and return priority in the saved patch. |
| `src/app/modules/tasks/pages/tasks-list.page.ts` | Render a text/icon priority indicator without adding sort or filter behavior. |
| Existing `*.spec.ts` files beside those modules | Update fixtures and cover create, update, display, validation, omission, and accessibility behavior. |

## Accessible priority UX

Mirror the task editor's existing segmented status pattern while treating priority as an independent field:

- Give the group `role="radiogroup"` and an accessible label such as **Priority**.
- Give each option `role="radio"`, a stable accessible name, and `aria-checked` derived from the Signal Form value.
- Use roving `tabindex`: the selected option is `0`; the other options are `-1`.
- Support keyboard selection and movement expected from a radio group, including arrow keys, and keep a visible focus indicator.
- Pair any color treatment with visible text or an icon so priority is not communicated by color alone.
- Announce validation errors in the existing form error surface and return focus to the invalid control when appropriate.
- Verify the dialog and list with AXE and WCAG AA checks, including focus management and contrast.

## Angular constraints

| Area | Rule |
|---|---|
| Components | Keep standalone components, but do not add `standalone: true`; it is already the Angular default. |
| Change detection | Do not add explicit `ChangeDetectionStrategy.OnPush`; it is already the Angular 22 default. |
| State/forms | Continue using signals and Signal Forms; use `set()` or `update()`, never `mutate()`. |
| Inputs/outputs | Use `input()` and `output()` rather than decorators when component boundaries need them. |
| Templates | Use native `@if`, `@for`, and `@switch`; do not add structural directive equivalents. |
| Styling | Use `class` and `style` bindings instead of `ngClass` or `ngStyle`. |
| Host behavior | Put host bindings in the component `host` object instead of `@HostBinding` or `@HostListener`. |
| Types | Keep strict typing; use the `TaskPriority` union rather than `any` or unchecked strings. |

## Reviewer checklist

- [ ] `TaskPriority` permits only `HIGH`, `MEDIUM`, and `LOW`.
- [ ] Create sends an explicit selection or safely relies on the backend `MEDIUM` default.
- [ ] Update omission preserves the existing priority.
- [ ] API fixtures and task summaries include `priority`.
- [ ] The editor exposes a labelled, keyboard-operable radiogroup with correct `aria-checked` state.
- [ ] Priority remains understandable without color.
- [ ] Invalid and lowercase values surface backend HTTP 422 validation errors.
- [ ] AXE and WCAG AA checks pass.
- [ ] No priority sorting, filtering, endpoint, or unrelated frontend behavior was added.

## Next step

Plan the Angular implementation against the canonical Engram artifacts in project `dev-manager`:

- `sdd/task-priority-refactor/proposal`
- `sdd/task-priority-refactor/spec`

Use the backend contract tests in `tests/Feature/Tasks/TaskTest.php` and the migration contract in `tests/Feature/Migrations/CreateTasksTableTest.php` as executable references. This guide is a handoff only; the current backend change contains no frontend implementation.
