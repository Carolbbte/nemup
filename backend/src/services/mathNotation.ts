/**
 * Strips LaTeX artifacts that occasionally leak into AI-generated math text
 * despite explicit prompt instructions not to use them (prompt compliance
 * alone isn't reliable enough), converting them to the plain-text notation
 * MathText (app/utils/formatMath.tsx) actually knows how to render:
 * "a/b" fractions and "x^2"/"x²" exponents.
 */
export function sanitizeMathText(text: string): string {
  if (!text) return text;
  let result = text;

  // \frac{a}{b} -> a/b — bounded loop resolves simple nesting inside-out.
  const FRAC_RE = /\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
  for (let i = 0; i < 5 && FRAC_RE.test(result); i++) {
    FRAC_RE.lastIndex = 0;
    result = result.replace(FRAC_RE, '$1/$2');
  }

  // \sqrt{a} -> √(a)
  result = result.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');

  // \left / \right size-modifiers — drop the command, keep the delimiter
  // that follows it (e.g. "\left(" -> "(").
  result = result.replace(/\\left/g, '').replace(/\\right/g, '');

  // Inline/display math delimiters: \( \) \[ \]
  result = result
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\\\[/g, '')
    .replace(/\\\]/g, '');

  // Common operators.
  result = result
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±');

  // Braces around a simple numeric exponent: x^{2} -> x^2 (so formatMath's
  // "^" + digit superscript detector still matches it).
  result = result.replace(/\^\{(-?\d+)\}/g, '^$1');

  // Any other stray LaTeX command (\alpha, \text, ...) — drop the backslash,
  // keep the word, so it degrades to readable text instead of a raw
  // backslash rather than crashing or vanishing.
  result = result.replace(/\\([a-zA-Z]+)/g, '$1');

  // Orphan braces left by any unhandled brace-grouping command.
  result = result.replace(/[{}]/g, '');

  return result;
}
