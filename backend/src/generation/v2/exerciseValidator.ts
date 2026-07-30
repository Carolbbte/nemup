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

import { evaluate, parse, simplify } from 'mathjs';
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
    // '{'/'[' and '}'/']' are treated as plain grouping parens — Chilean
    // math notation nests signos de agrupación as ( ) → [ ] → { } for
    // readability (e.g. "5 - {3 - [2 + 4]}"), and worked examples copied
    // verbatim from source material can carry that notation straight
    // through. Left unhandled, these fell into the "unknown character,
    // skip it" branch below — silently DELETED rather than caught as an
    // error, which corrupts the expression's value instead of failing
    // loudly (confirmed: "5 - {3 - [2 + 4 - (1+1)]}", correct value 6,
    // evaluated to 2 once the deleted braces/brackets left "5-3-2+4-(1+1)"
    // behind). Mapping them to lparen/rparen here — rather than converting
    // to literal "(" text upstream in sanitizeMathText — keeps this purely
    // an INTERNAL parsing concern: the student-facing text (sanitizeMathText's
    // own output, shown as-is in the UI) still displays the original
    // bracket shapes, only this math-checking/derivation path treats them
    // as equivalent to parens.
    if (c === '(' || c === '[' || c === '{') { tokens.push({ kind: 'lparen' }); i++; continue; }
    if (c === ')' || c === ']' || c === '}') { tokens.push({ kind: 'rparen' }); i++; continue; }
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

// ── mathjs syntax → student-facing display notation ─────────────────────────

const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/** Custom per-node override passed to mathjs Node#toString — returning
 * `undefined` falls back to mathjs's own (precedence-aware) default
 * rendering for that node, so this only needs to special-case the two
 * things toMathjsSyntax's forward direction introduces: explicit `^N` and
 * explicit `*`. */
function displayHandler(node: any, options: any): string | undefined {
  if (node.type === 'OperatorNode' && node.fn === 'pow') {
    const exp = node.args[1];
    if (exp.type === 'ConstantNode' && Number.isInteger(exp.value) && exp.value >= 0 && exp.value <= 9) {
      return `${node.args[0].toString({ ...options, handler: displayHandler })}${SUPERSCRIPT_DIGITS[exp.value]}`;
    }
    return undefined;
  }
  if (node.type === 'OperatorNode' && node.fn === 'multiply') {
    const [a, b] = node.args;
    // Both sides plain numbers ("6*4") — resolve to the computed value
    // ("24") rather than showing an unresolved product, per the spec.
    if (a.type === 'ConstantNode' && b.type === 'ConstantNode') {
      return String(Number(a.value) * Number(b.value));
    }
    // Implicit multiplication — no visible operator between the two sides.
    return `${a.toString({ ...options, handler: displayHandler })}${b.toString({ ...options, handler: displayHandler })}`;
  }
  if (node.type === 'OperatorNode' && node.fn === 'unaryMinus') {
    const arg = node.args[0];
    // Only for a simple negated term (constant/symbol/product/power) — "-4x"
    // not "-(4x)". Left to mathjs's own default (parenthesized) rendering
    // when the argument is itself a sum, where dropping the parens WOULD
    // change the meaning (e.g. "-(a+b)" must never become "-a+b").
    if (arg.type === 'OperatorNode' && (arg.fn === 'add' || arg.fn === 'subtract')) return undefined;
    return `-${arg.toString({ ...options, handler: displayHandler })}`;
  }
  return undefined;
}

/**
 * Converts a mathjs-syntax expression into student-facing display notation:
 * implicit multiplication, unicode superscripts for small integer exponents,
 * and a resolved value where two plain numbers are multiplied together.
 * Attempts `simplify()` first to also combine like terms in an already-flat
 * sum (e.g. "6*x + 4*x" → "10x") — but this is DISPLAY ONLY, never used for
 * correctness logic. `simplify()` is not reliable at fully expanding a raw
 * product of parenthesized sums (confirmed empirically: it left
 * "(x+6)*(x+4)-x^2" completely unexpanded, and mangled a more complex case
 * into a wrong-looking factored form) — the same "mañas" procedural.ts's own
 * `resultsMatch` comment already documents avoiding for equivalence checks.
 * Callers must only ever feed this an expression whose mathematical
 * correctness was ALREADY confirmed some other way (numeric evaluation) —
 * an occasional imperfectly-reduced (but not wrong) display is an
 * acceptable tradeoff here; it would not be for a pass/fail check.
 */
