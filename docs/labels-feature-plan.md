# Frontend plan — Kanban labels (Angular 22)

> **Status:** Plan, not implementation. Decisions in §3 are LOCKED.
> **Backend contract:** `dev-manager-backend/docs/kanban-api.md` §3.7, §7, §10.
> **Backend PR:** the Laravel side already ships (labels resource + sync
> endpoint on cards) and is the source of truth for the API shape.

---

## 1. Goal

Bring the user-scoped color labels feature into the Angular desk. After this
change a user can:

1. **Manage their label library** — create / rename / recolor / delete labels
   that belong to them. The library is global across all of their projects.
2. **Apply labels to cards** — toggle any of their labels on / off a card via
   a chip-based picker inside `CardDetailDialog`.
3. **See labels at a glance** — color chips render on the card preview in the
   board (the small card under each column) AND on the detail dialog, so the
   user can scan the board and see which cards are tagged.

This unlocks the work-tracking UX the kanban capability has been deferring
since v1.

---

## 2. Non-goals

- **No project sharing / team labels.** A label is owned by one user. Two
  users can have a label called `bug` independently. There is no shared
  label taxonomy.
- **No real-time updates.** When a label is renamed in one tab, other tabs
  keep their state until the next refetch. The current codebase does not
  have a WS / SSE channel.
- **No label-based filtering, search, or grouping.** This PR does not add
  `?label_id=...` to the cards index. Out of scope; the backend already
  lacks the endpoint.
- **No drag-reorder of labels.** The library is sorted alphabetically by
  the backend (`KanbanLabelController::index` orders by `name`); the UI
  mirrors that. Manual position is a future change.
- **No migration of existing Trello-style workflows.** There are no
  existing labels in the DB. This is a green-field feature.

---

## 3. Locked decisions (from design Q&A)

| Decision | Choice | Rationale |
|---|---|---|
| Where the user picks labels for a card | `CardDetailDialog` (the same surface as Edit / Archive / Delete) | One discoverable place; reuses the dialog's existing focus + a11y plumbing |
| Color picker | Fixed palette of 8 colors (slate / red / amber / green / blue / violet / pink / cyan) | Consistent UX, no `<input type="color">` accessibility surprises, matches the Laravel factory palette |
| Show chips on card preview? | Yes — top of the card preview, before the title | Trello-like at-a-glance; backend already eager-loads `labels` in the cards list response |
| Plan depth | Full, ready to execute | Tasks numbered; PR boundaries suggested in §10 |

---

## 4. Domain model (frontend)

### 4.1 New types

