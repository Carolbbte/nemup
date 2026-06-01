/**
 * Pedagogical classifier — determines the type of learning required by a document
 * before generating a session. Routes to the appropriate prompt structure.
 */

export type PedagogicalType = 'CONCEPTUAL' | 'PROCEDURAL' | 'MEMORIZATION' | 'MIXED';

export interface ClassificationResult {
  type: PedagogicalType;
  confidence: number;
  scores: { conceptual: number; procedural: number; memorization: number };
  detectedSkills: string[];
}

interface Indicator {
  pattern: RegExp;
  weight: number;
}

// ── Indicator sets ────────────────────────────────────────────────────────────

const PROCEDURAL_INDICATORS: Indicator[] = [
  { pattern: /\b(resuelve|resolver|resuelva|resolviendo)\b/gi, weight: 2 },
  { pattern: /\b(calcula|calcular|calcule|calculando)\b/gi, weight: 2 },
  { pattern: /\b(convierte?|convertir|convierta)\b/gi, weight: 2 },
  { pattern: /\b(transforma|transformar|transforme)\b/gi, weight: 2 },
  { pattern: /\b(simplifica|simplificar|simplifique)\b/gi, weight: 2 },
  { pattern: /\b(deriva|derivar|derive)\b/gi, weight: 2 },
  { pattern: /\b(factoriza|factorizar|factorice)\b/gi, weight: 2 },
  { pattern: /\b(ordena|ordenar|ordene)\b/gi, weight: 2 },
  { pattern: /\b(halla|hallar|halle)\b/gi, weight: 1.5 },
  { pattern: /\b(determina|determinar|determine)\b/gi, weight: 1.5 },
  { pattern: /\b(aplica la f[oó]rmula|aplique la f[oó]rmula)\b/gi, weight: 2 },
  { pattern: /\b(paso a paso|por pasos)\b/gi, weight: 1.5 },
  { pattern: /\b(procedimiento|algoritmo)\b/gi, weight: 1.5 },
  { pattern: /\b(ejercicio[s]?)\b/gi, weight: 1 },
  { pattern: /\b(pr[aá]ctica|practica)\b/gi, weight: 1 },
  { pattern: /\boperaci[oó]n[es]?\b/gi, weight: 1 },
  { pattern: /\d+\/\d+/g, weight: 1 },          // fractions like 4/15
  { pattern: /\d+[,.]\d{2,}/g, weight: 0.5 },   // multi-decimal numbers
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
  { pattern: /\bfrecuencia\b/gi, weight: 1 },
  { pattern: /\bamplitud\b/gi, weight: 1 },
  { pattern: /\bonda[s]?\b/gi, weight: 1 },
  { pattern: /\bc[eé]lula[s]?\b/gi, weight: 1 },
  { pattern: /\bfotosíntesis\b/gi, weight: 1.5 },
  { pattern: /\bevolución\b/gi, weight: 1 },
  { pattern: /\bfunci[oó]n\b/gi, weight: 0.5 },
];

const MEMORIZATION_INDICATORS: Indicator[] = [
  { pattern: /\bdefinici[oó]n\b/gi, weight: 2 },
  { pattern: /\bvocabulario\b/gi, weight: 2 },
  { pattern: /\bfecha[s]?\b/gi, weight: 2 },
  { pattern: /\bcapital[es]?\b/gi, weight: 1.5 },
  { pattern: /\bsignifica[r]?\b/gi, weight: 1.5 },
  { pattern: /\bt[eé]rmino[s]?\b/gi, weight: 1.5 },
  { pattern: /\blista\b/gi, weight: 1 },
  { pattern: /\bclasificaci[oó]n\b/gi, weight: 1 },
  { pattern: /\btabla\b/gi, weight: 1 },
  { pattern: /\bsignificado\b/gi, weight: 1.5 },
  { pattern: /\bsin[oó]nimo[s]?\b/gi, weight: 1 },
  { pattern: /\bhito[s]?\b/gi, weight: 1.5 },
  { pattern: /\bacontecimiento[s]?\b/gi, weight: 1.5 },
  { pattern: /\bcronolog[ií]a\b/gi, weight: 1.5 },
  { pattern: /\bbiograf[ií]a\b/gi, weight: 1.5 },
  { pattern: /\bcaracter[ií]stica[s]?\b/gi, weight: 0.5 },
  { pattern: /\banat[oó]m[ií]a\b/gi, weight: 1.5 },
  { pattern: /\belemento[s]? qu[ií]mico[s]?\b/gi, weight: 2 },
];

// ── Skill detection ───────────────────────────────────────────────────────────