export function toDisplayMath(mathjsExpr: string): string {
  try {
    return simplify(mathjsExpr).toString({ handler: displayHandler });
  } catch {
    try {
      return parse(mathjsExpr).toString({ handler: displayHandler });
    } catch {
      return mathjsExpr;
    }
  }
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

// ── Monomial decomposition — combining like terms WITHOUT simplify() ───────

/** A single monomial's numeric coefficient and variable "shape" (exponent
 * per variable, e.g. {x: 2, y: 1} for a 5x²y-type term; empty for a bare
 * constant). */
export interface Monomial {
  coefficient: number;
  powers: Map<string, number>;
}

/**
 * Parses a single mathjs node as a monomial (product of a numeric
 * coefficient and variables raised to constant integer powers), or `null`
 * if it isn't one (contains a top-level +/-, a division, a function call,
 * etc. — i.e. it's not one term). Exported so callers needing just the
 * shape (no coefficient) can still build it from this.
 */
export function parseMonomial(node: any): Monomial | null {
  let coefficient = 1;
  const powers = new Map<string, number>();
  let ok = true;

  function walk(n: any, expFactor: number): void {
    if (!ok) return;
    if (n.type === 'ConstantNode') { coefficient *= Math.pow(Number(n.value), expFactor); return; }
    if (n.type === 'SymbolNode') {
      if (MATHJS_BUILTINS.has(n.name)) { ok = false; return; }
      powers.set(n.name, (powers.get(n.name) ?? 0) + expFactor);
      return;
    }
    if (n.type === 'ParenthesisNode') { walk(n.content, expFactor); return; }
    if (n.type === 'OperatorNode') {
      if (n.fn === 'multiply') { walk(n.args[0], expFactor); walk(n.args[1], expFactor); return; }
      if (n.fn === 'unaryMinus') { coefficient *= -1; walk(n.args[0], expFactor); return; }
      if (n.fn === 'unaryPlus') { walk(n.args[0], expFactor); return; }
      if (n.fn === 'pow' && n.args[1].type === 'ConstantNode') { walk(n.args[0], expFactor * Number(n.args[1].value)); return; }
    }
    ok = false; // add/subtract/divide/function-call/anything else — not a pure monomial
  }

  walk(node, 1);
  return ok ? { coefficient, powers } : null;
}

/** Canonical string key for a monomial's variable shape (e.g. "x^2y^1", "" for a constant) — order-independent, used to group like terms. */
export function signatureFromPowers(powers: Map<string, number>): string {
  return [...powers.entries()]
    .filter(([, exp]) => Math.abs(exp) > 1e-9)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, exp]) => `${name}^${exp}`)
    .join('');
}

/**
 * Walks a mathjs node's top-level +/- chain, collecting each additive term
 * as a parsed Monomial (with `sign` already folded into its coefficient).
 * Returns `null` if ANY top-level term isn't a pure monomial (e.g. a
 * genuinely unexpanded product survived) — callers must treat that as "we
 * can't safely decompose this", never guess.
 */
function collectAdditiveMonomials(node: any, sign: number): Monomial[] | null {
  if (node.type === 'ParenthesisNode') return collectAdditiveMonomials(node.content, sign);
  if (node.type === 'OperatorNode' && node.fn === 'add') {
    const a = collectAdditiveMonomials(node.args[0], sign);
    const b = collectAdditiveMonomials(node.args[1], sign);
    return a && b ? [...a, ...b] : null;
  }
  if (node.type === 'OperatorNode' && node.fn === 'subtract') {
    const a = collectAdditiveMonomials(node.args[0], sign);
    const b = collectAdditiveMonomials(node.args[1], -sign);
    return a && b ? [...a, ...b] : null;
  }
  if (node.type === 'OperatorNode' && node.fn === 'unaryMinus') return collectAdditiveMonomials(node.args[0], -sign);
  if (node.type === 'OperatorNode' && node.fn === 'unaryPlus') return collectAdditiveMonomials(node.args[0], sign);
  const m = parseMonomial(node);
  return m ? [{ coefficient: m.coefficient * sign, powers: m.powers }] : null;
}

function totalDegree(powers: Map<string, number>): number {
  return [...powers.values()].reduce((sum, e) => sum + e, 0);
}

function toSuperscript(n: number): string {
  return String(n).split('').map((d) => SUPERSCRIPT_DIGITS[Number(d)] ?? d).join('');
}

/** Renders one combined monomial in student notation — coefficient omitted
 * only when it's exactly 1 (or -1) AND there are variables (a bare constant
 * always shows its number, even "1"). `isFirst` controls whether a leading
 * "+" is rendered (never) and whether a negative sign attaches directly
 * ("-2x²") vs as a spaced operator (" - 2x²"). */
