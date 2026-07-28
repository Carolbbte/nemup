/**
 * Deterministic math truth-check for generated calculation exercises — the
 * same "reconcile" discipline procedural.ts's reconcileWorkedExample already
 * applies to worked-example steps, but here the ground truth comes from
 * mathjs evaluating `checkExpression` instead of a material-provided answer,
 * since generateExercises invents its own exercises from scratch (nothing to
 * reconcile against except the model's own stated expression).
 *
 * No AI call happens here — regenerating with AI would just risk
 * hallucinating a second time. This is real arithmetic/CAS evaluation.
 */

import { evaluate, parse } from 'mathjs';
import { sanitizeMathText } from '../../services/mathNotation.js';
import type { GeneratedExercise } from './exerciseGenerator.js';

export type ExerciseValidation =
  | { ok: true }
  // 'invalid' — checkExpression parsed fine, but the math itself is wrong
  // (correctAnswer doesn't match, or a distractor secretly does). This is
  // the actual bug this layer exists to catch — safe to discard.
  | { ok: false; reason: 'invalid'; message: string }
  // 'unverifiable' — checkExpression is missing, or SOMETHING (checkExpression,
  // correctAnswer, or a distractor) didn't survive toMathjsSyntax's
  // preprocessing into a parseable expression. This is NOT proof the math is
  // wrong — it's proof the validator couldn't read it. Logged and counted
  // SEPARATELY from 'invalid' on purpose: a high unverifiable rate points at
  // the preprocessor/prompt, not at bad exercises, and must be driven down
  // before EXERCISE_VALIDATION_MODE ever moves to 'enforce' (see
  // exerciseGenerator.ts).
  | { ok: false; reason: 'unverifiable'; message: string };

// ── Display-notation → mathjs syntax ────────────────────────────────────────

const SUPERSCRIPT_MAP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

// Function names mathjs recognizes natively — kept as a single atomic token
// by the tokenizer below instead of being split into single-letter
// variables, so "sin(x)" never turns into "s*i*n(x)". Plausible in this
// app's exercisable subjects (trigonometría, física, química: sqrt/log turn
// up in formulas too), so this isn't a hypothetical.
const KNOWN_FUNCTIONS = new Set(['asin', 'acos', 'atan', 'log10', 'sqrt', 'log', 'sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'min', 'max']);

type Token =
  | { kind: 'num'; text: string }
  | { kind: 'var'; text: string }
  | { kind: 'func'; text: string }
  | { kind: 'op'; text: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

/**
 * Single left-to-right scan (never a chained regex-replace — a first attempt
 * at this using sequential global regexes had two real bugs: `\b` doesn't
 * fire between a digit and an immediately-following letter with nothing
 * between them yet, and JS's non-overlapping `.replace(/g)` match
 * consumption skips every other boundary in a 3+ letter run, e.g. "3ab"
 * would only get ONE '*' inserted instead of two. A tokenizer sidesteps both:
 * every letter run is classified exactly once, and every adjacent-token
 * boundary is inspected exactly once).
 *
 * A maximal run of letters becomes ONE `func` token when it exactly matches
 * a KNOWN_FUNCTIONS name and is immediately (mod whitespace) followed by
 * "(" — otherwise every letter in the run becomes its OWN single-character
 * `var` token (each letter is its own variable, same assumption
 * canonicalNormalizer.ts's calcDegree already makes for this codebase's
 * algebra notation).
 */
function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { tokens.push({ kind: 'lparen' }); i++; continue; }
    if (c === ')') { tokens.push({ kind: 'rparen' }); i++; continue; }
    if (/[+\-*/^]/.test(c)) { tokens.push({ kind: 'op', text: c }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ kind: 'num', text: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      const run = s.slice(i, j);
      let k = j;
      while (k < s.length && /\s/.test(s[k])) k++;
      if (KNOWN_FUNCTIONS.has(run.toLowerCase()) && s[k] === '(') {
        tokens.push({ kind: 'func', text: run });
      } else {
        for (const ch of run) tokens.push({ kind: 'var', text: ch });
      }
      i = j;
      continue;
    }
    // Unknown character (shouldn't occur post-normalization) — skip it
    // rather than throw; mathjs.parse on the final string still catches a
    // genuinely broken expression and reports 'unverifiable'.
    i++;
  }
  return tokens;
}

const VALUE_KINDS = new Set(['num', 'var', 'func', 'rparen']);
const OPEN_KINDS = new Set(['num', 'var', 'func', 'lparen']);

/** Renders tokens back to a mathjs-parseable string, inserting '*' at every
 * value→value-or-open boundary EXCEPT a function token directly followed by
 * its own call parenthesis (`sin` + `(` must stay `sin(`, never `sin*(`). */
function render(tokens: Token[]): string {
  let out = '';
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (idx > 0) {
      const prev = tokens[idx - 1];
      const isFuncCall = prev.kind === 'func' && t.kind === 'lparen';
      if (VALUE_KINDS.has(prev.kind) && OPEN_KINDS.has(t.kind) && !isFuncCall) out += '*';
    }
    if (t.kind === 'lparen') out += '(';
    else if (t.kind === 'rparen') out += ')';
    else out += t.text;
  }
  return out;
}

/**
 * Converts student-facing math notation (as written in `correctAnswer`/
 * `distractors[].text`, or a `checkExpression` that didn't fully comply with
 * the "use * and ^" prompt instruction) into mathjs-parseable syntax. This is
 * the single most consequential function in this file — see its own test
 * suite for the ugly-format cases it must survive without either mis-parsing
 * silently (would corrupt the truth check) or over-rejecting (would flood
 * 'unverifiable').
 *
 * Applied AFTER sanitizeMathText (which strips LaTeX but leaves "×"/"^N"
 * as-is, never inserts implicit-multiplication asterisks).
 */
export function toMathjsSyntax(raw: string): string {
  let s = sanitizeMathText(raw).trim();

  // Unicode superscripts → ^N (run digit sequences together: "x⁴y²" → "x^4y^2").
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => '^' + [...run].map((c) => SUPERSCRIPT_MAP[c]).join(''));

  // Operator glyphs → mathjs ASCII equivalents.
  s = s
    .replace(/[−–]/g, '-')
    .replace(/×/g, '*')
    .replace(/·/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '.'); // decimal comma

  return render(tokenize(s));
}

