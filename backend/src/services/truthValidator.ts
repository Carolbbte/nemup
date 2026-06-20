/**
 * Truth Validator — deterministic logical validation of generated slide content.
 *
 * Pipeline:
 *   1. canonicalNormalizer  — normalize each option to its canonical form before comparison
 *   2. validateCorrectAnswer — check that the marked answer is mathematically correct
 *   3. validateUniqueCorrectOption — check no two options are equivalent (multiple-correct)
 *   4. validateDistractors — check for duplicate or cloned distractors
 *   5. validateExplanation — check explanation is numerically consistent with correct answer
 *
 * All validation runs on CANONICAL FORM, never on rawAnswer.
 * No external API calls — everything is deterministic regex + arithmetic.
 *
 * Extensibility: ContentType detection is designed to grow per-subject
 * (math, taxonomy, definition, sequence, fact_answer). sourceContent is
 * reserved for future chemistry/history/language rules.
 */

import type { SummarySlide, SummarySlideType } from '../types.js';

// ── Public truth-validation types ─────────────────────────────────────────────

export interface TruthFailure {
  slideId: string;
  type: 'incorrect_answer' | 'multiple_correct' | 'invalid_distractor' | 'broken_explanation';
  message: string;
}

export interface TruthValidationResult {
  passed: boolean;
  score: number;          // 0–1, fraction of interactive slides with zero hard failures
  failures: TruthFailure[];
}

// ── Canonical Normalizer ──────────────────────────────────────────────────────

export type ContentType =
  | 'math_expression'    // algebraic terms, arithmetic
  | 'taxonomy'           // classification label (monomio, sustantivo, …)
  | 'definition'         // natural-language explanation
  | 'sequence'           // numbered steps / ordered list
  | 'fact_answer'        // date, year, measurement, pure number
  | 'unknown';

export interface NormalizedOption {
  letter: string;
  rawText: string;
  normalizedText: string;
  contentType: ContentType;
  changed: boolean;
}

export interface CanonicalizationResult {
  normalizedSlide: SummarySlide;   // slide with option texts replaced by canonical forms
  options: NormalizedOption[];
  correctAnswerRaw: string | null;
  correctAnswerNorm: string | null;
  /** Set when simplification changed algebraic term count, implying a different class name. */
  reclassified?: { original: string; corrected: string };
}

// Variable character class used in multiple regex patterns
// Covers ASCII letters, accented Spanish letters, Unicode superscripts (⁰–⁹), ^, _
const VAR_SRC = '[a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9²³¹⁰-⁹^_]*';

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
  // Pure algebraic term without explicit operator: "-4a²", "3m"
  if (/^-?\d*[a-zA-Z]/.test(t) && !/\s/.test(t.replace(/\s*[+\-]\s*/g, ''))) return 'math_expression';
  if (/^\d+[\.\)]/.test(t)) return 'sequence';
  if (t.split(/\s+/).length > 4) return 'definition';
  return 'unknown';
}

// ── Math expression normalizer ────────────────────────────────────────────────
//
// Eliminates zero-coefficient terms: -4a² + 0a → -4a²
// Normalizes coefficient 1: +1x → +x, -1x → -x
// Normalizes spacing around operators for consistent comparison.

const ZERO_MID_RE = new RegExp(
  `\\s*[+\\-−]\\s*0+(?:\\.\\d+)?\\s*(?:${VAR_SRC})?(?=\\s*[+\\-−]|\\s*$)`,
  'g',
);
const ZERO_LEAD_RE = new RegExp(
  `^0+(?:\\.\\d+)?\\s*(?:${VAR_SRC})?\\s*(?:[+\\-−]\\s*)?`,
);

