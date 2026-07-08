/**
 * Pick black or white text for a given background hex so the chip text
 * always meets WCAG AA contrast (≥4.5:1 for normal text). The threshold
 * uses the sRGB relative luminance, which is the standard formula
 * (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
 *
 * For the 8-color palette seeded in `LABEL_PALETTE` every chip clears
 * the threshold by a wide margin. The function is exported so the
 * `label-chip.spec.ts` test can assert the expected text color per
 * palette entry — keeps the contrast audit in code, not in design
 * hand-off.
 */
export function contrastColor(backgroundHex: string): '#000' | '#fff' {
  const lum = relativeLuminance(backgroundHex);
  return lum > 0.5 ? '#000' : '#fff';
}

/**
 * Compute the sRGB relative luminance for a `#RRGGBB` hex string.
 * Returns NaN if the value is malformed — callers should treat that as
 * an unsafe color and fall back to black text.
 */
export function relativeLuminance(hex: string): number {
  const normalized = hex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    return Number.NaN;
  }
  const channels: number[] = [];
  for (let i = 1; i < 7; i += 2) {
    const pair = normalized.slice(i, i + 2);
    const value = Number.parseInt(pair, 16) / 255;
    channels.push(channelLuminance(value));
  }
  // sRGB relative luminance uses BT.709 weights on the linearised channels.
  const r = channels[0] ?? 0;
  const g = channels[1] ?? 0;
  const b = channels[2] ?? 0;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function channelLuminance(c: number): number {
  // sRGB → linear (the inverse companding for the ≤0.03928 / >0.03928
  // piecewise is what WCAG 2.1 prescribes).
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