// ── Free-symbol extraction ──────────────────────────────────────────────────

/** Symbol names mathjs parses as identifiers but that are NOT student
 * variables — evaluated as their own constant/function, never substituted. */
const MATHJS_BUILTINS = new Set(['e', 'pi', 'i', 'Infinity', 'NaN']);

/** Every free variable name referenced in a mathjs-syntax expression, excluding builtins. Exported for testing. */
export function extractFreeSymbols(mathjsExpr: string): string[] {
  const names = new Set<string>();
  parse(mathjsExpr).traverse((node: any) => {
    if (node.isSymbolNode && !MATHJS_BUILTINS.has(node.name)) names.add(node.name);
  });
  return [...names];
}

// ── Point-substitution equality (works for both numeric and symbolic) ──────

const TRIALS = 5;
const TOLERANCE = 1e-6;
const MAX_RESAMPLES_PER_TRIAL = 4;
// Deliberately excludes 0 and 1 (and -1) — trivial values that mask real
// errors (e.g. a wrong coefficient multiplying a substituted 0 still
// evaluates to 0, hiding the bug). Range is small non-trivial integers.
const TRIAL_POOL = [-7, -5, -4, -3, -2, 2, 3, 4, 5, 7, 8, 9];

function randomTrialValue(): number {
  return TRIAL_POOL[Math.floor(Math.random() * TRIAL_POOL.length)];
}

