import { Text, View } from 'react-native';
import type { TextStyle } from 'react-native';

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};
const SUPERSCRIPT_CHARS = Object.values(SUPERSCRIPT).join('');

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

// Denominator restricted to digits (plain or superscript) — NOT letters —
// so this only ever matches real fractions ("2/3", "x/4", "5x^7/3") and
// never incidentally catches word pairs like "y/o" ("and/or" in Spanish),
// where the right side isn't numeric.
const FRACTION_RE = new RegExp(
  `(-?[0-9A-Za-z${SUPERSCRIPT_CHARS}]+)\\/([0-9${SUPERSCRIPT_CHARS}]+)`,
  'g',
);

type MathPart = { type: 'text'; value: string } | { type: 'frac'; num: string; den: string };

function splitMathParts(raw: string): MathPart[] {
  const withExponents = formatMath(raw);
  const parts: MathPart[] = [];
  let lastIndex = 0;
  for (const match of withExponents.matchAll(FRACTION_RE)) {
    const [full, num, den] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ type: 'text', value: withExponents.slice(lastIndex, index) });
    parts.push({ type: 'frac', num, den });
    lastIndex = index + full.length;
  }
  if (lastIndex < withExponents.length) parts.push({ type: 'text', value: withExponents.slice(lastIndex) });
  return parts;
}

/** Text-relevant style keys, extracted so the container's own margin/padding
 * isn't duplicated onto every inner run when a style object mixes both
 * (RN style objects routinely do, e.g. `{ fontSize: 13, marginBottom: 12 }`). */
const TEXT_STYLE_KEYS = ['fontSize', 'fontWeight', 'fontStyle', 'fontFamily', 'color', 'letterSpacing', 'lineHeight'] as const;

function extractTextStyle(flat: TextStyle): TextStyle {
  const out: TextStyle = {};
  for (const key of TEXT_STYLE_KEYS) {
    if (flat[key] !== undefined) (out as any)[key] = flat[key];
  }
  return out;
}

function Fraction({ numerator, denominator, textStyle }: { numerator: string; denominator: string; textStyle: TextStyle }) {
  const baseSize = typeof textStyle.fontSize === 'number' ? textStyle.fontSize : 15;
  const fracSize = Math.max(9, Math.round(baseSize * 0.62));
  const color = textStyle.color ?? '#000';
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', marginHorizontal: 1 }}>
      <Text style={[textStyle, { fontSize: fracSize, lineHeight: fracSize + 2 }]}>{numerator}</Text>
      <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: color as string, marginVertical: 1 }} />
      <Text style={[textStyle, { fontSize: fracSize, lineHeight: fracSize + 2 }]}>{denominator}</Text>
    </View>
  );
}

type MathTextProps = {
  children: string | null | undefined;
  style?: TextStyle | (TextStyle | undefined | false | null)[];
  numberOfLines?: number;
};

/**
 * Drop-in replacement for `<Text>{formatMath(x)}</Text>`. Renders a plain
 * Text (identical output to before) unless the content contains a fraction
 * — only then does it switch to a row of Text/Fraction views, since a View
 * can't nest inside RN's Text. Fraction-bearing strings are always short
 * math snippets in practice, so `numberOfLines` (Text-only) is simply
 * skipped on that rarer path rather than approximated.
 */
export function MathText({ children, style, numberOfLines }: MathTextProps) {
  const raw = children ?? '';
  const parts = splitMathParts(raw);
  const hasFraction = parts.some((p) => p.type === 'frac');

  if (!hasFraction) {
    return <Text style={style} numberOfLines={numberOfLines}>{formatMath(raw)}</Text>;
  }

  const flatStyle: TextStyle = Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : (style ?? {});
  const textStyle = extractTextStyle(flatStyle);
  const justifyContent = flatStyle.textAlign === 'center' ? 'center' : flatStyle.textAlign === 'right' ? 'flex-end' : 'flex-start';

  return (
    // flatStyle is caller-supplied as a Text style (font props + layout props
    // like margin/textAlign mixed together, as RN style objects commonly do)
    // but applied here to a View — layout props carry over correctly, and
    // View harmlessly ignores the font-only ones at runtime; `any` sidesteps
    // the resulting structural TextStyle/ViewStyle mismatch.
    <View style={[flatStyle as any, { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent }]}>
      {parts.map((part, i) =>
        part.type === 'frac'
          ? <Fraction key={i} numerator={part.num} denominator={part.den} textStyle={textStyle} />
          : <Text key={i} style={textStyle}>{part.value}</Text>
      )}
    </View>
  );
}