const SKILL_PATTERNS: { pattern: RegExp; skill: string }[] = [
  { pattern: /orden[ae][a-z]*\s+de\s+menor\s+a\s+mayor/gi, skill: 'ordenar de menor a mayor' },
  { pattern: /orden[ae][a-z]*\s+de\s+mayor\s+a\s+menor/gi, skill: 'ordenar de mayor a menor' },
  { pattern: /transform[ae][a-z]*\s+a\s+decimal|conviert[ae][a-z]*\s+a\s+decimal|fracci[oó]n\s+a\s+decimal/gi, skill: 'conversión fracción→decimal' },
  { pattern: /transform[ae][a-z]*\s+a\s+fracci[oó]n|conviert[ae][a-z]*\s+a\s+fracci[oó]n|decimal\s+a\s+fracci[oó]n/gi, skill: 'conversión decimal→fracción' },
  { pattern: /identifica[a-z]*\s+[a-z\s]{0,15}peri[oó]dico/gi, skill: 'identificar decimal periódico' },
  { pattern: /identifica[a-z]*\s+[a-z\s]{0,15}semiperi[oó]dico/gi, skill: 'identificar decimal semiperiódico' },
  { pattern: /decimal[es]*\s+peri[oó]dico/gi, skill: 'decimales periódicos' },
  { pattern: /decimal[es]*\s+semiperi[oó]dico/gi, skill: 'decimales semiperiódicos' },
  { pattern: /simplifica[a-z]*/gi, skill: 'simplificación de fracciones' },
  { pattern: /factoriza[a-z]*/gi, skill: 'factorización' },
  { pattern: /deriv[ae][a-z]*/gi, skill: 'derivación' },
  { pattern: /integr[ae][a-z]*/gi, skill: 'integración' },
  { pattern: /ecuaci[oó]n[es]*/gi, skill: 'ecuaciones' },
  { pattern: /\boperaci[oó]n[es]?\s+con\s+fracci/gi, skill: 'operaciones con fracciones' },
  { pattern: /\bsuma[a-z]*\s+de\s+fracci/gi, skill: 'suma de fracciones' },
  { pattern: /\bresta[a-z]*\s+de\s+fracci/gi, skill: 'resta de fracciones' },
  { pattern: /multiplic[ae][a-z]*\s+[a-z\s]{0,10}fracci/gi, skill: 'multiplicación de fracciones' },
  { pattern: /divid[eaí][a-z]*\s+[a-z\s]{0,10}fracci/gi, skill: 'división de fracciones' },
  { pattern: /m[ií]nimo\s+com[uú]n\s+m[uú]ltiplo|\bmcm\b/gi, skill: 'mínimo común múltiplo' },
  { pattern: /m[aá]ximo\s+com[uú]n\s+divisor|\bmcd\b/gi, skill: 'máximo común divisor' },
  { pattern: /\bporcentaje[s]*/gi, skill: 'porcentajes' },
  { pattern: /\bpotencia[s]?\b/gi, skill: 'potencias' },
  { pattern: /\bra[ií]z\s+cuadrada\b/gi, skill: 'raíz cuadrada' },
  { pattern: /\bderiva[a-z]*\s+(parcial|total)\b/gi, skill: 'derivadas' },
  { pattern: /\bbalance[ao][a-z]*\s+ecuaci/gi, skill: 'balanceo de ecuaciones' },
  { pattern: /\bcalcula[a-z]*\s+masa/gi, skill: 'cálculo de masa molar' },
];

function scoreIndicators(text: string, indicators: Indicator[]): number {
  return indicators.reduce((acc, { pattern, weight }) => {
    // Reset lastIndex since we share patterns across calls with /g flag
    const cloned = new RegExp(pattern.source, pattern.flags);
    const matches = text.match(cloned);
    return acc + (matches ? matches.length * weight : 0);
  }, 0);
}

function detectSkills(transcription: string): string[] {
  const found = new Set<string>();
  for (const { pattern, skill } of SKILL_PATTERNS) {
    const cloned = new RegExp(pattern.source, pattern.flags);
    if (cloned.test(transcription)) found.add(skill);
  }
  return [...found];
}

// ── Main classifier ───────────────────────────────────────────────────────────

const DOMINANCE_THRESHOLD = 0.60;

export function classifyContent(transcription: string): ClassificationResult {
  const text = transcription.toLowerCase();

  const cRaw = scoreIndicators(text, CONCEPTUAL_INDICATORS);
  const pRaw = scoreIndicators(text, PROCEDURAL_INDICATORS);
  const mRaw = scoreIndicators(text, MEMORIZATION_INDICATORS);

  const total = cRaw + pRaw + mRaw;

  if (total === 0) {
    return { type: 'CONCEPTUAL', confidence: 0.5, scores: { conceptual: 0, procedural: 0, memorization: 0 }, detectedSkills: [] };
  }

  const scores = {
    conceptual: cRaw / total,
    procedural: pRaw / total,
    memorization: mRaw / total,
  };

  let type: PedagogicalType;
  let confidence: number;

  if (scores.procedural >= DOMINANCE_THRESHOLD) {
    type = 'PROCEDURAL';
    confidence = scores.procedural;
  } else if (scores.conceptual >= DOMINANCE_THRESHOLD) {
    type = 'CONCEPTUAL';
    confidence = scores.conceptual;
  } else if (scores.memorization >= DOMINANCE_THRESHOLD) {
    type = 'MEMORIZATION';
    confidence = scores.memorization;
  } else {
    // No dominant type — pick the highest for MIXED label
    const top = (Object.entries(scores) as [keyof typeof scores, number][])
      .sort((a, b) => b[1] - a[1])[0];
    type = 'MIXED';
    confidence = top[1];
  }

  const detectedSkills = detectSkills(transcription);

  return { type, confidence, scores, detectedSkills };
}