function safeEvaluate(mathjsExpr: string, scope: Record<string, number>): number | null {
  try {
    const value = evaluate(mathjsExpr, scope);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * True iff exprA and exprB are mathematically equivalent given `fixedVars`
 * (the exercise's stated variable substitutions). With no free symbols left
 * after substitution, evaluates once. With free symbols remaining (a
 * symbolic/expand-the-polynomial exercise), evaluates both sides at TRIALS
 * random non-trivial integer points and requires equality at every one —
 * probabilistic polynomial-identity testing, robust to term reordering
 * without needing a full CAS `simplify()`.
 *
 * Both sides of a trial are ALWAYS evaluated at the same freshly-drawn scope
 * — if either fails (e.g. division by zero for that particular draw), the
 * whole scope is redrawn and BOTH re-evaluated together, never just the side
 * that failed. Comparing values computed from two different substitutions
 * would be meaningless, not just imprecise.
 *
 * Returns `null` (not a boolean) when a trial's scope can't be resolved for
 * both sides even after resampling — the caller must treat that as
 * 'unverifiable', not as a false 'invalid'.
 */
export function expressionsEqual(
  exprA: string,
  exprB: string,
  fixedVars: Record<string, number>,
): boolean | null {
  let freeSymbols: string[];
  try {
    freeSymbols = [...new Set([...extractFreeSymbols(exprA), ...extractFreeSymbols(exprB)])]
      .filter((s) => !(s in fixedVars));
  } catch {
    return null;
  }

  const trials = freeSymbols.length === 0 ? 1 : TRIALS;
  for (let t = 0; t < trials; t++) {
    let a: number | null = null;
    let b: number | null = null;

    for (let attempt = 0; attempt <= MAX_RESAMPLES_PER_TRIAL && (a === null || b === null); attempt++) {
      const scope = { ...fixedVars };
      for (const sym of freeSymbols) scope[sym] = randomTrialValue();
      a = safeEvaluate(exprA, scope);
      b = safeEvaluate(exprB, scope);
    }

    if (a === null || b === null) return null;
    if (Math.abs(a - b) > TOLERANCE * Math.max(1, Math.abs(a))) return false;
  }
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Validates one generated exercise's math. No-op (`ok:true`) for
 * `kind !== 'calculation'` — `recognition` exercises aren't numeric and are
 * exempt, same scoping the spec asks for.
 *
 * Doesn't separately check "correctAnswer is among the displayed options" —
 * that's not an independent risk here: assemble.ts's fieldsFromExercise
 * (via shuffleWithLetterAnswer) ALWAYS builds the options list as exactly
 * `[correctAnswer, ...distractors]` — there is no other source of options,
 * so correctAnswer is structurally guaranteed to be one of them. The only
 * real question is whether correctAnswer is itself the right value, which
 * the check below answers directly.
 */
export function validateCalculationExercise(ex: GeneratedExercise): ExerciseValidation {
  if (ex.kind !== 'calculation') return { ok: true };

  const rawCheck = (ex.checkExpression ?? '').trim();
  if (!rawCheck) {
    return { ok: false, reason: 'unverifiable', message: 'checkExpression ausente.' };
  }

  const checkExpr = toMathjsSyntax(rawCheck);
  try {
    parse(checkExpr);
  } catch {
    return { ok: false, reason: 'unverifiable', message: `checkExpression no parseable: "${rawCheck}" → "${checkExpr}".` };
  }

  const fixedVars: Record<string, number> = Object.fromEntries(
    (ex.variables ?? []).map((v) => [v.name, v.value]),
  );

  const correctExpr = toMathjsSyntax(ex.correctAnswer ?? '');
  const correctEq = expressionsEqual(checkExpr, correctExpr, fixedVars);
  if (correctEq === null) {
    return { ok: false, reason: 'unverifiable', message: `correctAnswer no parseable: "${ex.correctAnswer}" → "${correctExpr}".` };
  }
  if (correctEq === false) {
    return { ok: false, reason: 'invalid', message: `correctAnswer "${ex.correctAnswer}" no coincide con checkExpression "${rawCheck}".` };
  }

  for (const d of ex.distractors ?? []) {
    const distractorExpr = toMathjsSyntax(d.text ?? '');
    const distractorEq = expressionsEqual(checkExpr, distractorExpr, fixedVars);
    // A distractor that fails to parse is NOT unverifiable for the whole
    // exercise — distractors are free-form "plausible wrong answers" and
    // aren't required to be clean expressions (e.g. "olvidó aplicar el
    // exponente" could be prose). Only an explicit math MATCH (distractorEq
    // === true) is actionable here; null/false are both fine.
    if (distractorEq === true) {
      return { ok: false, reason: 'invalid', message: `distractor "${d.text}" es matemáticamente igual a correctAnswer — dos opciones "correctas".` };
    }
  }

  return { ok: true };
}
