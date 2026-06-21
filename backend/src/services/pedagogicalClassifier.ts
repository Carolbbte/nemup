/**
 * Pedagogical classifier — determines the type of learning required by a document
 * and extracts individual skills before generation.
 *
 * Returns a structured SkillExtractionResult so the generation layer can:
 *   1. Route to the correct prompt architecture (CONCEPTUAL / PROCEDURAL / MEMORIZATION / MIXED)
 *   2. Generate a single focused mission for the primary skill
 *   3. Build a learning path listing remaining skills as upcoming missions
 *
 * classifyContent() accepts either:
 *   - string        → legacy regex-based path (unchanged)
 *   - KnowledgeGraph → structured path using extracted concepts/procedures/etc.
 */

import type { KnowledgeGraph } from './knowledgeExtractor.js';

export type PedagogicalType = 'CONCEPTUAL' | 'PROCEDURAL' | 'MEMORIZATION' | 'MIXED';

export interface DetectedSkill {
  skillId: string;
  skillLabel: string;
  confidence: number;  // 0–1
  priority: number;    // 1 = teach first (ascending)
}

export interface ClassificationResult {
  type: PedagogicalType;
  confidence: number;
  scores: { conceptual: number; procedural: number; memorization: number };
  /** Ordered by teaching priority. Index 0 = primary skill for this session. */
  detectedSkills: DetectedSkill[];
}

// ── Type-level indicators (scored to determine CONCEPTUAL/PROCEDURAL/MEMORIZATION) ──

interface Indicator { pattern: RegExp; weight: number }

const PROCEDURAL_INDICATORS: Indicator[] = [
  { pattern: /\b(resuelve|resolver|resuelva|resolviendo)\b/gi, weight: 2 },
  { pattern: /\b(calcula|calcular|calcule|calculando)\b/gi, weight: 2 },
  { pattern: /\b(convierte?|convertir|convierta)\b/gi, weight: 2 },
  { pattern: /\b(transforma|transformar|transforme)\b/gi, weight: 2 },
  { pattern: /\b(simplifica|simplificar|simplifique)\b/gi, weight: 2 },
  { pattern: /\b(reduce|reducir|reduzca|reduciendo|reducci[oó]n)\b/gi, weight: 2 },
  { pattern: /\b(deriva|derivar|derive)\b/gi, weight: 2 },
  { pattern: /\b(factoriza|factorizar|factorice)\b/gi, weight: 2 },
  { pattern: /\b(ordena|ordenar|ordene)\b/gi, weight: 2 },
  { pattern: /\b(halla|hallar|halle)\b/gi, weight: 1.5 },
  { pattern: /\b(determina|determinar|determine)\b/gi, weight: 1.5 },
  { pattern: /\bpaso a paso\b|\bpor pasos\b/gi, weight: 1.5 },
  { pattern: /\b(procedimiento|algoritmo)\b/gi, weight: 1.5 },
  { pattern: /\bejercicio[s]?\b/gi, weight: 1 },
  { pattern: /\boperaci[oó]n[es]?\b/gi, weight: 1 },
  { pattern: /\d+\/\d+/g, weight: 1 },        // fractions like 4/15
  { pattern: /\d+[,.]\d{2,}/g, weight: 0.5 },  // multi-decimal numbers
];

