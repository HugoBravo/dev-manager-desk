import { TestBed } from '@angular/core/testing';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { MarkdownPipe } from './markdown.pipe';

/**
 * Convert a SafeHtml to a plain string for assertions. We unwrap Angular's
 * SafeHtml wrapper by reading the `changingThisBreaksApplicationSecurity`
 * private field — Angular does not expose a public way to extract the raw
 * string, and the test environment is trusted (jsdom), so this is safe.
 */
function unwrap(safe: SafeHtml | string): string {
  if (typeof safe === 'string') {
    return safe;
  }
  // Angular marks SafeHtml with `changingThisBreaksApplicationSecurity` so
  // any accidental DOM injection throws. In tests we control the pipeline
  // and can read it directly.
  return (safe as unknown as { changingThisBreaksApplicationSecurity: string })
    .changingThisBreaksApplicationSecurity;
}

describe('MarkdownPipe', () => {
  let pipe: MarkdownPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    pipe = TestBed.runInInjectionContext(() => new MarkdownPipe());
  });

  it('returns an empty string for null / undefined / empty input', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });

  it('renders plain markdown: **bold** → <strong>bold</strong>', () => {
    const result = unwrap(pipe.transform('**bold**'));
    expect(result).toContain('<strong>bold</strong>');
    // No leftover markdown asterisks in the output.
    expect(result).not.toContain('**');
  });

  it('renders headings: # Title → <h1>Title</h1>', () => {
    const result = unwrap(pipe.transform('# Title'));
    expect(result).toContain('<h1>Title</h1>');
  });

  it('renders headings: ## Sub → <h2>Sub</h2>', () => {
    const result = unwrap(pipe.transform('## Sub'));
    expect(result).toContain('<h2>Sub</h2>');
  });

  it('renders links with a normal href as <a href="...">', () => {
    const result = unwrap(pipe.transform('[click](https://example.com)'));
    expect(result).toContain('<a href="https://example.com">click</a>');
  });

  // --- XSS payload matrix ---

  it('strips <script> tags injected in the markdown source', () => {
    const malicious = '<script>alert(1)</script>\nNormal text.';
    const result = unwrap(pipe.transform(malicious));
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(1)');
    // The benign text after the script tag survives.
    expect(result).toContain('Normal text.');
  });

  it('strips onerror attributes from <img> tags', () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const result = unwrap(pipe.transform(malicious));
    // The onerror handler is gone — DOMPurify drops it (and we explicitly
    // FORBID_ATTR 'onerror' as belt-and-suspenders).
    expect(result.toLowerCase()).not.toContain('onerror');
    // No alert payload surviving.
    expect(result).not.toContain('alert(1)');
  });

  it('strips javascript: URLs from link hrefs', () => {
    const malicious = '[click me](javascript:alert(1))';
    const result = unwrap(pipe.transform(malicious));
    // Either the href is stripped entirely OR replaced with `about:blank`.
    // DOMPurify's default is to drop the `javascript:` prefix and emit a
    // safe href. Either way, the literal `javascript:alert(1)` must NOT
    // appear.
    expect(result).not.toContain('javascript:alert(1)');
  });

  it('strips nested <iframe> tags', () => {
    const malicious = '<iframe src="https://evil.example"></iframe>';
    const result = unwrap(pipe.transform(malicious));
    expect(result.toLowerCase()).not.toContain('<iframe');
    expect(result).not.toContain('evil.example');
  });

  it('strips <object>, <embed>, and <form> tags even when explicitly provided', () => {
    const malicious =
      '<object data="evil"></object><embed src="evil"><form action="x"><input></form>';
    const result = unwrap(pipe.transform(malicious));
    expect(result.toLowerCase()).not.toContain('<object');
    expect(result.toLowerCase()).not.toContain('<embed');
    expect(result.toLowerCase()).not.toContain('<form');
    expect(result.toLowerCase()).not.toContain('<input');
  });

  it('strips inline style attributes (defense in depth)', () => {
    const malicious = '<p style="background:url(javascript:alert(1))">hi</p>';
    const result = unwrap(pipe.transform(malicious));
    expect(result.toLowerCase()).not.toContain('style=');
    expect(result).not.toContain('javascript:');
  });

  it('strips svg/onload payloads', () => {
    const malicious = '<svg/onload=alert(1)>';
    const result = unwrap(pipe.transform(malicious));
    // Either the `<svg>` tag is stripped entirely, OR the tag is escaped
    // (rendered as text content like `&lt;svg/onload=alert(1)&gt;`). Both
    // outcomes neutralize the XSS — the only failure mode would be a
    // literal `<svg ... onload=...>` element being injected into the DOM.
    const lower = result.toLowerCase();
    const hasLiveSvg =
      lower.includes('<svg') && !lower.includes('&lt;svg');
    expect(hasLiveSvg).toBe(false);
    // No live `onload=` attribute on any rendered element.
    expect(lower).not.toMatch(/\sonload\s*=/);
  });

  // --- Sanitization order contract ---

  it('sanitizes BEFORE calling bypassSecurityTrustHtml (order is the security contract)', () => {
    // Spy on the Angular sanitizer to confirm the input is already-clean.
    const sanitizer = TestBed.inject(DomSanitizer);
    const bypassSpy = vi.spyOn(sanitizer, 'bypassSecurityTrustHtml');

    const malicious = '<script>alert(1)</script>';
    pipe.transform(malicious);

    expect(bypassSpy).toHaveBeenCalledTimes(1);
    const safeInput = bypassSpy.mock.calls[0]![0] as string;
    // The string passed to bypass MUST NOT contain <script>.
    expect(safeInput.toLowerCase()).not.toContain('<script');
  });

  it('uses DOMPurify as the sanitizer (not the Angular DomSanitizer alone)', () => {
    // This test guards against a future regression where someone removes
    // DOMPurify and relies on Angular's `sanitize(SecurityContext.HTML)`.
    // Angular's sanitizer does NOT strip `<script>` tags inside arbitrary
    // HTML — only event handlers and known-dangerous tags. DOMPurify is the
    // belt-and-suspenders layer.
    const purifySpy = vi.spyOn(DOMPurify, 'sanitize');
    pipe.transform('**bold**');
    expect(purifySpy).toHaveBeenCalled();
    purifySpy.mockRestore();

    const markedSpy = vi.spyOn(marked, 'parse');
    pipe.transform('**bold**');
    expect(markedSpy).toHaveBeenCalled();
    markedSpy.mockRestore();
  });

  it('renders a card.body with a mix of safe markdown and dangerous HTML, keeping only the safe subset', () => {
    const input = [
      '## Plan',
      '',
      '- Item one',
      '- Item two with [link](https://example.com)',
      '',
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(2)">',
    ].join('\n');
    const result = unwrap(pipe.transform(input));
    expect(result).toContain('<h2>Plan</h2>');
    expect(result).toContain('<li>Item one</li>');
    expect(result).toContain('href="https://example.com"');
    expect(result.toLowerCase()).not.toContain('<script');
    expect(result.toLowerCase()).not.toContain('onerror');
    expect(result).not.toContain('alert(');
  });
});