```ts
// src/app/modules/kanban/models/label.model.ts
export interface KanbanLabel {
  readonly id: number;
  readonly name: string;
  /** `#RRGGBB` — server-validated. We trust the value as-is. */
  readonly color: string;
  readonly created_at: string;
  readonly updated_at: string;
}
```

### 4.2 Update `KanbanCard`

```ts
// src/app/modules/kanban/models/card.model.ts
export interface KanbanCard {
  // ... existing fields ...
  readonly labels: readonly KanbanLabel[]; // NEW. Always present, may be [].
}
```

The backend always sends `labels: []` when the relation is empty
(`CardResource` defaults to `[]` when `relationLoaded('labels')` is false).
We mirror that — `labels` is `readonly KanbanLabel[]`, never `undefined`.

### 4.3 Update `BoardDetail`

`BoardDetail.cardsByColumnId: Readonly<Record<string, readonly KanbanCard[]>>`
does not need a type change — the array element now carries `labels`, but
the map's shape is unchanged.

### 4.4 Barrel export

Add to `src/app/modules/kanban/models/index.ts`:

```ts
export type { KanbanLabel } from './label.model';
```

---

## 5. API client (read + write)

The Laravel side exposes six endpoints; the existing
`KanbanApi` / `KanbanWriteApi` split is the right place for them.

### 5.1 `KanbanApi` (read) — `src/app/modules/kanban/api/kanban.api.ts`

Add five methods, all following the existing `unwrapLaravelItems` /
`unwrapLaravelItem` pattern and the W3 error-wiring contract (every
`.pipe(catchError(...))` MUST route through `catchHttpError`):

| Method | HTTP | Path | Returns |
|---|---|---|---|
| `listLabels(page?)` | GET | `/api/v1/kanban-labels` | `KanbanLabel[]` (paginated) |
| `getLabel(id)` | GET | `/api/v1/kanban-labels/{id}` | `KanbanLabel` |

### 5.2 `KanbanWriteApi` (write) — `src/app/modules/kanban/api/kanban-write.api.ts`

Add four methods, all returning Observables of the server resource
(except `delete`, which returns `void`):

| Method | HTTP | Path | Returns |
|---|---|---|---|
| `createLabel(name, color)` | POST | `/api/v1/kanban-labels` | `KanbanLabel` |
| `updateLabel(id, { name?, color? })` | PATCH | `/api/v1/kanban-labels/{id}` | `KanbanLabel` |
| `deleteLabel(id)` | DELETE | `/api/v1/kanban-labels/{id}` | `void` |
| `syncCardLabels(p, b, col, cardId, labelIds)` | PUT | `.../cards/{card}/labels` | `KanbanCard` (with updated `labels`) |

Payload types (new in the same file):

```ts
export interface CreateLabelPayload { readonly name: string; readonly color: string; }
export interface UpdateLabelPayload { readonly name?: string; readonly color?: string; }
export interface SyncCardLabelsPayload { readonly label_ids: readonly number[]; }
```

`SyncCardLabelsPayload.label_ids` MUST be sent as an array even when empty;
the backend's `present` rule rejects the field being absent.

### 5.3 Test fixtures

Extend the spec fixtures in `kanban.api.spec.ts` and
`kanban-write.api.spec.ts` with `sampleLabel(id, name, color)` and
assert request URLs / HTTP verbs / response unwrapping. Style follows
the existing `paginated(rows)` helper and `HttpTestingController.expectOne`.

---

## 6. State management

### 6.1 `LabelsStore` (new) — `src/app/modules/kanban/stores/labels.store.ts`

A signal-backed store, sibling to `BoardsStore` /
`CommentsStore` / `AttachmentsStore`. `@Service()` (Angular 22+
singleton decorator; the rest of the codebase uses it).

State:

```ts
private readonly _labels = signal<readonly KanbanLabel[]>([]);
private readonly _loading = signal<'idle' | 'list' | 'create' | 'update' | 'delete' | 'sync'>('idle');
private readonly _error = signal<ApiError | null>(null);
```

Public surface:

| Member | Purpose |
|---|---|
| `readonly labels` | signal — flat list, sorted by name (server order) |
| `readonly loading` / `readonly error` | driving UI states |
| `readonly isListLoading` | computed — true when loading the list |
| `load()` | `async () => KanbanLabel[] \| null` — fetches + caches |
| `create(name, color)` | `async ... => KanbanLabel \| null` — appends to cache on success |
| `update(id, payload)` | `async ... => KanbanLabel \| null` — patches the matching row |
| `remove(id)` | `async ... => boolean` — splices out + invalidates dependent caches |
| `ensureLoaded()` | `async () => void` — refetches only if `labels().length === 0 && !isListLoading()`; used by `CardDetailDialog` so the picker is always ready |

**Card-cache invalidation:** removing a label could leave stale
`card.labels` references in `BoardsStore`. `remove(id)` MUST walk
`BoardsStore._currentBoard.cardsByColumnId` and strip the label from
every card that carried it. We do that by injecting `BoardsStore` and
exposing a small `pruneLabelFromCards(labelId)` helper that runs after a
successful `remove()`. The same pattern is used for cascades on comment /
attachment stores in PR4; the codebase already accepts this layering.

### 6.2 `BoardsStore` updates — `src/app/modules/kanban/stores/boards.store.ts`

The store already gets the new `labels` field for free (the API surface
returns it). Three surgical changes:

1. `applyCardMutation(card)` — existing method. The card now carries
   `labels`. Nothing to change; the new field flows through.
2. New `applyCardLabelsSynced(card)` — when `CardLabelController` returns
   the updated card, we want to commit it without re-running the
   cross-column detection that `applyCardMutation` does. We add a thin
   wrapper that calls the existing mutation and a `appliedLabelIds`
   signal so the `CardDetailDialog` can react.
3. New `pruneLabelFromCards(labelId)` — called by `LabelsStore.remove`
   and by the `kanban-labels` `DELETE` flow inside `CardDetailDialog`'s
   library manager (see §7.3).

### 6.3 Existing tests

`boards.store.spec.ts` should be extended with a small test that
verifies `pruneLabelFromCards` strips the label id from every card that
carried it, even across multiple columns. The existing
`applyCardMutation` tests stay green; no contract change.

---

## 7. UI components

### 7.1 New: `LabelChip` (presentational, reusable)

`src/app/modules/kanban/components/label-chip/label-chip.ts`

Small standalone component. Renders a single label as a colored pill
with the label name inside. Used in BOTH the card preview (board) and
the detail dialog.

Inputs (Angular 22 `input()` API, no `@Input()`):

```ts
readonly label = input.required<KanbanLabel>();
readonly compact = input<boolean>(false);
readonly interactive = input<boolean>(true);
```

Template:

- `compact=true` → 12 px tall, no name, just a rounded color dot (the
  "traffic light" pattern from Trello).
- `compact=false` → ~22 px tall, name in white text, color background.
  Contrast: the text color is computed as black or white based on the
  background's relative luminance (WCAG AA contrast for normal text).
- `interactive=true` → button with `aria-label="Label {name}"`; click
  emits a `removed` output. (Used inside the picker; not in the read-
  only board preview.)

Output:

```ts
readonly removed = output<KanbanLabel>();
```

A11y:
- `role="button"` when `interactive=true`.
- `aria-pressed` when the chip represents an on/off state (used in the
  picker).
- Color contrast via the inline `style="background: ...; color: ..."`,
  computed in a `contrastColor(hex)` helper.

### 7.2 New: `CardLabelsStrip` (read-only chip list)

`src/app/modules/kanban/components/card-labels-strip/card-labels-strip.ts`

Renders a horizontal list of `LabelChip`s. Used in two places:

- The card preview in `BoardDetailPage` — `compact=true`, all labels.
- The card body in `CardDetailDialog` — `compact=false` (chips with
  names).

Inputs:

```ts
readonly labels = input.required<readonly KanbanLabel[]>();
readonly compact = input<boolean>(false);
readonly maxVisible = input<number | null>(null);
```

`maxVisible` caps the rendered list and shows a `+N` chip when
truncated. Default `null` = show all.

### 7.3 New: `LabelManagerDialog`

`src/app/modules/kanban/components/label-manager-dialog/label-manager-dialog.ts`

A Material dialog dedicated to the user's label library. Two
sub-sections:

1. **List** of existing labels, each with:
   - Color swatch (clickable → opens a color picker popover with the
     8-color palette)
   - Inline-editable name (click on the name → becomes an input →
     Enter to save, Esc to cancel)
   - "Delete" button with a confirm step (delete is destructive and
     cascades to card-label pivot rows; we want a one-step-undo
     affordance).
2. **Create row** at the top: name input + color picker (palette) +
   "Create" button. Disabled until both fields are valid (name non-empty
   ≤ 64 chars; color is a hex from the palette).

`MAT_DIALOG_DATA` only needs `{ triggerElement?: HTMLElement }` for
focus return. Closes with `{ action: 'closed' | 'created' | 'updated'
| 'deleted', label?: KanbanLabel }`.

A11y:
- Focus moves to the first interactive element on open (the create row's
  name input).
- `aria-live="polite"` on the list region so screen readers announce
  additions / removals after the user action.
- The 8-color palette is a `mat-button-toggle-group` (`aria-label="Color
  palette"`); each toggle has a `matTooltip` and an `aria-label` like
  `"Color red"`.