function normalizeMathExpression(raw: string): string {
  let expr = raw.trim();

  // 1. Remove zero-coefficient terms in middle/end: "+ 0a", "- 0m²", "+ 0"
  expr = expr.replace(ZERO_MID_RE, '');

  // 2. Remove leading zero term: "0a + 3m" → "3m"
  const afterLead = expr.replace(ZERO_LEAD_RE, '').trim();
  if (afterLead !== expr && afterLead.length > 0) expr = afterLead;

  // 3. Normalize coefficient 1: "1x" at start → "x", "+1x" / " 1x" → "+x" / " x"
  expr = expr.replace(/^1([a-zA-Z])/, '$1');
  expr = expr.replace(/^-1([a-zA-Z])/, '-$1');
  expr = expr.replace(/([+\-−\s])1([a-zA-Z])/g, '$1$2');

  // 4. Remove leading "+"
  expr = expr.replace(/^\+\s*/, '').trim();

  // 5. Normalize spaces around binary operators (for consistent splitting later)
  expr = expr.replace(/\s*([+\-−])\s*/g, ' $1 ').trim();
  // Re-attach leading minus to the first term (it's not a binary operator)
  expr = expr.replace(/^- /, '-');

  return expr || '0';
}

// ── Taxonomy normalizer ───────────────────────────────────────────────────────
// Lowercases and collapses whitespace so "Monomio " === "monomio".

function normalizeTaxonomy(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ── Definition normalizer ─────────────────────────────────────────────────────
// Replaces known synonym pairs for common mathematical / grammatical terms.
// Conservative: only pairs where equivalence is absolute.

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

// ── Fact-answer normalizer ────────────────────────────────────────────────────
// Normalizes dates, measurements, and number formats for consistent comparison.

function normalizeFactAnswer(raw: string): string {
  let result = raw.trim();
  // Decimal comma → decimal point (only 1–2 decimal digits to avoid ambiguity with thousands)
  result = result.replace(/^(-?\d+),(\d{1,2})$/, '$1.$2');
  // Percentage spacing: "50 %" → "50%"
  result = result.replace(/(\d+)\s+%/, '$1%');
  // Era indicator formatting: "d.C." / "D.C." → "d.C", "a.C." → "a.C"
  result = result.replace(/\b[dD]\.\s*[cC]\.?(?=\s|$)/g, 'd.C');
  result = result.replace(/\b[aA]\.\s*[cC]\.?(?=\s|$)/g, 'a.C');
  return result.trim();
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Normalize a text fragment to its canonical form given its detected content type.
 * Always returns a string (original if no rule applies).
 */
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

// ── Algebraic classification helpers ─────────────────────────────────────────

/**
 * Count the number of algebraic terms in a normalized expression.
 * "-4a²" → 1 (monomio), "3m + 5m" → 2 (binomio, before like-term reduction).
 * Requires expression to have spaces around binary + / - (as normalizeMathExpression ensures).
 */
function countAlgebraicTerms(expr: string): number {
  const trimmed = expr.trim();
  if (!trimmed || trimmed === '0') return 1;
  // Strip leading sign so it isn't counted as a separator
  const withoutLeadSign = trimmed.replace(/^[+\-−]\s*/, '');
  // Split on " + " or " - " with surrounding spaces (binary operators)
  const parts = withoutLeadSign.split(/\s+[+\-−]\s+/).filter(s => s.trim().length > 0);
  return Math.max(1, parts.length);
}

function classifyPolynomialByTermCount(count: number): string {
  if (count === 1) return 'monomio';
  if (count === 2) return 'binomio';
  if (count === 3) return 'trinomio';
  return 'polinomio';
}

// ── Canonical slide builder ───────────────────────────────────────────────────

/**
 * Normalizes every option in a slide to its canonical form.
 * Returns a new SummarySlide with options replaced, plus metadata for logging.
 */
export function canonicalizeSlide(slide: SummarySlide, index: number): CanonicalizationResult {
  const rawOptions: string[] = Array.isArray(slide.options) ? slide.options : [];

  // Parse → detect → normalize each option
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

  // Rebuild options array preserving the "A. " / "A) " prefix
  const newOptions = rawOptions.map((optStr, i) => {
    const m = optStr.match(/^([A-D][\.\)]\s*)([\s\S]*)/);
    if (!m) return optStr;
    return `${m[1]}${normalizedOpts[i]?.normalizedText ?? m[2]}`;
  });

  const normalizedSlide: SummarySlide = { ...slide, options: newOptions };

  // Correct-answer text before/after normalization
  const correctAnswerRaw  = getRawCorrectText(slide);
  const correctAnswerNorm = getRawCorrectText(normalizedSlide);

  // Reclassification: if normalization reduced term count → polynomial class name changed
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

// ── Slide types that carry evaluable questions ────────────────────────────────

const INTERACTIVE_TYPES = new Set<SummarySlideType>([
  'micro_challenge', 'reinforcement_challenge', 'comprehension',
  'mini_quiz', 'decide', 'application', 'common_error', 'wow_fact',
  'final_challenge',
]);

// ── Internal helpers ──────────────────────────────────────────────────────────

function makeSlideId(slide: SummarySlide, index: number): string {
  return `slide_${index}_${slide.type}`;
}

function parseOptions(options: string[]): Array<{ letter: string; text: string }> {
  return options.map(opt => {
    const m = opt.match(/^([A-D])[\.\)]\s*([\s\S]*)/);
    return m ? { letter: m[1], text: m[2].trim() } : { letter: '?', text: opt.trim() };
  });
}

// Raw correct-option text (before any normalization) — used by canonicalizeSlide
function getRawCorrectText(slide: SummarySlide): string | null {
  if (!slide.correctAnswer || !Array.isArray(slide.options)) return null;
  return parseOptions(slide.options).find(o => o.letter === slide.correctAnswer)?.text ?? null;
}

// Correct-option text (already normalized when slide was canonicalized)
function getCorrectText(slide: SummarySlide): string | null {
  return getRawCorrectText(slide);
}

/**
 * Comparison-level normalization: lowercase, collapse spaces, unify dashes/superscripts.
 * Used by validators AFTER canonical normalization has already cleaned the option texts.
 */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[−–−]/g, '-')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/¹/g, '^1')
    .replace(/[⁰-⁹]/g, c => `^${c.codePointAt(0)! - 0x2070}`)
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Math detection: like-term reduction (for question analysis) ───────────────

