/**
 * Canonical Normalizer — deterministic option-text normalization.
 *
 * Pipeline:
 *   1. detectContentType — classify each option text
 *   2. normalizeCanonicalForm — dispatch to the right normalizer
 *   3. canonicalizeSlide — normalize all options in a slide
 *
 * Math normalization uses a full polynomial pipeline:
 *   a. tokenize into terms
 *   b. group by variable key
 *   c. sum coefficients
 *   d. PRUNE terms where |coefficient| ≤ 1e-9   ← the key fix
 *   e. sort by degree descending
 *   f. render
 *
 * This ensures "3a² + 5a − 8a² − 11a + a² + 6a" → "-4a²"
 * rather than "-4a² + 0a".
 */

import type { SummarySlide } from '../types.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type ContentType =
  | 'math_expression'
  | 'taxonomy'
  | 'definition'
  | 'sequence'
  | 'fact_answer'
  | 'unknown';

export interface NormalizedOption {
  letter: string;
  rawText: string;
  normalizedText: string;
  contentType: ContentType;
  changed: boolean;
}

export interface CanonicalizationResult {
  normalizedSlide: SummarySlide;
  options: NormalizedOption[];
  correctAnswerRaw: string | null;
  correctAnswerNorm: string | null;
  reclassified?: { original: string; corrected: string };
}

// ── Content-type detection ────────────────────────────────────────────────────

const TAXONOMY_RE = /^(mono|bi|tri|cuadri|poli)nomio$/i;
const LINGUISTIC_TAXONOMY_RE = /^(sustantivo|verbo|adjetivo|adverbio|artículo|conjunción|preposición|pronombre|sujeto|predicado|fonema|morfema|sintagma)s?$/i;
const DATE_RE = /^\d{3,4}(\s*[adAD]\.?\s*[cC]\.?)?$/;
const MEASUREMENT_RE = /^-?\d+(?:[,.]\d+)?\s*(km|m|cm|mm|kg|g|mg|L|ml|°C|°F|%|Hz|m\/s|km\/h|N|J|W|Pa)?$/;
const HAS_MATH_OP = /[+\-×÷=\^\/]|[²³¹⁰-⁹]/;
const HAS_ALGEBRAIC_VAR = /[a-zA-Z][²³¹⁰-⁹\^]|[a-zA-Z]\d|\d[a-zA-Z]/;

export function detectContentType(text: string): ContentType {
  const t = text.trim();
  if (!t) return 'unknown';
  if (TAXONOMY_RE.test(t) || LINGUISTIC_TAXONOMY_RE.test(t)) return 'taxonomy';
  if (DATE_RE.test(t)) return 'fact_answer';
  if (MEASUREMENT_RE.test(t)) return 'fact_answer';
  if (/^\d+$/.test(t)) return 'fact_answer';
  if (HAS_MATH_OP.test(t) && HAS_ALGEBRAIC_VAR.test(t)) return 'math_expression';
  if (/^-?\d*[a-zA-Z]/.test(t) && !/\s/.test(t.replace(/\s*[+\-]\s*/g, ''))) return 'math_expression';
  if (/^\d+[\.\)]/.test(t)) return 'sequence';
  if (t.split(/\s+/).length > 4) return 'definition';
  return 'unknown';
}

// ── Polynomial algorithm ──────────────────────────────────────────────────────

interface AlgTerm {
  coefficient: number;
  varDisplay: string;   // display form as seen in input, e.g. "a²", "m", ""
  varKey: string;       // normalized form for grouping, e.g. "a^2", "m", "__const__"
  degree: number;       // total algebraic degree for ordering
}

function toVarKey(varDisplay: string): string {
  if (!varDisplay) return '__const__';
  return varDisplay.toLowerCase()
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/¹/g, '^1')
    .replace(/⁰/g, '^0').replace(/⁴/g, '^4').replace(/⁵/g, '^5')
    .replace(/⁶/g, '^6').replace(/⁷/g, '^7').replace(/⁸/g, '^8')
    .replace(/⁹/g, '^9');
}

function calcDegree(varKey: string): number {
  if (!varKey || varKey === '__const__') return 0;
  // Match each letter (variable name) followed by optional ^n
  let degree = 0;
  for (const m of varKey.matchAll(/([a-záéíóúüñ])(?:\^(\d+))?/gi)) {
    degree += m[2] ? parseInt(m[2], 10) : 1;
  }
  return degree;
}

/**
 * Splits a polynomial string into individual term tokens.
 * Inserts a separator before each + or - that follows a term-ending character.
 * Input spaces are collapsed first so the separator detection is reliable.
 *
 * Example: "3a² + 5a - 8a²" → ["3a²", "+5a", "-8a²"]
 */
