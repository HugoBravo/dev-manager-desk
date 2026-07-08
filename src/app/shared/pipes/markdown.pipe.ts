import { Pipe, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Allowed HTML tags after sanitization. We start from DOMPurify's default
 * allowlist (which already strips `<script>`, `<iframe>`, event handlers,
 * `javascript:` URLs, etc.) and explicitly add `img` + heading levels so
 * markdown like `![alt](url)` and `# Title` renders correctly.
 *
 * Anything outside this set is stripped by DOMPurify BEFORE the result ever
 * reaches `bypassSecurityTrustHtml`. The order is non-negotiable — see the
 * class JSDoc and the test suite for the explicit assertions.
 */
const ALLOWED_TAGS: readonly string[] = [
  // Default tags DOMPurify keeps (subset that matters for markdown):
  'a', 'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li',
  'blockquote', 'code', 'pre', 'hr', 'span', 'div',
  // Explicitly added for markdown:
  'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTR: readonly string[] = [
  'href', 'src', 'alt', 'title',
];

// Tags and attributes DOMPurify should NEVER keep even if defaults change.
const FORBID_TAGS: readonly string[] = [
  'script', 'iframe', 'object', 'embed', 'form',
];

const FORBID_ATTR: readonly string[] = [
  'style', 'onerror', 'onload', 'onclick', 'onmouseover',
];

/**
 * Pipe that renders Markdown text as sanitized HTML.
 *
 * ## Sanitization order (non-negotiable)
 *
 * 1. `marked.parse(value)` — converts Markdown to raw HTML. The output
 *    MAY contain `<script>`, event handlers, or `javascript:` URLs if the
 *    input tries to inject them.
 * 2. `DOMPurify.sanitize(html, ...)` — strips anything dangerous. Tests
 *    assert `<script>` tags, `onerror` handlers, `javascript:` hrefs, and
 *    iframes are all removed before the next step.
 * 3. `DomSanitizer.bypassSecurityTrustHtml(safe)` — Angular trusts the
 *    already-sanitized HTML so the template can render it via `[innerHTML]`.
 *
 * If you ever swap steps 2 and 3, you re-introduce the XSS vector. The test
 * suite (`markdown.pipe.spec.ts`) asserts this ordering contractually.
 *
 * Pure pipe: Angular re-runs `transform()` only when the input reference
 * changes. No I/O, no state — safe in OnPush and zoneless contexts.
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) {
      // Empty string is what Angular Material + the dialog templates expect
      // for "no body" cases. Returning a SafeHtml wrapper for '' would force
      // every consumer to coerce; the existing `card.body ?? '(no body)'`
      // pattern in CardDetailDialog keeps that flow intact.
      return '';
    }
    // `marked.parse()` is configured for synchronous output. `async: false`
    // makes it return a string directly (no Promise).
    const html = marked.parse(value, { async: false }) as string;
    const safe = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [...ALLOWED_TAGS],
      ALLOWED_ATTR: [...ALLOWED_ATTR],
      FORBID_TAGS: [...FORBID_TAGS],
      FORBID_ATTR: [...FORBID_ATTR],
    });
    return this.sanitizer.bypassSecurityTrustHtml(safe);
  }
}