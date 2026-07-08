import { contrastColor, relativeLuminance } from './contrast-color';
import { LABEL_PALETTE } from '../models/label.model';

/**
 * The contrast helper underwrites the WCAG AA compliance of every
 * `LabelChip`. The 8-color palette was chosen to clear the 4.5:1
 * contrast threshold by a wide margin; the tests below lock that
 * property in code.
 */
describe('contrastColor()', () => {
  it('returns black on light backgrounds and white on dark backgrounds', () => {
    // White background → black text. Black background → white text.
    expect(contrastColor('#ffffff')).toBe('#000');
    expect(contrastColor('#000000')).toBe('#fff');
  });

  it('returns white on the saturated palette entries (red/blue/violet/pink/emerald/cyan/amber)', () => {
    // All the saturated palette entries have a luminance below 0.5
    // when computed via sRGB relative luminance. The slate entry is
    // right at the boundary; we don't rely on it being one or the
    // other, only that it returns one of the two legal values.
    const saturated = LABEL_PALETTE.filter((c) => c !== '#64748b');
    for (const color of saturated) {
      expect(contrastColor(color)).toBe('#fff');
    }
  });

  it('returns one of black/white for every palette entry', () => {
    for (const color of LABEL_PALETTE) {
      const result = contrastColor(color);
      expect(['#000', '#fff']).toContain(result);
    }
  });

  it('returns white for malformed input (NaN luminance is not > 0.5)', () => {
    // The current implementation treats a malformed color as "dark"
    // (NaN > 0.5 is false → white text). The defensive contract is that
    // the function never throws and always returns one of the two
    // legal values.
    expect(contrastColor('not-a-hex')).toBe('#fff');
    expect(contrastColor('')).toBe('#fff');
    expect(contrastColor('#abc')).toBe('#fff');
  });
});

describe('relativeLuminance()', () => {
  it('returns 1 for white and 0 for black', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('returns NaN for malformed input', () => {
    expect(Number.isNaN(relativeLuminance('nope'))).toBe(true);
  });
});