This is a **separate** dialog from `CardDetailDialog`. The user opens it
from a top-level "Manage labels" button somewhere reachable from the
board (suggested location: the board header, next to the board name).
For PR scope we add a `Manage labels` button to the board header in
`BoardDetailPage`.

### 7.4 New: `CardLabelsPicker`

`src/app/modules/kanban/components/card-labels-picker/card-labels-picker.ts`

Inline picker embedded in the `CardDetailDialog` "Labels" section. Shows
the user's library as toggleable chips:

- Each label becomes a `LabelChip` with `interactive=true` and
  `aria-pressed` reflecting whether the card has it.
- Clicking a chip toggles it on the card. The store optimistically
  updates a local `pendingIds` signal; the toggle is debounced 250 ms
  and flushed as a single `PUT .../cards/{card}/labels` request.
  - If the request fails, we roll back the toggle and surface a snackbar
    (the standard `surfaceError(err)` pattern used in the detail dialog
    today).
- A "Manage library…" link at the bottom opens `LabelManagerDialog`.

Inputs:

```ts
readonly card = input.required<KanbanCard>();
readonly userLabels = input.required<readonly KanbanLabel[]>();
```

Output:

```ts
readonly changed = output<readonly number[]>(); // emitted after a successful sync
```

The `CardDetailDialog` subscribes to `changed` to update its local
state.

