/**
 * Desafío generation service — Phase 2 (adaptive, multi-interaction-type).
 *
 * Generates a Duolingo-style adaptive challenge session from a document transcription.
 * Interaction types: multiple_choice, match_pairs, fill_blank, classify, order_steps
 * Adaptive features: spaced repetition, pre-generated retry slides, boss challenge
 */

import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { classifyContent } from './pedagogicalClassifier.js';
import { config } from '../config.js';

// ── Local type definitions (mirrors shared/desafio.ts — no cross-root import) ─

type DesafioInteractionType =
  | 'multiple_choice'
  | 'match_pairs'
  | 'fill_blank'
  | 'classify'
  | 'order_steps';

type DesafioSlideType =
  | 'discovery_challenge'
  | 'instant_feedback'
  | 'insight'
  | 'reinforcement_challenge'
  | 'spaced_repetition'
  | 'boss_loop'
  | 'mastery_screen';

interface DesafioChoice { letter: 'A' | 'B' | 'C'; text: string; }
interface DesafioPair   { id: string; left: string; right: string; }
interface DesafioClassifyItem { id: string; text: string; category: string; }

interface DesafioSlide {
  type: DesafioSlideType;
  interactionType?: DesafioInteractionType;
  conceptIndex: number;
  conceptName: string;
  isSpacedRepetition?: boolean;
  isRetry?: boolean;
  emoji?: string;
  question?: string;
  choices?: DesafioChoice[];
  correctAnswer?: 'A' | 'B' | 'C';
  explanation?: string;
  wrongHints?: Record<string, string>;
  pairsPrompt?: string;
  pairs?: DesafioPair[];
  pairsExplanation?: string;
  blankSentence?: string;
  blankChoices?: DesafioChoice[];
  blankAnswer?: 'A' | 'B' | 'C';
  blankExplanation?: string;
  classifyPrompt?: string;
  classifyItems?: DesafioClassifyItem[];
  classifyCategories?: string[];
  classifyExplanation?: string;
  orderPrompt?: string;
  steps?: string[];
  correctOrder?: number[];
  orderExplanation?: string;
  title?: string;
  body?: string;
  conceptsCovered?: string[];
}

interface DesafioSession {
  id: string;
  topic: string;
  conceptCount: number;
  slides: DesafioSlide[];
  retrySlides?: Record<string, DesafioSlide[]>;
}

const openai = new OpenAI({ apiKey: config.openai_api_key });

function normalizeText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── JSON schema template ──────────────────────────────────────────────────────