function renderMonomial(m: Monomial, isFirst: boolean): string {
  const abs = Math.abs(m.coefficient);
  const hasVars = m.powers.size > 0;
  const varPart = [...m.powers.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, exp]) => (Math.abs(exp - 1) < 1e-9 ? name : `${name}${toSuperscript(exp)}`))
    .join('');
  const coefStr = hasVars && Math.abs(abs - 1) < 1e-9
    ? ''
    : (Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace(/\.?0+$/, ''));
  const body = `${coefStr}${varPart}`;
  if (isFirst) return m.coefficient < 0 ? `-${body}` : body;
  return m.coefficient < 0 ? ` - ${body}` : ` + ${body}`;
}

/**
 * Combines like terms in a flat additive mathjs expression — DETERMINISTIC,
 * never uses `simplify()`. This exists because `simplify()` is not reliable
 * for exactly this operation: `simplify("2*x^2 + 5*x + 3 - 4*x^2 + 2*x + 8*x")`
 * (confirmed empirically) returns `"13*x + 2*(x^2 + x) + 3 - 4*x^2"` — it
 * correctly combined 5x+8x into 13x, but then FACTORED a common 2 out of
 * the leftover "2*x^2" and "2*x" into `2*(x^2+x)`, silently corrupting the
 * "2x" term's own coefficient when later pretty-printed term-by-term. This
 * function instead parses the expression into monomials directly (via
 * parseMonomial/collectAdditiveMonomials — no CAS, no restructuring),
 * groups by variable shape, sums coefficients, drops zero-coefficient
 * groups, and renders highest-degree-first — the literal operation these
 * exercises are teaching, not a general algebraic simplification.
 *
 * Falls back to `toDisplayMath` (pretty-print without combining) if the
 * expression isn't a flat sum of monomials (an unexpanded product slipped
 * through) — never fabricates a combined result it can't actually compute.
 */
export function combineLikeTerms(mathjsExpr: string): string {
  let node: any;
  try {
    node = parse(mathjsExpr);
  } catch {
    return mathjsExpr;
  }

  const monomials = collectAdditiveMonomials(node, 1);
  if (!monomials) return toDisplayMath(mathjsExpr);

  const groups = new Map<string, Monomial>();
  for (const m of monomials) {
    const sig = signatureFromPowers(m.powers);
    const existing = groups.get(sig);
    if (existing) existing.coefficient += m.coefficient;
    else groups.set(sig, { coefficient: m.coefficient, powers: m.powers });
  }

  const combined = [...groups.values()]
    .filter((g) => Math.abs(g.coefficient) > 1e-9)
    .sort((a, b) => totalDegree(b.powers) - totalDegree(a.powers));

  if (combined.length === 0) return '0';
  return combined.map((g, i) => renderMonomial(g, i === 0)).join('');
}

/**
 * True iff `correctTermMathjs` is (mathematically) one of `correctFormMathjs`'s
 * top-level additive terms — same or opposite sign counts as long as the
 * VALUE matches, since a term's sign is part of its value. Replaces a plain
 * substring search (`correctForm.indexOf(correctTerm)`), which is fragile
 * to formatting (a model-authored "-5*x^2*y" failing to match the literal
 * "- 5*x^2*y" that appears inside correctForm, with the minus rendered as a
 * spaced binary operator instead of glued to the coefficient — a real
 * false-reject observed in production logs). Returns `false` (never throws)
 * if either side fails to parse, or if correctForm isn't a flat sum of
 * monomials — callers must treat that as "can't confirm", same as any
 * other unverifiable case.
 */