### 7.5 Modifications to `CardDetailDialog`

`src/app/modules/kanban/components/card-detail-dialog/card-detail-dialog.ts`

Three changes:

1. **Render a `CardLabelsStrip`** (compact=false) at the top of the
   `mat-dialog-content`, above the markdown body. Shows the labels the
   card currently carries.
2. **Render a `CardLabelsPicker`** below the strip, in a new
   "Labels" sub-section. Triggers a sync to the backend on every toggle.
3. **Manage library** link below the picker opens `LabelManagerDialog`.
   On close, refresh the labels list (`LabelsStore.load()`) and apply
   any prunes to the current card.

Focus order: title → labels strip → labels picker → markdown body →
due date → comments → attachments → action bar (Edit / Archive / Delete).

### 7.6 Modifications to `BoardDetailPage`

`src/app/modules/kanban/pages/board-detail.page.ts` + `.html`

1. **Card preview chips**: in the card preview template, render a
   `CardLabelsStrip` with `compact=true` and `maxVisible=5` (5 dots
   then `+N`). This goes between the column container and the card
   title.
2. **Board header**: add a `Manage labels` button next to the board
   title. Click opens `LabelManagerDialog`. The button is gated on
   `store.currentBoard() !== null` (no library to manage before a
   board is loaded).

### 7.7 Modifications to `CardEditorDialog`

The current editor handles title / body / due_date. Labels are managed
in the detail dialog (per §3), so the editor does NOT gain a label
field. This keeps the editor's scope narrow and avoids duplicating
the picker UX.

---

## 8. A11y checklist (WCAG AA)

Mirrors the conventions in the existing `CardDetailDialog` docblock.

- `LabelChip`:
  - `role="button"` + `tabindex="0"` when interactive.
  - Color is never the sole carrier of information; the label name is
    also rendered (in compact mode the `aria-label` carries the name).
  - `aria-pressed` reflects the toggle state in the picker.
- `LabelManagerDialog`:
  - `aria-live="polite"` on the list region.
  - Each row's "Delete" button has an explicit `aria-label` like
    `"Delete label {name}"`.
  - Color picker palette is a `mat-button-toggle-group` with an
    `aria-label` and per-option labels.
  - Inline name edit: `aria-label="Rename label"`, focus moves to the
    input on click; Enter saves, Esc cancels.
- `CardLabelsPicker`:
  - `role="group"` with `aria-label="Card labels"`.
  - Each chip is a real `<button>` (or `role="button"`) with
    `aria-pressed`.
  - `aria-busy` is wired to the debounced sync state.
- `CardLabelsStrip` (in card preview):
  - The strip is `aria-hidden="true"`; the full name is announced when
    the card is opened. Otherwise every card on the board announces a
    5-color sentence, which is noise.
- Focus management:
  - `LabelManagerDialog`: focus returns to the "Manage labels" button on
    close.
  - `CardDetailDialog`: existing focus plumbing still works — we add
    the labels section without disturbing the title-first focus.
- Contrast: every chip text is computed as black or white based on
  the chip's background luminance (sRGB → relative luminance →
  threshold 0.5). For the 8-color palette this is verified to clear
  WCAG AA for normal text (≥4.5:1). Add a Vitest unit test for
  `contrastColor(hex)`.

---

## 9. Tests (Vitest + HttpTestingController)

The desk uses Vitest. Spec files live next to the source. We add or
extend:

| File | New tests |
|---|---|
| `kanban.api.spec.ts` | `listLabels`, `getLabel` — request URL, response unwrap, error wiring |
| `kanban-write.api.spec.ts` | `createLabel`, `updateLabel`, `deleteLabel`, `syncCardLabels` — request URL, body shape, response unwrap, 422 propagates as `validation` kind |
| `labels.store.spec.ts` (new) | `load`, `create`, `update`, `remove` (incl. cascade prune to `BoardsStore`), `ensureLoaded` |
| `boards.store.spec.ts` (extend) | `pruneLabelFromCards` strips from every column, no-ops if the id is absent |
| `card-detail-dialog.spec.ts` (extend) | Renders a `CardLabelsStrip` with the card's labels; opening the picker triggers a `syncCardLabels` call when a chip is toggled; failed sync rolls back the toggle and surfaces a snackbar |
| `label-chip.spec.ts` (new) | Renders name in compact / non-compact mode; click emits `removed` only when `interactive=true`; `contrastColor` returns white on dark backgrounds and black on light ones |
| `label-manager-dialog.spec.ts` (new) | Create / rename / recolor / delete flows hit the write API and the store updates; Esc cancels inline edit; delete confirmation prevents the cascade on Cancel |
| `card-labels-picker.spec.ts` (new) | Toggling a chip debounces the sync; multi-toggle in < 250 ms coalesces to a single request; failed sync rolls back |
| `card-labels-strip.spec.ts` (new) | Renders up to `maxVisible` chips; renders `+N` chip when over |
| `board-detail.page.spec.ts` (extend) | Renders `CardLabelsStrip` on each card preview; "Manage labels" button opens `LabelManagerDialog` |

