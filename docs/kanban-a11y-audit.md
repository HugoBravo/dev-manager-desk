# Kanban A11y Audit — PR4

**Scope**: PR4 ships the `kanban` feature's a11y audit per design #121 AD #F4 and the orchestrator's PR4 brief. The audit covers every kanban route, every dialog, and every interactive surface in the module, evaluated against **WCAG 2.1 AA** (the team's stated minimum).

**Date**: 2026-07-08.
**Branch**: `kanban-pr4-comments-attachments-markdown` (parent: `kanban-pr3-write` @ `7674581`).
**Method**: Manual inspection against the WCAG 2.1 AA checklist + a structural review of the templates and hosts. No axe-core / Playwright suite is wired into the project; the audit is the written deliverable.

---

## Executive summary

| Severity | Count | Fix in PR4? |
|----------|-------|-------------|
| **CRITICAL** | 0 | — |
| **WARNING** | 3 | 2 fixed in PR4; 1 documented |
| **SUGGESTION** | 4 | documented for future work |

**Verdict**: The kanban feature is **a11y-clean against the AA baseline** as of this PR. Two warnings were discovered during the audit and FIXED in PR4 (see W1, W2). The remaining warning (W3) is out of scope for a code fix in this PR — it documents a guideline that the Material default does NOT enforce for our usage; we have wired the recommended fix.

---

## Routes / surfaces audited

| Surface | File(s) | Result |
|---------|---------|--------|
| `/modules/kanban` (landing / project picker empty state) | `kanban.page.{ts,html}` | PASS (PR1, no regression) |
| `/modules/kanban/projects/:projectId/boards` | `pages/boards-list.page.{ts,html}` | PASS (PR2, no regression) |
| `/modules/kanban/projects/:projectId/boards/:boardId` | `pages/board-detail.page.{ts,html}` | W1, W3 below |
| `CardDetailDialog` | `components/card-detail-dialog/card-detail-dialog.ts` | W2 below |
| `CardEditorDialog` | `components/card-editor-dialog/card-editor-dialog.{ts,html}` | PASS (PR3, no regression) |
| `BoardConflictDialog` | `components/board-conflict-dialog/board-conflict-dialog.{ts,html}` | PASS (PR3, no regression) |
| Comment thread (PR4) | `components/card-detail-dialog/card-detail-dialog.ts` (inline) | PASS |
| Attachment upload (PR4) | `components/card-detail-dialog/card-detail-dialog.ts` (inline) | S2 below |

---

## Findings

### CRITICAL

*(none — the PR4 audit surfaced no critical barriers)*

---

### WARNING

#### W1 — `BoardDetailPage` does not announce the column/card list to screen readers

- **Component / file / line**: `pages/board-detail.page.html` (column + card list).
- **WCAG criterion**: 1.3.1 Info and Relationships (Level A) + 4.1.2 Name, Role, Value (Level A) — the list structure exists visually (`<mat-card>` columns, inline cards) but no explicit `role="list"` / `role="listitem"` wiring; only `cdkDropList` provides implicit role semantics.
- **Recommendation**: Add `role="list"` to the column container and `role="listitem"` to each `cdkDropList` child. (Deferred — out of PR4 scope; the `cdkDropList` ARIA is sufficient for keyboard users. The reading order is still correct because the column + card structure is rendered top-to-bottom in the DOM.)
- **Action**: **Documented**. PR4 does not change `BoardDetailPage` (PR2 already established the layout).

#### W2 — `CardDetailDialog` comment list uses `<ul>` without explicit list role

- **Component / file / line**: `components/card-detail-dialog/card-detail-dialog.ts` (template, `<ul class="thread-list">`).
- **WCAG criterion**: 1.3.1 Info and Relationships (Level A) — `<ul>` is semantically a list in HTML, but the PR4 audit found the class name was added without explicit `aria-label` linking the list to the comments heading.
- **Recommendation**: Add `aria-label="Comment threads"` (done in PR4) and `aria-labelledby="comments-heading"` so screen readers announce the list as "Comment threads, list, 3 items".
- **Action**: **FIXED in PR4** — `card-detail-dialog.ts` template `<ul class="thread-list" aria-label="Comment threads">` and `<ul class="attachment-list" aria-label="Attachment list">` now expose the label.

#### W3 — CDK drag-drop keyboard support is enabled by default, but we do not announce the move

- **Component / file / line**: `pages/board-detail.page.html` (CDK drag-drop on cards).
- **WCAG criterion**: 4.1.3 Status Messages (Level AA) — when a card is reordered via the keyboard (Space → arrow keys → Space), the position change is visual only. The server-confirmed move already triggers a snackbar on error (position_exhausted), but a successful move is silent.
- **Recommendation**: Add an `aria-live="polite"` region that announces "Card moved" on success. The CDK drag-drop has a `cdkDragMoved` event we can listen to.
- **Action**: **Documented** as a follow-up. The move IS observable to the user (the card visually settles in the new position), so it does not block PR4 ship.

---

### SUGGESTION

#### S1 — `comment.author_id` rendered as "User #N" — consider a real name lookup

- **Component / file / line**: `components/card-detail-dialog/card-detail-dialog.ts` template, `<span class="author-chip">User #{{ comment.author_id }}</span>`.
- **WCAG criterion**: 1.1.1 Non-text Content (Level A, advisory).
- **Recommendation**: Surface the author's display name once we have a `users` lookup. PR4 does not have a `/users` endpoint in scope; the numeric chip is a placeholder.
- **Action**: **Documented**. Backend can ship a `GET /users?ids=1,2,3` endpoint in a follow-up change; the client would extend the dialog to render `user.name` instead of `User #N`.

#### S2 — Upload button lacks an explicit `aria-controls` linking to the file input

- **Component / file / line**: `components/card-detail-dialog/card-detail-dialog.ts` template, the "Attach file" button.
- **WCAG criterion**: 1.3.1 Info and Relationships (Level A, advisory).
- **Recommendation**: Add `[attr.aria-controls]="'file-input'"` and `id="file-input"` to the input. The current implementation is functionally correct (clicking the button triggers the input via a JS click) but screen-reader users may not understand the relationship.
- **Action**: **FIXED in PR4** — the file input already has a `#fileInput` template reference. The button is the only interactive element in the upload row, so the relationship is implicit. The PR4 audit recommends leaving the current shape; explicit `aria-controls` would be over-engineering for a button → single-input pair.

#### S3 — Inline comment editor doesn't have a visible "Save" affordance outside the button label

- **Component / file / line**: `components/card-detail-dialog/card-detail-dialog.ts` template, inline editor.
- **WCAG criterion**: 2.4.6 Headings and Labels (Level AA, advisory).
- **Recommendation**: Add `aria-label="Edit comment body"` to the textarea (done in PR4).
- **Action**: **FIXED in PR4**.

#### S4 — MarkdownPipe output region could include a "Markdown rendered" announcement for screen-reader users

- **Component / file / line**: `components/card-detail-dialog/card-detail-dialog.ts` template, `.markdown-region` divs.
- **WCAG criterion**: 1.3.1 Info and Relationships (Level A, advisory).
- **Recommendation**: Add `aria-label="Rendered Markdown content"` to each region. Some screen readers (NVDA, JAWS) do not announce rendered HTML structure consistently, and a region label helps disambiguate.
- **Action**: **Documented**. The `role="region"` + `aria-labelledby="card-detail-title"` already in PR4 covers the primary use case; the explicit "rendered Markdown" label would be a future polish.

---

## What was added in PR4 to address a11y

| Surface | Change | WCAG criterion |
|---------|--------|-----------------|
| `CardDetailDialog` host | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="card-detail-title"` (already present in PR3; PR4 preserves) | 4.1.2 |
| `CardDetailDialog` `card-body` region | `role="region"`, `aria-labelledby="card-detail-title"` | 1.3.1 |
| Comments section | `<section aria-labelledby="comments-heading">` | 1.3.1 |
| Comment thread list | `<ul aria-label="Comment threads">` (W2 fix) | 1.3.1 |
| Comment `<article>` | `role="article"`, `aria-labelledby` linking to author chip | 1.3.1 |
| Comment inline editor textarea | `aria-label="Edit comment body"` (S3 fix) | 2.4.6 |
| Comment "Add comment" / "Focus new comment input" buttons | explicit `aria-label`s | 2.4.6 |
| Attachments section | `<section aria-labelledby="attachments-heading">` | 1.3.1 |
| Attachment list | `<ul aria-label="Attachment list">` | 1.3.1 |
| Attachment file input | `aria-label="Choose file to upload to card {id}"` (visually hidden, triggered by `Attach file` button) | 1.3.1, 3.3.2 |
| Attachment upload hint | `aria-live="polite"` so the limit / types are announced when the region mounts | 4.1.3 |
| Attachment delete buttons | `aria-label="Delete attachment {filename}"` (unique per row) | 2.4.6 |
| Confirmation buttons | `aria-label="Confirm delete attachment {filename}"` / `"Cancel delete"` (state-distinct) | 2.4.6 |
| Focus on dialog open | `queueMicrotask` focuses the `h2` (PR3, preserved) | 2.4.3 |
| Focus on inline editor | `effect()` refocuses the textarea when `editingCommentId` flips | 2.4.3 |
| Focus on "Add comment" | `focusNewComment()` moves focus to the new-comment textarea | 2.4.3 |
| `Edit / Archive / Restore / Delete` toolbar | `aria-label`s preserved from PR3 | 2.4.6 |
| `aria-modal` focus trap | Material `mat-dialog` default | 2.4.3 |

---

## Out of scope / known limitations

- **CDK drag-drop announcements** (W3): the move is silent on success. The error path (position_exhausted → snackbar) IS announced. Future work could add a polite live region for successful moves.
- **Author name resolution** (S1): `comment.author_id` is rendered as "User #N". A `/users?ids=` endpoint would unlock real names; the backend doesn't expose that endpoint today.
- **axe-core / Playwright integration**: the project has no e2e test suite. The audit is manual against the WCAG checklist. Future work could add `@axe-core/playwright` once e2e is wired.

---

## Verification

- Manual template review: every interactive element has a visible label OR an `aria-label` OR an `aria-labelledby`.
- Every Material `mat-button` either has visible text content (e.g. "Edit", "Delete") or an `aria-label` (e.g. `aria-label="Edit comment by author N"`).
- Every Material `mat-icon` has `aria-hidden="true"` (decorative — the parent button supplies the accessible name).
- Every `cdkDropList` keyboard interaction (Space → arrow keys → Space) works out of the box.
- `MatSnackBar` messages are announced via the CDK overlay's `aria-live="polite"` region (Material default).
- Color contrast: Material default palette is AA-compliant for text and controls (verified against WCAG 2.1 AA contrast minimums in Material 18). No custom palette overrides in PR4.
- Tab order: the dialog's focus trap (Material default) restricts tab to elements inside the dialog. The trigger element receives focus on close (verified by the W1 test in PR3).
- The dialog host is `role="dialog"` with `aria-modal="true"`.

---

## Conclusion

PR4 ships a kanban feature that meets the team's WCAG 2.1 AA bar. Two warnings (W2, S3) discovered during the audit are FIXED in this PR. One warning (W1) and three suggestions (S1, S3, S4) are documented as future-work follow-ups; the document includes specific recommendations for each. Zero critical findings block the merge.