const CONCEPTUAL_INDICATORS: Indicator[] = [
  { pattern: /\bexplica[r]?\b/gi, weight: 2 },
  { pattern: /\bcomprende[r]?\b/gi, weight: 1.5 },
  { pattern: /\brelaci[oó]n\b/gi, weight: 1.5 },
  { pattern: /\bcausa[s]?\b/gi, weight: 1.5 },
  { pattern: /\befecto[s]?\b/gi, weight: 1.5 },
  { pattern: /\bpor qu[eé]\b/gi, weight: 2 },
  { pattern: /\bc[oó]mo funciona\b/gi, weight: 2 },
  { pattern: /\binterpreta[r]?\b/gi, weight: 1.5 },
  { pattern: /\bdescribe[r]?\b/gi, weight: 1.5 },
  { pattern: /\banaliza[r]?\b/gi, weight: 1.5 },
  { pattern: /\bconcepto[s]?\b/gi, weight: 1 },
  { pattern: /\bteor[ií]a[s]?\b/gi, weight: 1 },
  { pattern: /\bfen[oó]meno[s]?\b/gi, weight: 1.5 },
  { pattern: /\bprincipio[s]?\b/gi, weight: 1 },
  { pattern: /\bpropagaci[oó]n\b/gi, weight: 1.5 },
  { pattern: /\bfrecuencia\b|\bamplitud\b|\bonda[s]?\b/gi, weight: 1 },
  { pattern: /\bc[eé]lula[s]?\b|\bfotosíntesis\b|\bevolución\b/gi, weight: 1 },
  // Algebra / math conceptual signals
  { pattern: /\bsemejante[s]?\b/gi, weight: 1.5 },
  { pattern: /\bexpresi[oó]n[es]?\s+algebraica[s]?\b/gi, weight: 2 },
  { pattern: /\bparte\s+literal\b/gi, weight: 2 },
  { pattern: /\bcoeficiente[s]?\b/gi, weight: 1.5 },
  { pattern: /\bpolin[oó]mio[s]?\b|\bmonom[ií]o[s]?\b|\bbinom[ií]o[s]?\b/gi, weight: 1.5 },
  { pattern: /\bvariable[s]?\b/gi, weight: 1 },
  { pattern: /\bexponente[s]?\b/gi, weight: 1 },
  { pattern: /\breconoce[r]?\b|\bidentifica[r]?\b/gi, weight: 1.5 },
  { pattern: /\bclasifica[r]?\b/gi, weight: 1.5 },
];

const MEMORIZATION_INDICATORS: Indicator[] = [
  { pattern: /\bdefinici[oó]n\b/gi, weight: 2 },
  { pattern: /\bvocabulario\b/gi, weight: 2 },
  { pattern: /\bfecha[s]?\b/gi, weight: 2 },
  { pattern: /\bcapital[es]?\b/gi, weight: 1.5 },
  { pattern: /\bsignifica[r]?\b/gi, weight: 1.5 },
  // "término" weight reduced: in math contexts means "algebraic term" (not vocabulary) — false positive for algebra
  { pattern: /\bt[eé]rmino[s]?\b/gi, weight: 0.3 },
  { pattern: /\blista\b|\btabla\b|\bclasificaci[oó]n\b/gi, weight: 1 },
  { pattern: /\bsignificado\b|\bsin[oó]nimo[s]?\b/gi, weight: 1.5 },
  { pattern: /\bhito[s]?\b|\bacontecimiento[s]?\b|\bcronolog[ií]a\b/gi, weight: 1.5 },
  { pattern: /\banat[oó]m[ií]a\b|\bbiograf[ií]a\b/gi, weight: 1.5 },
  { pattern: /\belemento[s]?\s+qu[ií]mico[s]?\b/gi, weight: 2 },
];

// ── Skill catalog ─────────────────────────────────────────────────────────────

interface SkillDefinition {
  skillId: string;
  skillLabel: string;
  defaultPriority: number;  // lower number = teach first
  patterns: { pattern: RegExp; weight: number }[];
}

/**
 * Each skill has detection patterns (used to find evidence in the transcription)
 * and a defaultPriority to sequence the learning path in a pedagogically sound order.
 */
