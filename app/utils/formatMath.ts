const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/**
 * Converts plain-text exponent notation to Unicode superscripts.
 * "x^2" → "x²", "-6m^4" → "-6m⁴", "3x^10" → "3x¹⁰".
 * Only handles digit exponents (not variables or fractions) — a bare
 * `^` or `^x` is left untouched by the `\^(\d+)` pattern.
 */
export function formatMath(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/\^(\d+)/g, (_, digits: string) =>
    digits.split('').map((d: string) => SUPERSCRIPT[d] ?? d).join('')
  );
}
