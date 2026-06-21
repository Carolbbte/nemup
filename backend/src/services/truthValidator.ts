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
import {
  type ContentType,
  type NormalizedOption,
  type CanonicalizationResult,
  detectContentType,
  normalizeCanonicalForm,
  canonicalizeSlide,
} from './canonicalNormalizer.js';
import type { KnowledgeGraph } from './knowledgeExtractor.js';

// ── Public truth-validation types ─────────────────────────────────────────────

export interface TruthFailure {
  slideId: string;
  type: 'incorrect_answer' | 'multiple_correct' | 'invalid_distractor' | 'broken_explanation' | 'kg_violation';
  message: string;
}

export interface TruthValidationResult {
  passed: boolean;
  score: number;          // 0–1, fraction of interactive slides with zero hard failures
  failures: TruthFailure[];
}

// Re-export canonical normalizer types so callers that imported from here don't break
export type { ContentType, NormalizedOption, CanonicalizationResult };
export { detectContentType, normalizeCanonicalForm, canonicalizeSlide };

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

// ── KnowledgeGraph-aware validators ──────────────────────────────────────────

const KG_STOP_WORDS = new Set([
  'para', 'como', 'donde', 'tienen', 'siendo', 'mismo', 'misma',
  'mismos', 'mismas', 'desde', 'hasta', 'entre', 'sobre', 'bajo',
  'estos', 'estas', 'aquel', 'aquella', 'cuales', 'todos', 'todas',
  'cada', 'otros', 'otras', 'dicho', 'dicha', 'dichos', 'dichas',
]);

/**
 * Entity consistency: when a slide's question references a KG entity's context (≥2 content
 * words match) and the entity value appears in at least one option, the correct answer must
 * contain the entity value.
 * Catches: "¿En qué año fue la Proclamación de la Independencia?" → KG says 1818, slide marks 1810.
 */
function validateKgEntityConsistency(
  slide: SummarySlide,
  index: number,
  graph: KnowledgeGraph,
): TruthFailure | null {
  if (!slide.question || !Array.isArray(slide.options) || !slide.correctAnswer) return null;
  const correctText = getCorrectText(slide);
  if (!correctText) return null;
  const qNorm = norm(slide.question);
  const cNorm = norm(correctText);
  for (const entity of graph.entities) {
    if (!entity.context) continue;
    const entityVal = norm(entity.value);
    if (entityVal.length < 2) continue;
    const ctxWords = norm(entity.context).split(/\s+/).filter(w => w.length > 3);
    if (ctxWords.filter(w => qNorm.includes(w)).length < 2) continue;
    if (!parseOptions(slide.options).some(o => norm(o.text).includes(entityVal))) continue;
    if (!cNorm.includes(entityVal)) {
      console.log(`[TruthValidator] kg_violation at slide ${index} — KG entity "${entity.value}" expected in correct answer but absent`);
      return {
        slideId: makeSlideId(slide, index),
        type:    'kg_violation',
        message: `[${slide.type}] KG entity "${entity.value}" (${entity.context}) expected in correctAnswer, got "${correctText}"`,
      };
    }
  }
  return null;
}

/**
 * Definition consistency: when the question mentions a KG definition term, the correct
 * answer (if ≥3 words) must share at least one keyword with the KG definition text.
 * Catches prose-answer slides where the AI invented a different definition.
 */
function validateKgDefinitionConsistency(
  slide: SummarySlide,
  index: number,
  graph: KnowledgeGraph,
): TruthFailure | null {
  if (!slide.question || !Array.isArray(slide.options) || !slide.correctAnswer) return null;
  const correctText = getCorrectText(slide);
  if (!correctText || correctText.split(/\s+/).length < 3) return null;
  const qNorm = norm(slide.question);
  for (const def of graph.definitions) {
    const termNorm = norm(def.term);
    if (termNorm.length < 3 || !qNorm.includes(termNorm)) continue;
    const defKeywords = def.definition
      .toLowerCase()
      .split(/[\s,;.:()]+/)
      .filter(w => w.length > 4 && !KG_STOP_WORDS.has(w));
    if (defKeywords.length < 2) continue;
    const cLower = correctText.toLowerCase();
    const overlap = defKeywords.filter(w => cLower.includes(w)).length;
    if (overlap === 0) {
      console.log(`[TruthValidator] kg_violation at slide ${index} — correct answer has 0% keyword overlap with KG definition of "${def.term}"`);
      return {
        slideId: makeSlideId(slide, index),
        type:    'kg_violation',
        message: `[${slide.type}] answer "${correctText.slice(0, 60)}" has no keyword overlap with KG definition of "${def.term}"`,
      };
    }
  }
  return null;
}

/**
 * Example consistency: when a KG example has the form "X = Y" and the slide question
 * references X, the correct answer must match Y.
 * Catches math errors like marking "−4a² + 6a" correct when KG says "−4a²".
 */
function validateKgExampleConsistency(
  slide: SummarySlide,
  index: number,
  graph: KnowledgeGraph,
): TruthFailure | null {
  if (!slide.question || !Array.isArray(slide.options) || !slide.correctAnswer) return null;
  const correctText = getCorrectText(slide);
  if (!correctText) return null;
  const qNorm = norm(slide.question);
  const cNorm = norm(correctText);
  const EXAMPLE_EQ_RE = /^([^=]{3,})\s*=\s*(.+)$/;
  for (const example of graph.examples) {
    const m = EXAMPLE_EQ_RE.exec(example.content);
    if (!m) continue;
    const exInput  = norm(m[1].trim());
    const exOutput = norm(m[2].trim());
    if (exInput.length < 3 || exOutput.length < 1) continue;
    if (!qNorm.includes(exInput.slice(0, 12))) continue;
    if (!cNorm.includes(exOutput) && !exOutput.includes(cNorm)) {
      console.log(`[TruthValidator] kg_violation at slide ${index} — KG example says "${exOutput}" but correctAnswer is "${correctText}"`);
      return {
        slideId: makeSlideId(slide, index),
        type:    'kg_violation',
        message: `[${slide.type}] KG example says result is "${exOutput}" but correctAnswer is "${correctText}"`,
      };
    }
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
  knowledgeGraph?: KnowledgeGraph | null,
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

    // Step 3 — KnowledgeGraph-aware validation (only when KG is available)
    if (knowledgeGraph) {
      const f5 = validateKgEntityConsistency(normalizedSlide, i, knowledgeGraph);
      if (f5) failures.push(f5);

      const f6 = validateKgDefinitionConsistency(normalizedSlide, i, knowledgeGraph);
      if (f6) failures.push(f6);

      const f7 = validateKgExampleConsistency(normalizedSlide, i, knowledgeGraph);
      if (f7) failures.push(f7);
    }
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
    kg_violation:       '⚠️ CONTENIDO CONTRADICE KNOWLEDGE GRAPH',
  };
  for (const f of result.failures) {
    lines.push(`  ${LABELS[f.type]}: ${f.message}`);
  }
  lines.push('');
  lines.push('INSTRUCCIÓN: Para cada error, recalcula la respuesta correcta paso a paso antes de escribir correctAnswer y correctAnswerReason.');
  return lines.join('\n');
}