const SKILL_CATALOG: SkillDefinition[] = [
  // ── Decimal skills (ordered from simpler to more complex) ──────────────────
  {
    skillId: 'SKILL_CLASSIFY_DECIMAL',
    skillLabel: 'Clasificar tipos de decimales',
    defaultPriority: 1,
    patterns: [
      { pattern: /identifica[a-z]*\s+[a-z\s]{0,15}(peri[oó]dico|tipo|clase|decimal)/gi, weight: 3 },
      { pattern: /reconoce?\s+[a-z\s]{0,15}(tipo|clase|decimal)/gi, weight: 3 },
      { pattern: /decimal[es]*\s+(peri[oó]dico|semiperi[oó]dico|exacto)/gi, weight: 2 },
      { pattern: /\b(peri[oó]dico|semiperi[oó]dico)\b/gi, weight: 1 },
      { pattern: /\bclasifica[a-z]*\s+(decimal|n[uú]mero)/gi, weight: 3 },
    ],
  },
  {
    skillId: 'SKILL_ORDER_DECIMALS',
    skillLabel: 'Ordenar decimales',
    defaultPriority: 2,
    patterns: [
      { pattern: /orden[ae][a-z]*\s+de\s+menor\s+a\s+mayor/gi, weight: 4 },
      { pattern: /orden[ae][a-z]*\s+de\s+mayor\s+a\s+menor/gi, weight: 4 },
      { pattern: /orden[ae][a-z]*\s+[a-z\s]{0,10}(decimal|n[uú]mero)/gi, weight: 3 },
      { pattern: /compara[a-z]*\s+[a-z\s]{0,10}decimal/gi, weight: 2 },
      { pattern: /menor\s+a\s+mayor|mayor\s+a\s+menor/gi, weight: 2 },
    ],
  },
  {
    skillId: 'SKILL_FRACTION_TO_DECIMAL',
    skillLabel: 'Convertir fracción a decimal',
    defaultPriority: 3,
    patterns: [
      { pattern: /transform[ae][a-z]*\s+a\s+decimal/gi, weight: 4 },
      { pattern: /conviert[ae][a-z]*\s+a\s+decimal/gi, weight: 4 },
      { pattern: /fracci[oó]n\s+a\s+decimal/gi, weight: 3 },
      { pattern: /expres[ae][a-z]*\s+[a-z\s]{0,10}decimal/gi, weight: 2 },
      { pattern: /\d+\/\d+\s*=\s*0[,.]/g, weight: 3 },
    ],
  },
  {
    skillId: 'SKILL_DECIMAL_TO_FRACTION',
    skillLabel: 'Convertir decimal a fracción',
    defaultPriority: 4,
    patterns: [
      { pattern: /transform[ae][a-z]*\s+a\s+fracci[oó]n/gi, weight: 4 },
      { pattern: /conviert[ae][a-z]*\s+a\s+fracci[oó]n/gi, weight: 4 },
      { pattern: /decimal\s+a\s+fracci[oó]n/gi, weight: 3 },
      { pattern: /expres[ae][a-z]*\s+[a-z\s]{0,10}como\s+fracci[oó]n/gi, weight: 3 },
    ],
  },
  {
    skillId: 'SKILL_OPERATIONS_DECIMALS',
    skillLabel: 'Operaciones con decimales',
    defaultPriority: 5,
    patterns: [
      { pattern: /\boperaci[oó]n[es]?\s+[a-z\s]{0,15}decimal/gi, weight: 4 },
      { pattern: /\bsuma[a-z]*\s+[a-z\s]{0,10}decimal/gi, weight: 3 },
      { pattern: /\bresta[a-z]*\s+[a-z\s]{0,10}decimal/gi, weight: 3 },
      { pattern: /\bmultiplic[ae][a-z]*\s+[a-z\s]{0,10}decimal/gi, weight: 3 },
      { pattern: /\bdivid[eaí][a-z]*\s+[a-z\s]{0,10}decimal/gi, weight: 3 },
      { pattern: /\b(resuelve|resolver|calcula|calcular)\b/gi, weight: 1 },
    ],
  },
  // ── Fraction skills ────────────────────────────────────────────────────────
  {
    skillId: 'SKILL_SIMPLIFY_FRACTIONS',
    skillLabel: 'Simplificar fracciones',
    defaultPriority: 3,
    patterns: [
      { pattern: /simplifica[a-z]*/gi, weight: 4 },
      { pattern: /fracci[oó]n[es]?\s+irreducible/gi, weight: 3 },
      { pattern: /m[aá]ximo\s+com[uú]n\s+divisor|\bmcd\b/gi, weight: 2 },
    ],
  },
  {
    skillId: 'SKILL_OPERATIONS_FRACTIONS',
    skillLabel: 'Operaciones con fracciones',
    defaultPriority: 4,
    patterns: [
      { pattern: /\boperaci[oó]n[es]?\s+con\s+fracci/gi, weight: 4 },
      { pattern: /\bsuma[a-z]*\s+de\s+fracci/gi, weight: 3 },
      { pattern: /\bresta[a-z]*\s+de\s+fracci/gi, weight: 3 },
      { pattern: /multiplic[ae][a-z]*\s+[a-z\s]{0,10}fracci/gi, weight: 3 },
      { pattern: /divid[eaí][a-z]*\s+[a-z\s]{0,10}fracci/gi, weight: 3 },
      { pattern: /m[ií]nimo\s+com[uú]n\s+m[uú]ltiplo|\bmcm\b/gi, weight: 2 },
    ],
  },
  // ── Algebra / calculus ─────────────────────────────────────────────────────
  {
    skillId: 'SKILL_FACTORIZATION',
    skillLabel: 'Factorización algebraica',
    defaultPriority: 3,
    patterns: [
      { pattern: /factoriza[a-z]*/gi, weight: 4 },
      { pattern: /descompon[ae][a-z]*\s+en\s+factores/gi, weight: 4 },
    ],
  },
  {
    skillId: 'SKILL_EQUATIONS',
    skillLabel: 'Resolución de ecuaciones',
    defaultPriority: 3,
    patterns: [
      { pattern: /ecuaci[oó]n[es]*/gi, weight: 3 },
      { pattern: /despeja[a-z]*/gi, weight: 3 },
      { pattern: /resuelve?\s+la\s+ecuaci[oó]n/gi, weight: 4 },
    ],
  },
  {
    skillId: 'SKILL_DERIVATIVES',
    skillLabel: 'Derivadas',
    defaultPriority: 3,
    patterns: [
      { pattern: /deriv[ae][a-z]*/gi, weight: 4 },
      { pattern: /\bderivada[s]?\b/gi, weight: 3 },
    ],
  },
  {
    skillId: 'SKILL_INTEGRALS',
    skillLabel: 'Integrales',
    defaultPriority: 4,
    patterns: [
      { pattern: /integr[ae][a-z]*/gi, weight: 4 },
      { pattern: /\bintegral[es]?\b/gi, weight: 3 },
    ],
  },
  // ── Chemistry ─────────────────────────────────────────────────────────────
  {
    skillId: 'SKILL_BALANCE_EQUATIONS',
    skillLabel: 'Balanceo de ecuaciones químicas',
    defaultPriority: 3,
    patterns: [
      { pattern: /balance[ao][a-z]*\s+ecuaci/gi, weight: 4 },
      { pattern: /balanc[ae][a-z]*/gi, weight: 3 },
    ],
  },
  {
    skillId: 'SKILL_STOICHIOMETRY',
    skillLabel: 'Estequiometría',
    defaultPriority: 4,
    patterns: [
      { pattern: /estequiometr[ií][a-z]*/gi, weight: 4 },
      { pattern: /calcula[a-z]*\s+masa\s+molar/gi, weight: 4 },
      { pattern: /mol[es]?\b/gi, weight: 1 },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreIndicators(text: string, indicators: Indicator[]): number {
  return indicators.reduce((acc, { pattern, weight }) => {
    const cloned = new RegExp(pattern.source, pattern.flags);
    const matches = text.match(cloned);
    return acc + (matches ? matches.length * weight : 0);
  }, 0);
}

function detectSkills(transcription: string): DetectedSkill[] {
  const text = transcription.toLowerCase();
  const results: DetectedSkill[] = [];

  for (const def of SKILL_CATALOG) {
    let totalHits = 0;
    let maxPossible = 0;

    for (const { pattern, weight } of def.patterns) {
      const cloned = new RegExp(pattern.source, pattern.flags);
      const matches = text.match(cloned);
      totalHits += matches ? matches.length * weight : 0;
      maxPossible += weight * 2; // assume ≥2 occurrences = "clearly present"
    }

    if (totalHits === 0) continue;

    const confidence = Math.min(1, totalHits / maxPossible);
    results.push({
      skillId: def.skillId,
      skillLabel: def.skillLabel,
      confidence,
      priority: def.defaultPriority,
    });
  }

  // Sort: higher confidence first; ties broken by defaultPriority (teach simpler first)
  return results.sort((a, b) => {
    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 0.05) return confDiff;
    return a.priority - b.priority;
  });
}

// ── KnowledgeGraph classification path ───────────────────────────────────────
//
// Called when classifyContent() receives a KnowledgeGraph instead of raw text.
// Derives CONCEPTUAL / PROCEDURAL / MEMORIZATION scores from structural features.
// Skill detection reuses the existing regex catalog on a synthesized text snippet
// built from concept names, procedure steps, examples, and definitions.

function classifyFromKnowledgeGraph(graph: KnowledgeGraph): ClassificationResult {
  const { concepts, procedures, examples, definitions, entities, relationships } = graph;

  // ── Procedural score: step-by-step procedures + numeric/symbolic examples ──
  const procedureStepCount = procedures.reduce((s, p) => s + (p.steps?.length ?? 0), 0);
  const numericExamples = examples.filter(e => e.type === 'numeric' || e.type === 'symbolic').length;
  const pRaw = procedures.length * 3 + procedureStepCount * 0.5 + numericExamples * 1;

  // ── Conceptual score: rich concept network + relationships + textual examples
  const textualExamples = examples.filter(e => !e.type || e.type === 'textual' || e.type === 'graphical').length;
  const cRaw = concepts.length * 2 + relationships.length * 1.5 + textualExamples * 1;

  // ── Memorization score: definitions + factual entities (dates, names, events)
  const factualEntities = entities.filter(e => e.type === 'date' || e.type === 'name' || e.type === 'event').length;
  const mRaw = definitions.length * 2 + factualEntities * 1.5;

  const total = cRaw + pRaw + mRaw;

  console.log(`[KnowledgeClassifier] scores — conceptual: ${cRaw.toFixed(1)} | procedural: ${pRaw.toFixed(1)} | memorization: ${mRaw.toFixed(1)}`);

  if (total === 0) {
    console.log('[KnowledgeClassifier] no signals → fallback CONCEPTUAL');
    return { type: 'CONCEPTUAL', confidence: 0.5, scores: { conceptual: 0, procedural: 0, memorization: 0 }, detectedSkills: [] };
  }

  const scores = {
    conceptual:   cRaw / total,
    procedural:   pRaw / total,
    memorization: mRaw / total,
  };

  let type: PedagogicalType;
  let confidence: number;

  if (scores.procedural >= DOMINANCE_THRESHOLD) {
    type = 'PROCEDURAL';   confidence = scores.procedural;
  } else if (scores.conceptual >= DOMINANCE_THRESHOLD) {
    type = 'CONCEPTUAL';   confidence = scores.conceptual;
  } else if (scores.memorization >= DOMINANCE_THRESHOLD) {
    type = 'MEMORIZATION'; confidence = scores.memorization;
  } else {
    type = 'MIXED';
    confidence = Math.max(scores.conceptual, scores.procedural, scores.memorization);
  }

  // Skill detection: synthesize text from structured graph and run existing regex catalog
  const syntheticText = [
    ...concepts.map(c => `${c.name} ${c.description ?? ''}`),
    ...procedures.map(p => `${p.name} ${p.steps.join(' ')}`),
    ...examples.map(e => e.content),
    ...definitions.map(d => `${d.term} ${d.definition}`),
  ].join(' ');
  const detectedSkills = detectSkills(syntheticText);

  console.log(`[KnowledgeClassifier] result: ${type} (${(confidence * 100).toFixed(0)}%) | skills: ${detectedSkills.length}`);

  return { type, confidence, scores, detectedSkills };
}

// ── Main classifier ───────────────────────────────────────────────────────────

const DOMINANCE_THRESHOLD = 0.60;

function auditIndicatorFiring(label: string, text: string, indicators: Indicator[]): void {
  const fired = indicators
    .map(({ pattern, weight }) => {
      const cloned = new RegExp(pattern.source, pattern.flags);
      const matches = text.match(cloned) ?? [];
      return matches.length > 0
        ? { src: pattern.source.slice(0, 50), count: matches.length, weight, total: matches.length * weight }
        : null;
    })
    .filter(Boolean) as { src: string; count: number; weight: number; total: number }[];

  if (fired.length === 0) {
    console.log(`[Audit]   ${label}: (ninguna señal)`);
    return;
  }
  const rawSum = fired.reduce((s, f) => s + f.total, 0);
  console.log(`[Audit]   ${label} (suma bruta: ${rawSum.toFixed(1)}):`);
  fired
    .sort((a, b) => b.total - a.total)
    .forEach(f => console.log(`[Audit]     /${f.src}/ × ${f.count} × ${f.weight} = ${f.total.toFixed(1)}`));
}

export function classifyContent(input: string | KnowledgeGraph): ClassificationResult {
  // ── KnowledgeGraph path (structured) ────────────────────────────────────────
  if (typeof input !== 'string') {
    return classifyFromKnowledgeGraph(input);
  }

  // ── Legacy text path (unchanged) ────────────────────────────────────────────
  const transcription = input;
  const text = transcription.toLowerCase();

  const cRaw = scoreIndicators(text, CONCEPTUAL_INDICATORS);
  const pRaw = scoreIndicators(text, PROCEDURAL_INDICATORS);
  const mRaw = scoreIndicators(text, MEMORIZATION_INDICATORS);
  const total = cRaw + pRaw + mRaw;

  // ── Audit: why this classification ────────────────────────────────────────
  console.log('\n[Audit] ════════════════════════════════════════════════════════');
  console.log('[Audit] CLASIFICACIÓN PEDAGÓGICA — señales que contribuyeron');
  console.log('[Audit] ════════════════════════════════════════════════════════');
  console.log(`[Audit] Scores brutos — conceptual: ${cRaw.toFixed(1)} | procedimental: ${pRaw.toFixed(1)} | memorización: ${mRaw.toFixed(1)} | total: ${total.toFixed(1)}`);
  if (total > 0) {
    const pctC = ((cRaw / total) * 100).toFixed(0);
    const pctP = ((pRaw / total) * 100).toFixed(0);
    const pctM = ((mRaw / total) * 100).toFixed(0);
    console.log(`[Audit] Porcentajes — conceptual: ${pctC}% | procedimental: ${pctP}% | memorización: ${pctM}%`);
  }
  auditIndicatorFiring('CONCEPTUAL', text, CONCEPTUAL_INDICATORS);
  auditIndicatorFiring('PROCEDURAL', text, PROCEDURAL_INDICATORS);
  auditIndicatorFiring('MEMORIZATION', text, MEMORIZATION_INDICATORS);
  // ──────────────────────────────────────────────────────────────────────────

  if (total === 0) {
    console.log('[Audit] Sin señales — fallback a CONCEPTUAL');
    return { type: 'CONCEPTUAL', confidence: 0.5, scores: { conceptual: 0, procedural: 0, memorization: 0 }, detectedSkills: [] };
  }

  const scores = { conceptual: cRaw / total, procedural: pRaw / total, memorization: mRaw / total };

  let type: PedagogicalType;
  let confidence: number;

  if (scores.procedural >= DOMINANCE_THRESHOLD) {
    type = 'PROCEDURAL'; confidence = scores.procedural;
  } else if (scores.conceptual >= DOMINANCE_THRESHOLD) {
    type = 'CONCEPTUAL'; confidence = scores.conceptual;
  } else if (scores.memorization >= DOMINANCE_THRESHOLD) {
    type = 'MEMORIZATION'; confidence = scores.memorization;
  } else {
    type = 'MIXED';
    confidence = Math.max(scores.conceptual, scores.procedural, scores.memorization);
  }

  console.log(`[Audit] Resultado: ${type} (${(confidence * 100).toFixed(0)}%)\n`);

  const detectedSkills = detectSkills(transcription);
  return { type, confidence, scores, detectedSkills };
}
