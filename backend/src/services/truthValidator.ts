/**
 * Truth Validator — deterministic logical validation of generated slide content.
 *
 * Validates that:
 *   A. The marked correctAnswer is actually correct (algebraic / arithmetic detection)
 *   B. No two options are equally correct for the same question
 *   C. Distractors are not duplicates or identical to the correct answer
 *   D. The explanation (definition) is numerically consistent with the correct answer
 *
 * This is a gatekeeper between quality validation and regeneration.
 * Does NOT call any external API — everything is deterministic regex + arithmetic.
 *
 * Extensibility: sourceContent is reserved for future subject-specific rules
 * (chemistry equations, historical dates, literary analysis). Currently unused.
 */

import type { SummarySlide, SummarySlideType } from '../types.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface TruthFailure {
  slideId: string;
  type: 'incorrect_answer' | 'multiple_correct' | 'invalid_distractor' | 'broken_explanation';
  message: string;
}

export interface TruthValidationResult {
  passed: boolean;
  score: number;       // 0–1, fraction of interactive slides with zero failures
  failures: TruthFailure[];
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

/**
 * Parse options like ["A. 8m", "A) 8m"] → [{ letter: 'A', text: '8m' }]
 */
function parseOptions(options: string[]): Array<{ letter: string; text: string }> {
  return options.map(opt => {
    const m = opt.match(/^([A-D])[\.\)]\s*([\s\S]*)/);
    return m ? { letter: m[1], text: m[2].trim() } : { letter: '?', text: opt.trim() };
  });
}

/**
 * Returns the text of the option marked as correct, or null.
 */
function getCorrectText(slide: SummarySlide): string | null {
  if (!slide.correctAnswer || !Array.isArray(slide.options)) return null;
  const parsed = parseOptions(slide.options);
  return parsed.find(o => o.letter === slide.correctAnswer)?.text ?? null;
}

/**
 * Normalizes a string for comparison: lowercase, collapse spaces,
 * replace typographic minus/en-dash with ASCII hyphen, unify superscripts.
 */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[−–]/g, '-')
    .replace(/⁰/g, '^0').replace(/¹/g, '^1').replace(/²/g, '^2')
    .replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/⁵/g, '^5')
    .replace(/⁶/g, '^6').replace(/⁷/g, '^7').replace(/⁸/g, '^8')
    .replace(/⁹/g, '^9')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Math detection: like-term reduction ──────────────────────────────────────
//
// Matches expressions like:
//   3m + 5m     →  8m
//   4x² - x²   →  3x²
//   -2ab + 6ab  →  4ab
//   x + 3x      →  4x
//   2,5m + 1,5m →  4m
//
// Pattern: (coefficient)(variable) (op) (coefficient)(variable)
// where both variable parts are identical after normalization.

const LIKE_TERM_RE =
  /(-?\d*(?:[.,]\d+)?)\s*([a-záéíóúüñA-Z][a-záéíóúüñA-Z0-9⁰¹²³⁴⁵⁶⁷⁸⁹^_]*)\s*([+\-−])\s*(\d*(?:[.,]\d+)?)\s*([a-záéíóúüñA-Z][a-záéíóúüñA-Z0-9⁰¹²³⁴⁵⁶⁷⁸⁹^_]*)/;

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

/**
 * If the question contains a like-term binary expression AND evaluation intent,
 * returns the expected reduced result string. Returns null otherwise.
 */