export function isAdditiveTermOf(correctFormMathjs: string, correctTermMathjs: string): boolean {
  let formNode: any;
  let termNode: any;
  try {
    formNode = parse(correctFormMathjs);
    termNode = parse(correctTermMathjs);
  } catch {
    return false;
  }
  const term = parseMonomial(termNode);
  if (!term) return false;
  const formTerms = collectAdditiveMonomials(formNode, 1);
  if (!formTerms) return false;

  const termSig = signatureFromPowers(term.powers);
  return formTerms.some((t) =>
    signatureFromPowers(t.powers) === termSig
    && Math.abs(t.coefficient - term.coefficient) < 1e-6 * Math.max(1, Math.abs(t.coefficient)),
  );
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

// ── Unit stripping ───────────────────────────────────────────────────────

// Only matches when the ENTIRE trimmed string is a bare number followed by
// a unit (e.g. "49 cm²" → "49") — never inside a longer expression like
// "7m + 6n". That whole-string requirement is what makes it safe to include
// single-letter units (m, g, s) here despite them colliding with common
// single-letter variable names (procedural.ts's own TRAILING_UNIT_RE
// deliberately excludes bare "m" for exactly that collision) — a multi-term
// algebraic answer never matches this pattern, so the ambiguity only
// applies to a correctAnswer/distractor that's nothing but "<number><unit>",
// where "unit" is overwhelmingly the intended reading in this app's math/
// physics/chemistry exercises.
const UNIT_SUFFIX_RE = /^(-?\d+(?:[.,]\d+)?)\s*(cm²|cm2|cm³|cm3|mm²|mm2|km²|km2|m²|m2|m³|m3|cm|mm|km|kg|mg|ml|°c|°f|kg|g|l|m|s)\.?$/i;

/** Exported for testing. */
export function stripUnitSuffix(raw: string): string {
  const trimmed = raw.trim();
  const m = UNIT_SUFFIX_RE.exec(trimmed);
  return m ? m[1] : trimmed;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Validates one generated exercise's math. No-op (`ok:true`) for
 * `kind !== 'calculation'` — `recognition` exercises aren't numeric and are
 * exempt, same scoping the spec asks for.
 *
 * `invalid` is only ever returned when the comparison is trustworthy: either
 * checkExpression is a fully-resolvable raw operation (post the "never
 * pre-solve it yourself" prompt instruction in exerciseGenerator.ts) that
 * genuinely disagrees with correctAnswer, or a distractor self-referentially
 * matches correctAnswer (no external ground truth needed for that one — see
 * its own comment below). Anything the validator merely COULDN'T read
 * (missing/unparseable checkExpression, unresolved free variables against a
 * concrete answer) is `unverifiable`, never `invalid` — it must never be the
 * answer's fault that the check itself has a gap.
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

  const checkExpr = toMathjsSyntax(stripUnitSuffix(rawCheck));
  try {
    parse(checkExpr);
  } catch {
    return { ok: false, reason: 'unverifiable', message: `checkExpression no parseable: "${rawCheck}" → "${checkExpr}".` };
  }

  const fixedVars: Record<string, number> = Object.fromEntries(
    (ex.variables ?? []).map((v) => [v.name, v.value]),
  );

  const correctExpr = toMathjsSyntax(stripUnitSuffix(ex.correctAnswer ?? ''));

  // Fix 3: checkExpression still has a free variable the exercise never
  // substituted, but correctAnswer is a concrete number — there is no
  // ground truth to check the answer against. Not the answer's fault (it
  // may well be correct), so this must be 'unverifiable', never 'invalid':
  // without this guard, expressionsEqual would substitute a RANDOM value
  // for the unresolved symbol and almost always find a mismatch, wrongly
  // discarding a good exercise.
  let checkFreeSymbols: string[];
  let correctFreeSymbols: string[];
  try {
    checkFreeSymbols = extractFreeSymbols(checkExpr).filter((s) => !(s in fixedVars));
    correctFreeSymbols = extractFreeSymbols(correctExpr);
  } catch {
    return { ok: false, reason: 'unverifiable', message: `correctAnswer no parseable: "${ex.correctAnswer}" → "${correctExpr}".` };
  }
  if (checkFreeSymbols.length > 0 && correctFreeSymbols.length === 0) {
    return {
      ok: false,
      reason: 'unverifiable',
      message: `checkExpression tiene variable(s) libre(s) sin sustituir (${checkFreeSymbols.join(', ')}) pero correctAnswer es un valor concreto — no se puede establecer verdad de terreno.`,
    };
  }

  const correctEq = expressionsEqual(checkExpr, correctExpr, fixedVars);
  if (correctEq === null) {
    return { ok: false, reason: 'unverifiable', message: `correctAnswer no parseable: "${ex.correctAnswer}" → "${correctExpr}".` };
  }
  if (correctEq === false) {
    return { ok: false, reason: 'invalid', message: `correctAnswer "${ex.correctAnswer}" no coincide con checkExpression "${rawCheck}".` };
  }

  for (const d of ex.distractors ?? []) {
    const distractorExpr = toMathjsSyntax(stripUnitSuffix(d.text ?? ''));
    const distractorEq = expressionsEqual(checkExpr, distractorExpr, fixedVars);
    // A distractor that fails to parse is NOT unverifiable for the whole
    // exercise — distractors are free-form "plausible wrong answers" and
    // aren't required to be clean expressions (e.g. "olvidó aplicar el
    // exponente" could be prose). Only an explicit math MATCH (distractorEq
    // === true) is actionable here; null/false are both fine. This check
    // never needs the Fix 3 guard above either — it's self-referential
    // (checkExpression vs the exercise's OWN distractor text), no external
    // ground truth required, so it stays high-confidence regardless.
    if (distractorEq === true) {
      return { ok: false, reason: 'invalid', message: `distractor "${d.text}" es matemáticamente igual a correctAnswer — dos opciones "correctas".` };
    }
  }

  return { ok: true };
}