const DESAFIO_SCHEMA = `
DEVUELVE EXACTAMENTE este JSON (sin texto adicional, sin markdown):
{
  "topic": "Nombre del tema principal",
  "slides": [

    // ── BLOQUE POR CONCEPTO (repetir para cada concepto Tipo A) ──

    // [1] discovery_challenge — siempre multiple_choice
    {
      "type": "discovery_challenge",
      "interactionType": "multiple_choice",
      "conceptIndex": 0,
      "conceptName": "Nombre del concepto",
      "emoji": "📐",
      "question": "Pregunta de descubrimiento con ejemplo concreto del documento (max 20 palabras)?",
      "choices": [
        {"letter": "A", "text": "Opción A (max 10 palabras)"},
        {"letter": "B", "text": "Opción B"},
        {"letter": "C", "text": "Opción C"}
      ],
      "correctAnswer": "A",
      "explanation": "Por qué A es correcto (max 100 chars, sin 'Correcto' ni emojis).",
      "wrongHints": {
        "B": "Elegiste B porque [razón]. La pregunta buscaba [criterio exacto].",
        "C": "Elegiste C porque [razón]. La pregunta buscaba [criterio exacto]."
      }
    },

    // [2] interactive_challenge — tipo varía por concepto (ver reglas)
    // EJEMPLO match_pairs (concepto 0):
    {
      "type": "reinforcement_challenge",
      "interactionType": "match_pairs",
      "conceptIndex": 0,
      "conceptName": "Nombre del concepto",
      "pairsPrompt": "Une cada elemento con su descripción (max 12 palabras)",
      "pairs": [
        {"id": "p1", "left": "Texto izquierda 1 (max 8 palabras)", "right": "Texto derecha 1 (max 8 palabras)"},
        {"id": "p2", "left": "Texto izquierda 2", "right": "Texto derecha 2"},
        {"id": "p3", "left": "Texto izquierda 3", "right": "Texto derecha 3"}
      ],
      "pairsExplanation": "Explicación del patrón (max 80 chars)"
    },

    // EJEMPLO fill_blank (concepto 1):
    // {
    //   "type": "reinforcement_challenge",
    //   "interactionType": "fill_blank",
    //   "conceptIndex": 1, "conceptName": "...",
    //   "blankSentence": "Expresión con ___ para completar (max 12 palabras)",
    //   "blankChoices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
    //   "blankAnswer": "A",
    //   "blankExplanation": "Por qué A completa correctamente (max 80 chars)"
    // },

    // EJEMPLO classify (concepto 2):
    // {
    //   "type": "reinforcement_challenge",
    //   "interactionType": "classify",
    //   "conceptIndex": 2, "conceptName": "...",
    //   "classifyPrompt": "Clasifica cada expresión (max 12 palabras)",
    //   "classifyCategories": ["Cat1", "Cat2", "Cat3"],
    //   "classifyItems": [
    //     {"id": "c1", "text": "Expresión 1", "category": "Cat1"},
    //     {"id": "c2", "text": "Expresión 2", "category": "Cat2"},
    //     {"id": "c3", "text": "Expresión 3", "category": "Cat3"}
    //   ],
    //   "classifyExplanation": "Explicación (max 80 chars)"
    // },

    // EJEMPLO order_steps (concepto 3):
    // {
    //   "type": "reinforcement_challenge",
    //   "interactionType": "order_steps",
    //   "conceptIndex": 3, "conceptName": "...",
    //   "orderPrompt": "Ordena los pasos para resolver (max 10 palabras)",
    //   "steps": ["Paso C mezclado", "Paso A mezclado", "Paso B mezclado"],
    //   "correctOrder": [1, 2, 0],
    //   "orderExplanation": "Por qué este orden (max 80 chars)"
    // },

    // [3] instant_feedback — NO interactivo
    {
      "type": "instant_feedback",
      "conceptIndex": 0,
      "conceptName": "Nombre del concepto",
      "title": "¿Por qué? (max 5 palabras)",
      "body": "Conecta discovery con insight, max 35 palabras."
    },

    // [4] insight — NO interactivo
    {
      "type": "insight",
      "conceptIndex": 0,
      "conceptName": "Nombre del concepto",
      "emoji": "💡",
      "title": "Nombre del Concepto",
      "body": "Definición concisa. Analogía cotidiana. Max 35 palabras."
    },

    // [5] reinforcement_challenge — multiple_choice O mismo tipo que [2]
    {
      "type": "reinforcement_challenge",
      "interactionType": "multiple_choice",
      "conceptIndex": 0,
      "conceptName": "Nombre del concepto",
      "question": "Nueva situación, mismo concepto, contexto diferente (max 20 palabras)?",
      "choices": [
        {"letter": "A", "text": "..."},
        {"letter": "B", "text": "..."},
        {"letter": "C", "text": "..."}
      ],
      "correctAnswer": "B",
      "explanation": "...",
      "wrongHints": {"A": "...", "C": "..."}
    },

    // ── SPACED REPETITION (después de bloque concepto N, si N ≥ 1) ──
    {
      "type": "spaced_repetition",
      "interactionType": "multiple_choice",
      "conceptIndex": 0,
      "conceptName": "Nombre del concepto revisado",
      "isSpacedRepetition": true,
      "question": "Pregunta DIFERENTE a discovery/reinforcement de ese concepto.",
      "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
      "correctAnswer": "C",
      "explanation": "..."
    },

    // ── BOSS CHALLENGE (al final de todos los conceptos) ──
    // Boss 1: tipo no-MC
    {
      "type": "boss_loop",
      "interactionType": "classify",
      "conceptIndex": -1,
      "conceptName": "Boss Battle",
      "classifyPrompt": "Desafío integrador: clasifica usando todo lo aprendido",
      "classifyCategories": ["Cat1", "Cat2"],
      "classifyItems": [
        {"id": "c1", "text": "...", "category": "Cat1"},
        {"id": "c2", "text": "...", "category": "Cat2"},
        {"id": "c3", "text": "...", "category": "Cat1"}
      ],
      "classifyExplanation": "..."
    },
    // Boss 2: multiple_choice integrador
    {
      "type": "boss_loop",
      "interactionType": "multiple_choice",
      "conceptIndex": -1,
      "conceptName": "Boss Battle",
      "emoji": "🏆",
      "question": "Pregunta que solo puede responder quien dominó TODOS los conceptos (max 30 palabras)?",
      "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
      "correctAnswer": "A",
      "explanation": "...",
      "wrongHints": {"B": "...", "C": "..."}
    },

    // ── MASTERY SCREEN ──
    {
      "type": "mastery_screen",
      "conceptIndex": -1,
      "conceptName": "Completado",
      "title": "¡Desafío superado!",
      "body": "Celebración de lo aprendido, max 25 palabras.",
      "conceptsCovered": ["Concepto 0", "Concepto 1"]
    }
  ],

  "retrySlides": {
    "0": [{
      "type": "reinforcement_challenge",
      "interactionType": "fill_blank",
      "isRetry": true,
      "conceptIndex": 0,
      "conceptName": "Nombre del concepto",
      "blankSentence": "Expresión con ___ diferente al reinforcement original",
      "blankChoices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
      "blankAnswer": "B",
      "blankExplanation": "..."
    }],
    "1": [{
      "type": "reinforcement_challenge",
      "interactionType": "multiple_choice",
      "isRetry": true,
      "conceptIndex": 1,
      "conceptName": "Nombre del concepto",
      "question": "Nuevo ángulo del mismo concepto, diferente al original.",
      "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
      "correctAnswer": "C",
      "explanation": "...",
      "wrongHints": {"A": "...", "B": "..."}
    }]
  }
}`;

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildDesafioPrompt(transcription: string, curso: string): string {
  return `Eres un diseñador de sesiones de aprendizaje estilo Duolingo para estudiantes chilenos de enseñanza media (${curso}).

⚠️ REGLA CRÍTICA: TODO contenido DEBE derivarse EXCLUSIVAMENTE de la transcripción.
No introduzcas conceptos, términos ni ejemplos ajenos. DEVUELVE SOLO JSON VÁLIDO. En español.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 1 — EXTRACCIÓN MENTAL DE CONCEPTOS TIPO A
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LÍMITE DE CONCEPTOS:
  • Documento corto (< 400 palabras): máx. 3 conceptos Tipo A
  • Documento largo (≥ 400 palabras): máx. 4 conceptos Tipo A

REGLA DE CONSERVACIÓN DE OBJETIVOS (prioridad absoluta):
Si el documento contiene objetivos de aprendizaje explícitos (enumerados con números o letras,
declarados con verbos de acción como "reconocer", "identificar", "clasificar", "reducir",
"simplificar", "aplicar", "resolver", "agrupar", "operar"):
  → CADA objetivo explícito es Tipo A por defecto. No requiere verificación adicional.
  → NUNCA eliminar un objetivo explícito para hacer espacio a un concepto inferido.
  → Si los objetivos explícitos ya ocupan el límite: los conceptos inferidos quedan fuera.

Un concepto inferido es Tipo A SOLO si:
  → Su ausencia impide alcanzar el objetivo de aprendizaje del documento
  → Tiene significado propio y puede evaluarse de forma independiente
  → Requiere comprensión profunda, no solo memorización

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 2 — DISEÑO DEL DESAFÍO: 5 SLIDES POR CONCEPTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para CADA concepto Tipo A, genera EXACTAMENTE en este orden:

[1] discovery_challenge — interactionType: "multiple_choice" SIEMPRE
    Pregunta de descubrimiento. El estudiante DESCUBRE el concepto antes del insight.
    - question: max 20 palabras, con ejemplo concreto del documento
    - choices: EXACTAMENTE 3 (A, B, C). Una correcta. Dos distractores plausibles.
    - correctAnswer: "A"|"B"|"C" — VARIAR posición entre conceptos, no siempre A
    - explanation: por qué es correcto (max 100 chars, sin "Correcto" ni emojis)
    - wrongHints: {"B": "Elegiste B porque [razón]. La pregunta buscaba [criterio].", "C": "..."}
    - emoji: emoji del concepto

[2] interactive_challenge — interactionType ROTA entre conceptos:
    C0 → "match_pairs", C1 → "fill_blank", C2 → "classify", C3 → "order_steps"
    (Con 2 conceptos: C0 → "match_pairs", C1 → "fill_blank")
    (Con 3 conceptos: C0 → "match_pairs", C1 → "fill_blank", C2 → "classify")

    REGLAS POR TIPO:
    • match_pairs: pairsPrompt (max 12 palabras), pairs con 3-4 objetos {id:"p1",left,right}
      ids DEBEN ser "p1","p2","p3","p4" — left y right max 8 palabras cada uno
    • fill_blank: blankSentence con "___" (max 12 palabras), blankChoices (3 opciones), blankAnswer, blankExplanation
    • classify: classifyPrompt, classifyCategories (2-3 strings), classifyItems con 3-4 objetos
      {id:"c1",text,category} — ids "c1","c2","c3","c4", category DEBE existir en classifyCategories
    • order_steps: orderPrompt, steps (3-4 pasos en ORDEN MEZCLADO), correctOrder (array de índices)
      EJEMPLO correctOrder: si steps=["C","A","B"] y orden correcto es A→B→C, entonces correctOrder=[1,2,0]
      (steps[1]="A" va primero, steps[2]="B" segundo, steps[0]="C" tercero)

[3] instant_feedback — SIN interactionType
    No interactivo. Conecta la pregunta anterior con el insight que viene.
    - title: max 5 palabras
    - body: 1-2 oraciones, max 35 palabras

[4] insight — SIN interactionType
    No interactivo. Define el concepto de forma clara y memorable.
    - emoji, title (max 5 palabras), body (definición + analogía, max 35 palabras)

[5] reinforcement_challenge — interactionType según concepto:
    C0/C2 → "multiple_choice". C1/C3 → mismo tipo que [2] de ese concepto.
    DIFERENTE contexto al discovery_challenge del mismo concepto.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 3 — SPACED REPETITION (insertar ENTRE bloques de conceptos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Después de los 5 slides de cada concepto (empezando por el segundo concepto):
Insertar 1 slide type "spaced_repetition" que repasa el CONCEPTO ANTERIOR:
  - interactionType: "multiple_choice" O "fill_blank"
  - isSpacedRepetition: true
  - conceptIndex: índice del concepto que se repasa
  - Pregunta DIFERENTE a las ya generadas para ese concepto

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 4 — BOSS CHALLENGE (al finalizar todos los conceptos y spaced repetitions)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generar 2 slides boss_loop:
  - PRIMER boss: interactionType ≠ "multiple_choice" (usar "classify" o "match_pairs")
    conceptIndex: -1, conceptName: "Boss Battle"
    Debe integrar ≥ 2 de los conceptos aprendidos
  - SEGUNDO boss: interactionType "multiple_choice"
    conceptIndex: -1, conceptName: "Boss Battle", emoji: "🏆"
    Pregunta que solo puede responder quien dominó TODOS los conceptos (max 30 palabras)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 5 — MASTERY SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Slide final no interactiva. type: "mastery_screen"
  - conceptIndex: -1, title (max 6 palabras), body (max 25 palabras)
  - conceptsCovered: nombres exactos de todos los conceptos (igual que en conceptName de insights)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 6 — RETRY SLIDES (campo "retrySlides" en JSON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para CADA concepto Tipo A, generar 1 retry slide en retrySlides[String(conceptIndex)]:
  - type: "reinforcement_challenge", isRetry: true
  - interactionType: DIFERENTE al usado en [2] para ese concepto
    (Si [2] fue "match_pairs" → usar "fill_blank" o "multiple_choice")
  - Mismo concepto, NUEVO ángulo, diferente a discovery y reinforcement ya generados

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS TRANSVERSALES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Distractores plausibles — no eliminables por descarte directo
• Sin "Todas/Ninguna de las anteriores"
• La opción correcta NO es siempre la más larga
• wrongHints OBLIGATORIOS para todas las opciones incorrectas en multiple_choice
• Para ${curso}: vocabulario y contextos apropiados al nivel

Transcripción:
${normalizeText(transcription)}

${DESAFIO_SCHEMA}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_SLIDE_TYPES: DesafioSlideType[] = [
  'discovery_challenge', 'instant_feedback', 'insight',
  'reinforcement_challenge', 'spaced_repetition', 'boss_loop', 'mastery_screen',
];

const VALID_INTERACTION_TYPES: DesafioInteractionType[] = [
  'multiple_choice', 'match_pairs', 'fill_blank', 'classify', 'order_steps',
];

function validateSlide(slide: unknown): DesafioSlide | null {
  const s = slide as Record<string, unknown>;
  if (!s || typeof s !== 'object') return null;
  if (!VALID_SLIDE_TYPES.includes(s.type as DesafioSlideType)) return null;

  const type = s.type as DesafioSlideType;
  const itype = VALID_INTERACTION_TYPES.includes(s.interactionType as DesafioInteractionType)
    ? (s.interactionType as DesafioInteractionType)
    : undefined;

  // Interactive slides need at least some content
  const isInteractive = type !== 'instant_feedback' && type !== 'insight' && type !== 'mastery_screen';
  if (isInteractive && itype) {
    switch (itype) {
      case 'multiple_choice':
        if (!s.question || !Array.isArray(s.choices) || s.choices.length < 3 || !s.correctAnswer) return null;
        break;
      case 'match_pairs':
        if (!Array.isArray(s.pairs) || s.pairs.length < 2) return null;
        break;
      case 'fill_blank':
        if (!s.blankSentence || !Array.isArray(s.blankChoices) || s.blankChoices.length < 3 || !s.blankAnswer) return null;
        break;
      case 'classify':
        if (!Array.isArray(s.classifyItems) || s.classifyItems.length < 2 || !Array.isArray(s.classifyCategories)) return null;
        break;
      case 'order_steps':
        if (!Array.isArray(s.steps) || s.steps.length < 2 || !Array.isArray(s.correctOrder)) return null;
        break;
    }
  } else if (isInteractive && !itype) {
    // Legacy: old-style slides without interactionType — require question+choices
    if (!s.question || !Array.isArray(s.choices)) return null;
  }

  return {
    type,
    interactionType: itype,
    conceptIndex: typeof s.conceptIndex === 'number' ? s.conceptIndex : -1,
    conceptName:  typeof s.conceptName  === 'string' ? s.conceptName  : '',
    isSpacedRepetition: s.isSpacedRepetition === true,
    isRetry:       s.isRetry === true,
    emoji:         typeof s.emoji === 'string' ? s.emoji : undefined,
    question:      typeof s.question === 'string' ? s.question : undefined,
    choices:       Array.isArray(s.choices) ? s.choices as DesafioChoice[] : undefined,
    correctAnswer: (s.correctAnswer === 'A' || s.correctAnswer === 'B' || s.correctAnswer === 'C') ? s.correctAnswer : undefined,
    explanation:   typeof s.explanation === 'string' ? s.explanation : undefined,
    wrongHints:    s.wrongHints && typeof s.wrongHints === 'object' ? s.wrongHints as Record<string, string> : undefined,
    pairsPrompt:   typeof s.pairsPrompt === 'string' ? s.pairsPrompt : undefined,
    pairs:         Array.isArray(s.pairs) ? s.pairs as DesafioPair[] : undefined,
    pairsExplanation: typeof s.pairsExplanation === 'string' ? s.pairsExplanation : undefined,
    blankSentence: typeof s.blankSentence === 'string' ? s.blankSentence : undefined,
    blankChoices:  Array.isArray(s.blankChoices) ? s.blankChoices as DesafioChoice[] : undefined,
    blankAnswer:   (s.blankAnswer === 'A' || s.blankAnswer === 'B' || s.blankAnswer === 'C') ? s.blankAnswer : undefined,
    blankExplanation: typeof s.blankExplanation === 'string' ? s.blankExplanation : undefined,
    classifyPrompt:    typeof s.classifyPrompt === 'string' ? s.classifyPrompt : undefined,
    classifyItems:     Array.isArray(s.classifyItems) ? s.classifyItems as DesafioClassifyItem[] : undefined,
    classifyCategories: Array.isArray(s.classifyCategories) ? s.classifyCategories as string[] : undefined,
    classifyExplanation: typeof s.classifyExplanation === 'string' ? s.classifyExplanation : undefined,
    orderPrompt:   typeof s.orderPrompt === 'string' ? s.orderPrompt : undefined,
    steps:         Array.isArray(s.steps) ? s.steps as string[] : undefined,
    correctOrder:  Array.isArray(s.correctOrder) ? s.correctOrder as number[] : undefined,
    orderExplanation: typeof s.orderExplanation === 'string' ? s.orderExplanation : undefined,
    title:         typeof s.title === 'string' ? s.title : undefined,
    body:          typeof s.body  === 'string' ? s.body  : undefined,
    conceptsCovered: Array.isArray(s.conceptsCovered) ? s.conceptsCovered as string[] : undefined,
  };
}

function stripJsonComments(str: string): string {
  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) { result += ch; escape = false; continue; }
    if (ch === '\\' && inString) { result += ch; escape = true; continue; }
    if (ch === '"') { inString = !inString; result += ch; continue; }
    if (!inString && ch === '/' && str[i + 1] === '/') {
      while (i < str.length && str[i] !== '\n') i++;
      result += '\n';
      continue;
    }
    result += ch;
  }
  return result;
}

function parseDesafioJson(raw: string): { topic: string; slides: DesafioSlide[]; retrySlides: Record<string, DesafioSlide[]> } {
  const stripped = stripJsonComments(raw);
  const cleaned = stripped
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/,    '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const startBrace = cleaned.indexOf('{');
    const endBrace   = cleaned.lastIndexOf('}');
    if (startBrace >= 0 && endBrace > startBrace) {
      try {
        parsed = JSON.parse(cleaned.slice(startBrace, endBrace + 1));
      } catch {
        throw new Error('No valid JSON found in response');
      }
    } else {
      throw new Error('No valid JSON found in response');
    }
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.slides)) throw new Error('Missing slides array');
  if (typeof obj.topic !== 'string') throw new Error('Missing topic string');

  const slides = (obj.slides as unknown[])
    .map(s => validateSlide(s))
    .filter((s): s is DesafioSlide => s !== null);

  if (slides.length === 0) throw new Error('No valid slides parsed');
  if (slides[slides.length - 1].type !== 'mastery_screen') {
    // Append a minimal mastery screen if missing
    slides.push({
      type: 'mastery_screen',
      conceptIndex: -1,
      conceptName: 'Completado',
      title: '¡Desafío superado!',
      body: 'Completaste todos los conceptos del Desafío.',
      conceptsCovered: [],
    });
  }

  // Parse retrySlides
  const retrySlides: Record<string, DesafioSlide[]> = {};
  if (obj.retrySlides && typeof obj.retrySlides === 'object' && !Array.isArray(obj.retrySlides)) {
    for (const [key, rawSlideArr] of Object.entries(obj.retrySlides as Record<string, unknown>)) {
      if (!Array.isArray(rawSlideArr)) continue;
      const parsed = rawSlideArr
        .map(s => validateSlide(s))
        .filter((s): s is DesafioSlide => s !== null);
      if (parsed.length > 0) retrySlides[key] = parsed;
    }
  }

  return { topic: obj.topic as string, slides, retrySlides };
}

// ── Simple fallback prompt (multiple_choice only, 3 slides per concept) ──────

function buildSimpleDesafioPrompt(transcription: string, curso: string): string {
  return `Eres un diseñador de sesiones de aprendizaje para estudiantes chilenos de ${curso}.
REGLA CRÍTICA: Devuelve SOLO JSON VÁLIDO, sin comentarios, sin texto adicional. En español.

Del documento identifica los conceptos clave (máx. 3). Si el documento tiene objetivos de aprendizaje explícitos (numerados con verbos como "reconocer", "clasificar", "reducir", "resolver"), CADA objetivo explícito es un concepto obligatorio — no los omitas. Para cada concepto genera en orden:
1. discovery_challenge (multiple_choice): pregunta de descubrimiento
2. insight: definición clara con analogía
3. reinforcement_challenge (multiple_choice): pregunta de refuerzo diferente al discovery

Al final agrega 1 boss_loop (multiple_choice integrador de todos los conceptos) y 1 mastery_screen.

Reglas para multiple_choice: exactamente 3 opciones (A, B, C), incluye correctAnswer y wrongHints.

JSON de respuesta:
{
  "topic": "Nombre del tema",
  "slides": [
    {
      "type": "discovery_challenge",
      "interactionType": "multiple_choice",
      "conceptIndex": 0,
      "conceptName": "Nombre concepto",
      "emoji": "📐",
      "question": "Pregunta (max 20 palabras)?",
      "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
      "correctAnswer": "A",
      "explanation": "Por qué es correcto (max 80 chars).",
      "wrongHints": {"B": "Por qué B es incorrecto.", "C": "Por qué C es incorrecto."}
    },
    {
      "type": "insight",
      "conceptIndex": 0,
      "conceptName": "Nombre concepto",
      "emoji": "💡",
      "title": "Nombre corto del concepto",
      "body": "Definición + analogía cotidiana. Max 35 palabras."
    },
    {
      "type": "reinforcement_challenge",
      "interactionType": "multiple_choice",
      "conceptIndex": 0,
      "conceptName": "Nombre concepto",
      "question": "Pregunta diferente al discovery (max 20 palabras)?",
      "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
      "correctAnswer": "B",
      "explanation": "Por qué es correcto (max 80 chars).",
      "wrongHints": {"A": "Por qué A es incorrecto.", "C": "Por qué C es incorrecto."}
    }
  ],
  "retrySlides": {}
}

Transcripción:
${normalizeText(transcription)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DesafioGenerationResult {
  session: DesafioSession;
  pedagogicalType: string;
}

export async function generateDesafioContent(
  transcription: string,
  curso: string,
): Promise<DesafioGenerationResult> {
  const classification = classifyContent(transcription);

  // Attempt 1 — full adaptive prompt
  try {
    const prompt = buildDesafioPrompt(transcription, curso);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 12000,
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    const { topic, slides, retrySlides } = parseDesafioJson(raw);
    const conceptCount = slides.filter(s => s.type === 'insight').length;
    return {
      session: {
        id: randomUUID(),
        topic,
        conceptCount,
        slides,
        retrySlides: Object.keys(retrySlides).length > 0 ? retrySlides : undefined,
      },
      pedagogicalType: classification.type,
    };
  } catch (err: any) {
    console.warn('[Desafío] Full prompt failed, retrying with simple prompt:', err?.message);
  }

  // Attempt 2 — simplified prompt (MC only, 3 slides per concept)
  const simplePrompt = buildSimpleDesafioPrompt(transcription, curso);
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: simplePrompt }],
    temperature: 0.4,
    max_tokens: 6000,
  });
  const raw = completion.choices[0]?.message?.content ?? '';
  const { topic, slides, retrySlides } = parseDesafioJson(raw);
  const conceptCount = slides.filter(s => s.type === 'insight').length;
  return {
    session: {
      id: randomUUID(),
      topic,
      conceptCount,
      slides,
      retrySlides: Object.keys(retrySlides).length > 0 ? retrySlides : undefined,
    },
    pedagogicalType: classification.type,
  };
}

export function buildDesafioSession(session: DesafioSession): DesafioSession {
  return session;
}