function splitIntoTerms(expr: string): string[] {
  const e = expr
    .replace(/[−–]/g, '-')   // normalize typographic minuses
    .replace(/,/g, '.')       // decimal comma → decimal point
    .replace(/\s+/g, '')      // remove all spaces
    .trim();

  // Insert § before each + or - that is preceded by a term-ending character
  // (letter, digit, Unicode superscript, or _).
  const marked = e.replace(
    /([a-zA-ZÀ-ÿ0-9²³¹⁰-⁹_])([+\-])/g,
    '$1§$2',
  );
  return marked.split('§').map(s => s.trim()).filter(Boolean);
}

// Matches an optional sign+coefficient followed by an optional variable part.
// Examples: "3a²", "+5a", "-a", "+0a", "3", "+3"
const TERM_PARSE_RE =
  /^([+\-]?\d*\.?\d*)\s*([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9²³¹⁰-⁹^_]*)?$/;

function parseTermToken(token: string): AlgTerm | null {
  const m = token.match(TERM_PARSE_RE);
  if (!m) return null;

  const rawCoef = m[1] ?? '';
  const varDisplay = m[2] ?? '';

  let coefficient: number;
  const s = rawCoef.trim();
  if (s === '' || s === '+') coefficient = 1;
  else if (s === '-')        coefficient = -1;
  else {
    coefficient = parseFloat(s);
    if (isNaN(coefficient)) coefficient = varDisplay ? 1 : 0;
  }

  const varKey = toVarKey(varDisplay);
  const degree = calcDegree(varKey);

  return { coefficient, varDisplay, varKey, degree };
}

function renderTerm(term: AlgTerm, isFirst: boolean): string {
  const { coefficient, varDisplay } = term;
  const abs = Math.abs(coefficient);
  const hasVar = varDisplay.length > 0;

  // Coefficient display: suppress "1" before a variable (e.g. "a²" not "1a²")
  let coefStr: string;
  if (hasVar && Math.abs(abs - 1) < 1e-9) {
    coefStr = '';
  } else {
    coefStr = Number.isInteger(abs)
      ? String(abs)
      : abs.toFixed(2).replace(/\.?0+$/, '');
  }

  if (isFirst) {
    return `${coefficient < 0 ? '-' : ''}${coefStr}${varDisplay}`;
  } else {
    return `${coefficient < 0 ? ' - ' : ' + '}${coefStr}${varDisplay}`;
  }
}

/**
 * Full polynomial normalization:
 * 1. Tokenize → 2. Parse → 3. Group+sum → 4. PRUNE zeros → 5. Sort → 6. Render
 *
 * Falls back to simple cleanup for non-polynomial expressions (fractions, parentheses).
 */
function normalizeMathExpression(raw: string): string {
  const tokens = splitIntoTerms(raw);
  if (tokens.length === 0) return '0';

  // Step 1–2: parse each token; bail if any token is not a simple algebraic term
  const terms: AlgTerm[] = [];
  for (const token of tokens) {
    const term = parseTermToken(token);
    if (term === null) return fallbackNormalizeMath(raw);
    terms.push(term);
  }

  // Step 3: group by varKey and sum coefficients
  const map = new Map<string, AlgTerm>();
  for (const term of terms) {
    const existing = map.get(term.varKey);
    if (existing) {
      existing.coefficient += term.coefficient;
    } else {
      map.set(term.varKey, { ...term });
    }
  }

  // Step 4: PRUNE — discard any term whose combined coefficient is effectively zero
  const prunedTerms = Array.from(map.values()).filter(term => {
    return Math.abs(Number(term.coefficient)) > 1e-9;
  });

  if (prunedTerms.length === 0) return '0';

  // Step 5: canonical order — highest degree first, constants last
  prunedTerms.sort((a, b) => b.degree - a.degree);

  // Step 6: render
  return prunedTerms.map((t, i) => renderTerm(t, i === 0)).join('');
}

/** Simple cleanup for expressions containing division, parentheses, etc. */
function fallbackNormalizeMath(raw: string): string {
  let expr = raw.trim().replace(/[−–]/g, '-');
  expr = expr.replace(/^\+\s*/, '').trim();
  expr = expr.replace(/\s*([+\-])\s*/g, ' $1 ').trim();
  expr = expr.replace(/^- /, '-');
  return expr || '0';
}

// ── Other normalizers ─────────────────────────────────────────────────────────