const LIKE_TERM_RE =
  /(-?\d*(?:[.,]\d+)?)\s*([a-záéíóúüñA-Z][a-záéíóúüñA-Z0-9²³¹⁰-⁹^_]*)\s*([+\-−])\s*(\d*(?:[.,]\d+)?)\s*([a-záéíóúüñA-Z][a-záéíóúüñA-Z0-9²³¹⁰-⁹^_]*)/;

const EVALUATION_KEYWORDS =
  /\b(reduc[ei]|simplific[ae]|sum[ae]|rest[ae]|calcula|resultado\s+de|cu[aá]nto|valor\s+de|equivale|igual\s+a)\b/i;

function parseCoef(raw: string): number {
  const s = raw.trim().replace(',', '.').replace('−', '-');
  if (s === '' || s === '+') return 1;
  if (s === '-') return -1;
  const n = parseFloat(s);
  return isNaN(n) ? 1 : n;
}

function formatCoef(n: number, varPart: string): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const coefStr = abs === 1 ? '' : (Number.isInteger(abs) ? String(abs) : abs.toFixed(2));
  return `${sign}${coefStr}${varPart}`;
}

function tryReduceLikeTerms(question: string): string | null {
  const hasEvalIntent = EVALUATION_KEYWORDS.test(question) || /[=?]/.test(question);
  if (!hasEvalIntent) return null;
  const m = LIKE_TERM_RE.exec(question);
  if (!m) return null;
  const [, rawC1, var1, op, rawC2, var2] = m;
  if (norm(var1) !== norm(var2)) return null;
  const c1 = parseCoef(rawC1);
  const c2 = parseCoef(rawC2);
  const sign = (op === '-' || op === '−') ? -1 : 1;
  const result = c1 + sign * c2;
  if (result === 0) return '0';
  return formatCoef(result, var1);
}

const ARITHMETIC_RE = /(\d+(?:[.,]\d+)?)\s*([+\-−×x÷\/\*])\s*(\d+(?:[.,]\d+)?)\s*[=?]/;

