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

  // \command{content} for any other single-argument LaTeX command not
  // already special-cased above (\text{cm}, \mathrm{kg}, \vec{v}, ...) —
  // unwrap to just the content, same "drop the wrapper, keep the payload"
  // treatment \sqrt{} already gets. MUST run before the generic
  // backslash-word strip right below: since real Chilean grouping braces
  // are now deliberately preserved (see the comment at the bottom of this
  // function), a stray "\text{cm}" would otherwise only lose its backslash
  // ("text{cm}") and the leftover braces would survive as a visible LaTeX
  // artifact — never confused with real grouping notation, since a
  // legitimate grouping brace is never immediately preceded by "\word".
  result = result.replace(/\\[a-zA-Z]+\s*\{([^{}]*)\}/g, '$1');

  // Any other stray LaTeX command with no braces (\alpha, \pi, ...) — drop
  // the backslash, keep the word, so it degrades to readable text instead
  // of a raw backslash rather than crashing or vanishing.
  result = result.replace(/\\([a-zA-Z]+)/g, '$1');

  // `{`/`}` are deliberately left untouched (an unconditional strip used to
  // live here) — every LaTeX construct that actually USES braces as syntax
  // (\frac{}{}, \sqrt{}, ^{N}) is already resolved above, so anything still
  // wearing a brace at this point is Chilean-notation signos de agrupación
  // (e.g. "5 - {3 - [2 + 4]}", the third nesting level after ( ) and [ ]),
  // not LaTeX cruft — deleting it silently changed the expression's value
  // ("5 - {3 - X}" becoming "5 - 3 - X"). This is display-facing text (the
  // student sees this string as-is), so it keeps the original bracket
  // shapes rather than converting them to "(" — exerciseValidator.ts's
  // toMathjsSyntax is the one place that needs `{`/`[` to behave like `(`
  // for evaluation, and it does that internally, without altering what's
  // shown on screen.
  return result;
}