function normalizeTaxonomy(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

const DEFINITION_SYNONYMS: Array<[RegExp, string]> = [
  [/\bvalor\s+que\s+multiplica\b/gi, 'número que multiplica'],
  [/\bfactor\s+numérico\b/gi, 'coeficiente'],
  [/\bparte\s+numérica\b/gi, 'coeficiente'],
  [/\belemento\s+que\s+multiplica\b/gi, 'número que multiplica'],
];

function normalizeDefinition(raw: string): string {
  let result = raw.trim();
  for (const [pattern, replacement] of DEFINITION_SYNONYMS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function normalizeFactAnswer(raw: string): string {
  let result = raw.trim();
  result = result.replace(/^(-?\d+),(\d{1,2})$/, '$1.$2');
  result = result.replace(/(\d+)\s+%/, '$1%');
  result = result.replace(/\b[dD]\.\s*[cC]\.?(?=\s|$)/g, 'd.C');
  result = result.replace(/\b[aA]\.\s*[cC]\.?(?=\s|$)/g, 'a.C');
  return result.trim();
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function normalizeCanonicalForm(text: string, contentType?: ContentType): string {
  const type = contentType ?? detectContentType(text);
  switch (type) {
    case 'math_expression': return normalizeMathExpression(text);
    case 'taxonomy':        return normalizeTaxonomy(text);
    case 'definition':      return normalizeDefinition(text);
    case 'fact_answer':     return normalizeFactAnswer(text);
    default:                return text.trim();
  }
}

// ── Algebraic classification helpers (used by canonicalizeSlide) ──────────────

function countAlgebraicTerms(expr: string): number {
  const trimmed = expr.trim();
  if (!trimmed || trimmed === '0') return 1;
  const withoutLeadSign = trimmed.replace(/^[+\-−]\s*/, '');
  const parts = withoutLeadSign.split(/\s+[+\-−]\s+/).filter(s => s.trim().length > 0);
  return Math.max(1, parts.length);
}

function classifyPolynomialByTermCount(count: number): string {
  if (count === 1) return 'monomio';
  if (count === 2) return 'binomio';
  if (count === 3) return 'trinomio';
  return 'polinomio';
}

// ── Private slide helpers (local copies — not exported) ───────────────────────

function parseOptionsLocal(options: string[]): Array<{ letter: string; text: string }> {
  return options.map(opt => {
    const m = opt.match(/^([A-D])[\.\)]\s*([\s\S]*)/);
    return m ? { letter: m[1], text: m[2].trim() } : { letter: '?', text: opt.trim() };
  });
}

function getRawCorrectText(slide: SummarySlide): string | null {
  if (!slide.correctAnswer || !Array.isArray(slide.options)) return null;
  return parseOptionsLocal(slide.options).find(o => o.letter === slide.correctAnswer)?.text ?? null;
}

// ── Canonical slide builder ───────────────────────────────────────────────────

/**
 * Normalizes the options text of every slide that has options.
 * Strips zero-coefficient terms ("0a", "0x²", "+ 0"), redundant additions,
 * and re-orders by algebraic degree.
 *
 * Use this to clean generated session content before storing it,
 * so students never see expressions like "−4a² + 0a" instead of "−4a²".
 */
export function normalizeAllSlides(slides: SummarySlide[]): SummarySlide[] {
  return slides.map((slide, i) => {
    if (!Array.isArray(slide.options) || slide.options.length === 0) return slide;
    const { normalizedSlide } = canonicalizeSlide(slide, i);
    return normalizedSlide;
  });
}

export function canonicalizeSlide(slide: SummarySlide, index: number): CanonicalizationResult {
  const rawOptions: string[] = Array.isArray(slide.options) ? slide.options : [];

  const normalizedOpts: NormalizedOption[] = rawOptions.map(optStr => {
    const m = optStr.match(/^([A-D][\.\)]\s*)([\s\S]*)/);
    const letter = m ? m[1].trim().charAt(0) : '?';
    const rawText = m ? m[2].trim() : optStr.trim();
    const contentType = detectContentType(rawText);
    const normalizedText = normalizeCanonicalForm(rawText, contentType);
    const changed = normalizedText !== rawText;
    if (changed) {
      console.log(
        `[CanonicalNormalizer] slide ${index} option ${letter}: ` +
        `raw="${rawText}" normalized="${normalizedText}" (type=${contentType})`,
      );
    }
    return { letter, rawText, normalizedText, contentType, changed };
  });

  const newOptions = rawOptions.map((optStr, i) => {
    const m = optStr.match(/^([A-D][\.\)]\s*)([\s\S]*)/);
    if (!m) return optStr;
    return `${m[1]}${normalizedOpts[i]?.normalizedText ?? m[2]}`;
  });

  const normalizedSlide: SummarySlide = { ...slide, options: newOptions };

  const correctAnswerRaw  = getRawCorrectText(slide);
  const correctAnswerNorm = getRawCorrectText(normalizedSlide);

  let reclassified: CanonicalizationResult['reclassified'];
  if (correctAnswerRaw && correctAnswerNorm && correctAnswerRaw !== correctAnswerNorm) {
    const rawCount  = countAlgebraicTerms(correctAnswerRaw);
    const normCount = countAlgebraicTerms(correctAnswerNorm);
    if (rawCount !== normCount) {
      const original = classifyPolynomialByTermCount(rawCount);
      const corrected = classifyPolynomialByTermCount(normCount);
      if (original !== corrected) {
        reclassified = { original, corrected };
        console.log(
          `[CanonicalNormalizer] slide ${index} classification corrected: ${original} → ${corrected}`,
        );
      }
    }
  }

  return { normalizedSlide, options: normalizedOpts, correctAnswerRaw, correctAnswerNorm, reclassified };
}