function trySimpleArithmetic(question: string): string | null {
  const m = ARITHMETIC_RE.exec(question);
  if (!m) return null;
  const a = parseFloat(m[1].replace(',', '.'));
  const b = parseFloat(m[3].replace(',', '.'));
  const op = m[2];
  let result: number;
  switch (op) {
    case '+':                            result = a + b; break;
    case '-': case '−':             result = a - b; break;
    case '*': case '×': case 'x':       result = a * b; break;
    case '/': case '÷':
      if (b === 0) return null;
      result = a / b;
      break;
    default: return null;
  }
  if (!Number.isFinite(result)) return null;
  const rounded = Math.round(result * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function computeExpected(question: string): string | null {
  return tryReduceLikeTerms(question) ?? trySimpleArithmetic(question);
}

// ── Validators (operate on canonicalized slide) ───────────────────────────────

function validateCorrectAnswer(slide: SummarySlide, index: number): TruthFailure | null {
  if (!slide.question || !slide.options || !slide.correctAnswer) return null;
  const expected = computeExpected(slide.question);
  if (expected === null) return null;
  const correctText = getCorrectText(slide);
  if (!correctText) return null;
  const normExpected = norm(expected);
  const normCorrect  = norm(correctText);
  if (normCorrect.includes(normExpected) || normExpected.includes(normCorrect)) return null;
  console.log(`[TruthValidator] incorrect_answer detected at slide ${index} — expected "${expected}", got "${correctText}"`);
  return {
    slideId: makeSlideId(slide, index),
    type: 'incorrect_answer',
    message: `[${slide.type}] expected "${expected}" but correctAnswer is "${correctText}" (q: "${slide.question.slice(0, 80)}")`,
  };
}

function validateUniqueCorrectOption(slide: SummarySlide, index: number): TruthFailure | null {
  if (!slide.question || !slide.options || !slide.correctAnswer) return null;
  const expected = computeExpected(slide.question);
  if (expected === null) return null;
  const normExpected = norm(expected);
  const matching = parseOptions(slide.options).filter(o => {
    const t = norm(o.text);
    return t.includes(normExpected) || normExpected.includes(t);
  });
  if (matching.length > 1) {
    const letters = matching.map(o => o.letter).join(', ');
    console.log(`[TruthValidator] multiple_correct at slide ${index} — options ${letters} match "${expected}"`);
    return {
      slideId: makeSlideId(slide, index),
      type: 'multiple_correct',
      message: `[${slide.type}] options ${letters} all appear correct for "${expected}"`,
    };
  }
  return null;
}

function validateDistractors(slide: SummarySlide, index: number): TruthFailure | null {
  if (!Array.isArray(slide.options) || slide.options.length < 2) return null;
  const parsed  = parseOptions(slide.options);
  const correctText = getCorrectText(slide);
  const seen = new Set<string>();
  for (const opt of parsed) {
    const t = norm(opt.text);
    if (opt.letter !== slide.correctAnswer && correctText && t === norm(correctText)) {
      console.log(`[TruthValidator] invalid_distractor at slide ${index} — ${opt.letter} identical to correctAnswer`);
      return { slideId: makeSlideId(slide, index), type: 'invalid_distractor',
        message: `[${slide.type}] distractor ${opt.letter} is identical to correctAnswer` };
    }
    if (seen.has(t)) {
      console.log(`[TruthValidator] invalid_distractor at slide ${index} — duplicate "${opt.text}"`);
      return { slideId: makeSlideId(slide, index), type: 'invalid_distractor',
        message: `[${slide.type}] duplicate option text: "${opt.text}"` };
    }
    seen.add(t);
  }
  return null;
}

function validateExplanation(slide: SummarySlide, index: number): TruthFailure | null {
  if (!slide.definition || !slide.question || !slide.correctAnswer || !Array.isArray(slide.options)) return null;
  const correctText = getCorrectText(slide);
  if (!correctText) return null;
  const correctNumbers: string[] = Array.from(correctText.match(/\d+/g) ?? []);
  if (correctNumbers.length === 0) return null;
  const wrongNumbers = parseOptions(slide.options)
    .filter(o => o.letter !== slide.correctAnswer)
    .flatMap(o => o.text.match(/\d+/g) ?? [])
    .filter(n => !correctNumbers.includes(n));
  const defNorm = norm(slide.definition);
  const defHasCorrect = correctNumbers.some(n => defNorm.includes(n));
  const contradicting = wrongNumbers.filter(n => defNorm.includes(n));
  if (!defHasCorrect && contradicting.length > 0) {
    console.log(`[TruthValidator] broken_explanation at slide ${index} — definition mentions "${contradicting[0]}" but correct is "${correctText}"`);
    return {
      slideId: makeSlideId(slide, index),
      type: 'broken_explanation',
      message: `[${slide.type}] definition references "${contradicting[0]}" but correct answer is "${correctText}"`,
    };
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates all interactive slides in a generated session.
 * Step 1: canonicalize each slide's options (never validate raw text).
 * Step 2: run four truth checks on the canonical form.
 *
 * @param slides        - Slides from the generated session summary
 * @param sourceContent - Document transcription (reserved for future subject rules)
 */
export async function validateTruth(
  slides: SummarySlide[],
  _sourceContent: string,
): Promise<TruthValidationResult> {
  const failures: TruthFailure[] = [];
  const interactiveSlides = slides.filter(
    s => INTERACTIVE_TYPES.has(s.type) && s.question && Array.isArray(s.options),
  );

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (!INTERACTIVE_TYPES.has(slide.type) || !slide.question || !Array.isArray(slide.options)) continue;

    console.log(`[TruthValidator] validating slide ${i} (${slide.type})`);

    // Step 1 — canonicalize before any validation
    const { normalizedSlide } = canonicalizeSlide(slide, i);

    // Step 2 — all validators run on the canonical form
    const f1 = validateCorrectAnswer(normalizedSlide, i);
    if (f1) failures.push(f1);

    const f2 = validateUniqueCorrectOption(normalizedSlide, i);
    if (f2) failures.push(f2);

    const f3 = validateDistractors(normalizedSlide, i);
    if (f3) failures.push(f3);

    const f4 = validateExplanation(normalizedSlide, i);
    if (f4) failures.push(f4);
  }

  const total = interactiveSlides.length;
  const failedSlides = new Set(failures.map(f => f.slideId)).size;
  const score = total === 0 ? 1 : Math.max(0, 1 - failedSlides / total);

  // Hard failures block acceptance and force regeneration.
  // Soft failures (distractor/explanation) also trigger regeneration but don't mark as "failed".
  const hardFailures = failures.filter(
    f => f.type === 'incorrect_answer' || f.type === 'multiple_correct',
  );
  const passed = hardFailures.length === 0;

  console.log(
    `[TruthValidator] truth_score=${score.toFixed(2)} failures=${failures.length} ` +
    `(hard=${hardFailures.length}) passed=${passed}`,
  );

  return { passed, score, failures };
}

// ── Retry-prompt feedback builder ─────────────────────────────────────────────

/**
 * Builds a prompt feedback block injected into the retry prompt when truth validation fails.
 */
export function buildTruthFeedback(result: TruthValidationResult): string {
  const lines: string[] = [
    '⚠️ ERRORES DE VERDAD LÓGICA — corregir TODOS antes de regenerar JSON:',
  ];
  const LABELS: Record<TruthFailure['type'], string> = {
    incorrect_answer:   '❌ RESPUESTA INCORRECTA',
    multiple_correct:   '❌ MÚLTIPLES CORRECTAS',
    invalid_distractor: '⚠️ DISTRACTOR INVÁLIDO',
    broken_explanation: '⚠️ EXPLICACIÓN CONTRADICE RESPUESTA',
  };
  for (const f of result.failures) {
    lines.push(`  ${LABELS[f.type]}: ${f.message}`);
  }
  lines.push('');
  lines.push('INSTRUCCIÓN: Para cada error, recalcula la respuesta correcta paso a paso antes de escribir correctAnswer y correctAnswerReason.');
  return lines.join('\n');
}