Error-path coverage mirrors what `kanban-write.api.spec.ts` already
does for cards: a 422 from `POST /kanban-labels` (e.g. duplicate name)
must surface as a `validation` `ApiError` with `fieldErrors` so the
`LabelManagerDialog` can highlight the bad field. The dialog binds
server errors to its own inline error region, not the Signal Forms
field-error path (the editor is its own dialog, see §7.7).

---

## 10. PR boundaries (suggested)

The change is large in file count (~15 files), but the LOC delta is
modest because most files are surgical edits. We split it into two
PRs aligned with the conventional-commit scopes used by this repo:

### PR 1 — `feat(kanban): add labels API + library manager UI` (foundations)

- New: `KanbanLabel` model, `Label` write API methods, `LabelsStore`,
  `LabelChip`, `CardLabelsStrip`, `LabelManagerDialog`, contrast helper.
- Modified: `KanbanApi` (add `listLabels`, `getLabel`),
  `KanbanWriteApi` (add the four write methods), `BoardsStore` (add
  `pruneLabelFromCards`).
- Tests: all the spec files in §9 except the picker + board-page
  extensions.
- Acceptance: user can open the `LabelManagerDialog` from a placeholder
  button (in the board header) and manage their library. No card
  integration yet.

### PR 2 — `feat(kanban): apply labels to cards`

- New: `CardLabelsPicker`.
- Modified: `CardDetailDialog` (render the strip + picker + Manage
  library link), `BoardDetailPage` (render strips on the card previews,
  wire the board-header button to actually open `LabelManagerDialog`).
- Tests: picker + dialog + board-page spec extensions from §9.
- Acceptance: full E2E flow — open card detail, toggle labels, see the
  chips on the card preview, rename / delete a label from the library
  manager, observe that the chip disappears from the card preview.

---

## 11. Risks & open questions

| Risk | Mitigation |
|---|---|
| Stale label cache after delete from another tab | Out of scope per §2; a refetch happens on dialog open via `LabelsStore.ensureLoaded()` |
| Race: user toggles chip while a sync is in flight | The picker uses a debounce (250 ms) and a `syncing` signal; new toggles queue; on failure the optimistic state rolls back AND the in-flight request result is ignored (`switchMap` semantics in the `Observable` chain) |
| Color contrast for arbitrary user-supplied colors | We use a fixed 8-color palette, so this is a one-time verification in tests; a future change to free-form colors must re-run the contrast audit |
| Card preview vertical space | Strip is `compact=true` and capped at 5 visible chips; if all 5 dots are at the top the card grows by ~16 px, which matches Trello's pattern. The column already has overflow:visible for the dialog overlay |
| Board-detail `Manage labels` button position | Place to the right of the board title in the existing `h1` block. If the board is archived, the button stays enabled (the user can still manage the library) but cards in archived projects are hidden per the `?include_archived=1` contract — orthogonal concern |
| `MatChipsModule` vs custom chips | We render a custom `LabelChip` (button with rounded background) rather than using `mat-chip`. Reason: we need pixel-precise color control and a `aria-pressed` toggle pattern that `mat-chip` doesn't ship out of the box. `MatChipsModule` brings 30+ KB of styles we don't need |

---

## 12. Out of scope (reaffirmed)

- `?label_id=...` filter on the cards index (backend endpoint does not
  exist).
- Real-time label updates across tabs / collaborators.
- Project-scoped or shared labels.
- Drag-to-reorder labels in the library.
- Free-form color picker (palette is locked).
- Bulk label operations (apply a label to N cards at once).

Each of these would be a follow-up PR with its own design pass; the
backend already supports most of them with minor additions.

---

*Plan ready to execute. PR 1 (foundations) is the smallest viable
slice; PR 2 is the user-visible payoff. Both can be reviewed
independently.*