function tryReduceLikeTerms(question: string): string | null {
  if (!EVALUATION_KEYWORDS.test(question)) {
    // Also trigger if there's an "=" or "?" after the expression (implicit evaluation)
    if (!/[=?]/.test(question)) return null;
  }

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

// ── Math detection: simple integer arithmetic ─────────────────────────────────
//
// Matches: "3 + 5 =", "24 ÷ 6?", "7 × 8 ="
// Only integers or simple decimals, exact result.

const ARITHMETIC_RE =
  /(\d+(?:[.,]\d+)?)\s*([+\-−×x÷\/\*])\s*(\d+(?:[.,]\d+)?)\s*[=?]/;

function trySimpleArithmetic(question: string): string | null {
  const m = ARITHMETIC_RE.exec(question);
  if (!m) return null;
  const a = parseFloat(m[1].replace(',', '.'));
  const b = parseFloat(m[3].replace(',', '.'));
  const op = m[2];
  let result: number;
  switch (op) {
    case '+':                      result = a + b; break;
    case '-': case '−':            result = a - b; break;
    case '*': case '×': case 'x': result = a * b; break;
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

/**
 * Returns the mathematical expected result for a question, or null if
 * the question doesn't contain a detectable evaluable expression.
 */
function computeExpected(question: string): string | null {
  return tryReduceLikeTerms(question) ?? trySimpleArithmetic(question);
}

// ── Validators ────────────────────────────────────────────────────────────────

function validateCorrectAnswer(slide: SummarySlide, index: number): TruthFailure | null {
  if (!slide.question || !slide.options || !slide.correctAnswer) return null;

  const expected = computeExpected(slide.question);
  if (expected === null) return null;  // not a detectable math question

  const correctText = getCorrectText(slide);
  if (!correctText) return null;

  const normExpected = norm(expected);
  const normCorrect  = norm(correctText);

  // Accept if one is contained in the other (handles "resultado: 8m" → "8m")
  if (normCorrect.includes(normExpected) || normExpected.includes(normCorrect)) return null;

  console.log(`[TruthValidator] incorrect_answer detected at slide ${index} — expected "${expected}", got "${correctText}"`);
  return {
    slideId: makeSlideId(slide, index),
    type: 'incorrect_answer',
    message: `[${slide.type}] expected result "${expected}" but correctAnswer is "${correctText}" (question: "${slide.question.slice(0, 80)}")`,
  };
}

function validateUniqueCorrectOption(slide: SummarySlide, index: number): TruthFailure | null {
  if (!slide.question || !slide.options || !slide.correctAnswer) return null;

  const expected = computeExpected(slide.question);
  if (expected === null) return null;

  const parsed = parseOptions(slide.options);
  const normExpected = norm(expected);
  const matching = parsed.filter(o => {
    const t = norm(o.text);
    return t.includes(normExpected) || normExpected.includes(t);
  });

  if (matching.length > 1) {
    const letters = matching.map(o => o.letter).join(', ');
    console.log(`[TruthValidator] multiple_correct detected at slide ${index} — options ${letters} match "${expected}"`);
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

  const parsed = parseOptions(slide.options);
  const correctText = getCorrectText(slide);
  const seen = new Set<string>();

  for (const opt of parsed) {
    const t = norm(opt.text);

    // Distractor identical to correct answer
    if (opt.letter !== slide.correctAnswer && correctText && t === norm(correctText)) {
      console.log(`[TruthValidator] invalid_distractor detected at slide ${index} — ${opt.letter} identical to correctAnswer`);
      return {
        slideId: makeSlideId(slide, index),
        type: 'invalid_distractor',
        message: `[${slide.type}] distractor ${opt.letter} is identical to correctAnswer`,
      };
    }

    // Duplicate options
    if (seen.has(t)) {
      console.log(`[TruthValidator] invalid_distractor detected at slide ${index} — duplicate option "${opt.text}"`);
      return {
        slideId: makeSlideId(slide, index),
        type: 'invalid_distractor',
        message: `[${slide.type}] duplicate option text: "${opt.text}"`,
      };
    }
    seen.add(t);
  }
  return null;
}

/**
 * Checks that the explanation (definition) doesn't cite a numeric result
 * that belongs to a wrong option while the correct result is absent.
 * Conservative: only flags clear numeric contradictions.
 */
function validateExplanation(slide: SummarySlide, index: number): TruthFailure | null {
  if (!slide.definition || !slide.question || !slide.correctAnswer || !Array.isArray(slide.options)) return null;

  const correctText = getCorrectText(slide);
  if (!correctText) return null;

  // Extract leading integers from the correct answer (e.g., "8" from "8m")
  const correctNumbers: string[] = Array.from(correctText.match(/\d+/g) ?? []);
  if (correctNumbers.length === 0) return null;

  const parsed = parseOptions(slide.options);
  const wrongNumbers = parsed
    .filter(o => o.letter !== slide.correctAnswer)
    .flatMap(o => o.text.match(/\d+/g) ?? [])
    .filter(n => !correctNumbers.includes(n));

  const defNorm = norm(slide.definition);
  const defHasCorrect = correctNumbers.some(n => defNorm.includes(n));
  const contradictingNumbers = wrongNumbers.filter(n => defNorm.includes(n));

  if (!defHasCorrect && contradictingNumbers.length > 0) {
    const bad = contradictingNumbers[0];
    console.log(`[TruthValidator] broken_explanation detected at slide ${index} — definition mentions "${bad}" but correct answer is "${correctText}"`);
    return {
      slideId: makeSlideId(slide, index),
      type: 'broken_explanation',
      message: `[${slide.type}] definition references "${bad}" but correct answer is "${correctText}"`,
    };
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs all truth checks on interactive slides.
 * Async signature for forward compatibility (future subject-specific async rules).
 *
 * @param slides       - Slides from the generated session summary
 * @param sourceContent - Original document transcription (reserved for future rules)
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

    const f1 = validateCorrectAnswer(slide, i);
    if (f1) failures.push(f1);

    const f2 = validateUniqueCorrectOption(slide, i);
    if (f2) failures.push(f2);

    const f3 = validateDistractors(slide, i);
    if (f3) failures.push(f3);

    const f4 = validateExplanation(slide, i);
    if (f4) failures.push(f4);
  }

  const total = interactiveSlides.length;
  const failedSlides = new Set(failures.map(f => f.slideId)).size;
  const score = total === 0 ? 1 : Math.max(0, 1 - failedSlides / total);

  // Only hard-fail on logical errors (wrong answer, multiple correct).
  // Distractor/explanation issues are warnings that trigger regeneration but don't block.
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

/**
 * Builds a prompt feedback block for regeneration when truth validation fails.
 * Injected into the retry prompt alongside other quality feedback.
 */
export function buildTruthFeedback(result: TruthValidationResult): string {
  const lines: string[] = [
    '⚠️ ERRORES DE VERDAD LÓGICA — corregir TODOS antes de regenerar JSON:',
  ];
  for (const f of result.failures) {
    const label = {
      incorrect_answer: '❌ RESPUESTA INCORRECTA',
      multiple_correct: '❌ MÚLTIPLES CORRECTAS',
      invalid_distractor: '⚠️ DISTRACTOR INVÁLIDO',
      broken_explanation: '⚠️ EXPLICACIÓN CONTRADICE RESPUESTA',
    }[f.type];
    lines.push(`  ${label}: ${f.message}`);
  }
  lines.push('');
  lines.push('INSTRUCCIÓN: Para cada error, recalcula la respuesta correcta paso a paso antes de escribir correctAnswer.');
  return lines.join('\n');
}
