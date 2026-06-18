/**
 * Desafío generation service — v2 (KB-driven, Mission-grounded).
 *
 * NEW ARCHITECTURE:
 *   Document → Mission JSON → Knowledge Base → Desafío Generator
 *
 * The Desafío no longer reads the raw transcription.
 * A Knowledge Base is extracted deterministically from Mission slides and
 * used as the sole content source — guaranteeing coherence with what the
 * student already learned. No new concepts are introduced.
 *
 * Interaction types: multiple_choice, match_pairs, fill_blank, classify, order_steps
 * Adaptive features: spaced repetition, pre-generated retry slides, boss challenge
 */

import OpenAI from 'openai';
import { randomUUID } from 'crypto';
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
  examples?: { expression: string; label: string }[];
}

interface DesafioSession {
  id: string;
  topic: string;
  conceptCount: number;
  slides: DesafioSlide[];
  retrySlides?: Record<string, DesafioSlide[]>;
}

// ── Knowledge Base — extracted from Mission slides ────────────────────────────

interface DesafioKnowledgeBase {
  topic: string;
  concepts: Array<{
    name: string;
    definition: string;
    emoji?: string;
  }>;
  // Correct answers seen in Mission — use as material for exercises
  examples: Array<{
    expression: string;
    label: string;
    concept: string;
  }>;
  // Wrong answers + corrections seen in Mission — use as distractors/hints
  mistakes: Array<{
    wrongAnswer: string;
    correction: string;
    concept: string;
  }>;
  // Questions already asked in Mission — NEVER repeat these verbatim
  usedQuestions: string[];
}

export function extractKnowledgeBase(slides: any[], topicOverride: string): DesafioKnowledgeBase {
  const concepts: DesafioKnowledgeBase['concepts'] = [];
  const examples: DesafioKnowledgeBase['examples'] = [];
  const mistakes: DesafioKnowledgeBase['mistakes'] = [];
  const usedQuestions: string[] = [];
  let currentConceptName = '';

  const INTERACTIVE_TYPES = ['micro_challenge', 'reinforcement_challenge', 'application', 'final_challenge'];

  for (const slide of slides) {
    if (!slide || typeof slide !== 'object') continue;
    const type = String(slide.type ?? '');

    if (type === 'main_concept') {
      const name = String(slide.title ?? '').trim();
      // Mission slides use 'definition'; fallback to 'body' for forward compat
      const definition = String(slide.definition ?? slide.body ?? '').trim();
      if (name && definition) {
        concepts.push({ name, definition, emoji: slide.emoji });
        currentConceptName = name;
      }
      // Mission slides also carry a concrete 'example' string — great material for insight cards
      const ex = String(slide.example ?? '').trim();
      if (ex && currentConceptName) {
        examples.push({ expression: ex, label: currentConceptName, concept: currentConceptName });
      }
      continue;
    }

    if (INTERACTIVE_TYPES.includes(type)) {
      const question = String(slide.question ?? '').trim();
      if (question) usedQuestions.push(question);

      const correctAnswer = slide.correctAnswer as string | undefined;

      // ── Mission format: options = string[], correctAnswer = option text ──────
      if (Array.isArray(slide.options)) {
        const wrongHints: Record<string, string> = slide.wrongAnswerHints ?? {};
        for (const opt of slide.options as string[]) {
          if (!opt) continue;
          if (opt === correctAnswer) {
            examples.push({ expression: opt, label: currentConceptName, concept: currentConceptName });
          } else if (wrongHints[opt]) {
            mistakes.push({ wrongAnswer: opt, correction: wrongHints[opt], concept: currentConceptName });
          }
        }
      }

      // ── Desafío legacy format: choices = {letter,text}[], correctAnswer = letter ─
      if (Array.isArray(slide.choices)) {
        const wrongHints: Record<string, string> = slide.wrongHints ?? {};
        for (const choice of slide.choices as Array<{ letter: string; text: string }>) {
          if (!choice?.text) continue;
          if (choice.letter === correctAnswer) {
            examples.push({ expression: choice.text, label: currentConceptName, concept: currentConceptName });
          } else if (wrongHints[choice.letter]) {
            mistakes.push({ wrongAnswer: choice.text, correction: wrongHints[choice.letter], concept: currentConceptName });
          }
        }
      }
    }
  }

  const topic = topicOverride || concepts[0]?.name || 'Desafío de Refuerzo';
  return { topic, concepts, examples, mistakes, usedQuestions };
}

const openai = new OpenAI({ apiKey: config.openai_api_key });

// ── JSON schema template (output format — unchanged) ──────────────────────────

const DESAFIO_SCHEMA = `
DEVUELVE EXACTAMENTE este JSON (sin texto adicional, sin markdown):
{
  "topic": "kb.topic o nombre descriptivo del tema",
  "slides": [

    // ── BLOQUE POR CONCEPTO (repetir para cada concepto de kb.concepts[]) ──

    // [1] discovery_challenge — siempre multiple_choice
    {
      "type": "discovery_challenge",
      "interactionType": "multiple_choice",
      "conceptIndex": 0,
      "conceptName": "Nombre EXACTO de kb.concepts[0].name",
      "emoji": "🔢",
      "question": "Pregunta usando ejemplos de kb.examples[] (max 20 palabras)?",
      "choices": [
        {"letter": "A", "text": "Opción A (max 10 palabras)"},
        {"letter": "B", "text": "Opción B"},
        {"letter": "C", "text": "Opción C"}
      ],
      "correctAnswer": "A",
      "explanation": "Por qué A es correcto (max 100 chars, sin 'Correcto' ni emojis).",
      "wrongHints": {
        "B": "Basado en kb.mistakes[] — por qué B es incorrecto.",
        "C": "Basado en kb.mistakes[] — por qué C es incorrecto."
      }
    },

    // [2] interactive_challenge — tipo varía por concepto (ver reglas)
    // EJEMPLO match_pairs (concepto 0):
    {
      "type": "reinforcement_challenge",
      "interactionType": "match_pairs",
      "conceptIndex": 0,
      "conceptName": "Nombre EXACTO de kb.concepts[0].name",
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
      "conceptName": "Nombre EXACTO de kb.concepts[0].name",
      "title": "¿Por qué? (max 5 palabras)",
      "body": "Conecta discovery con insight, puede referenciar un error de kb.mistakes[]. Max 35 palabras."
    },

    // [4] insight — NO interactivo — usa kb.concepts[i].definition como base
    {
      "type": "insight",
      "conceptIndex": 0,
      "conceptName": "Nombre EXACTO de kb.concepts[0].name",
      "emoji": "💡",
      "title": "Nombre del Concepto",
      "body": "Basado en kb.concepts[0].definition + analogía cotidiana. Max 35 palabras.",
      "examples": [
        {"expression": "De kb.examples[]", "label": "categoría"},
        {"expression": "De kb.examples[]", "label": "categoría"}
      ]
    },

    // [5] reinforcement_challenge — multiple_choice O mismo tipo que [2]
    {
      "type": "reinforcement_challenge",
      "interactionType": "multiple_choice",
      "conceptIndex": 0,
      "conceptName": "Nombre EXACTO de kb.concepts[0].name",
      "question": "Ángulo distinto al discovery, usando otro ejemplo de kb.examples[] (max 20 palabras)?",
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
      "conceptName": "Nombre EXACTO del concepto revisado",
      "isSpacedRepetition": true,
      "question": "Pregunta DIFERENTE a todas las ya generadas para ese concepto.",
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
      "question": "Pregunta que integra TODOS los conceptos del KB (max 30 palabras)?",
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
      "conceptsCovered": ["kb.concepts[0].name", "kb.concepts[1].name", "kb.concepts[2].name"]
    }
  ],

  // retrySlides: DOS entradas distintas por cada concepto de kb.concepts[].
  // Cada par evalúa el mismo concepto desde ángulos diferentes. NINGUNA pregunta puede repetir
  // contenido de discovery_challenge, reinforcement_challenge ni spaced_repetition del mismo concepto.
  // Si son 2 conceptos → claves "0" y "1". Si son 3 → claves "0", "1" y "2". Etc.
  "retrySlides": {
    "0": [
      {
        "type": "reinforcement_challenge",
        "interactionType": "fill_blank",
        "isRetry": true,
        "conceptIndex": 0,
        "conceptName": "Nombre EXACTO de kb.concepts[0].name",
        "blankSentence": "Expresión con ___ diferente a todas las preguntas anteriores del concepto",
        "blankChoices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
        "blankAnswer": "B",
        "blankExplanation": "..."
      },
      {
        "type": "reinforcement_challenge",
        "interactionType": "multiple_choice",
        "isRetry": true,
        "conceptIndex": 0,
        "conceptName": "Nombre EXACTO de kb.concepts[0].name",
        "question": "Segundo ángulo del concepto — distinto a discovery, reinforcement y retry anterior.",
        "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
        "correctAnswer": "A",
        "explanation": "...",
        "wrongHints": {"B": "...", "C": "..."}
      }
    ],
    "1": [
      {
        "type": "reinforcement_challenge",
        "interactionType": "multiple_choice",
        "isRetry": true,
        "conceptIndex": 1,
        "conceptName": "Nombre EXACTO de kb.concepts[1].name",
        "question": "Ángulo diferente a discovery y reinforcement de este concepto.",
        "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
        "correctAnswer": "C",
        "explanation": "...",
        "wrongHints": {"A": "...", "B": "..."}
      },
      {
        "type": "reinforcement_challenge",
        "interactionType": "fill_blank",
        "isRetry": true,
        "conceptIndex": 1,
        "conceptName": "Nombre EXACTO de kb.concepts[1].name",
        "blankSentence": "Expresión con ___ diferente a todas las preguntas anteriores del concepto",
        "blankChoices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
        "blankAnswer": "A",
        "blankExplanation": "..."
      }
    ],
    "2": [
      {
        "type": "reinforcement_challenge",
        "interactionType": "order_steps",
        "isRetry": true,
        "conceptIndex": 2,
        "conceptName": "Nombre EXACTO de kb.concepts[2].name",
        "orderPrompt": "Ordena los pasos correctamente",
        "steps": ["Paso B mezclado", "Paso C mezclado", "Paso A mezclado"],
        "correctOrder": [2, 0, 1],
        "orderExplanation": "Explicación del orden correcto (max 80 chars)"
      },
      {
        "type": "reinforcement_challenge",
        "interactionType": "multiple_choice",
        "isRetry": true,
        "conceptIndex": 2,
        "conceptName": "Nombre EXACTO de kb.concepts[2].name",
        "question": "Segundo ángulo del concepto — distinto a discovery, reinforcement y retry anterior.",
        "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
        "correctAnswer": "B",
        "explanation": "...",
        "wrongHints": {"A": "...", "C": "..."}
      }
    ]
  }
}`;

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildDesafioPrompt(kb: DesafioKnowledgeBase, curso: string): string {
  const kbJson = JSON.stringify(kb, null, 2);
  return `Eres un diseñador de sesiones de aprendizaje estilo Duolingo para estudiantes chilenos de enseñanza media (${curso}).

⚠️ REGLA CRÍTICA: TODO contenido DEBE derivarse EXCLUSIVAMENTE del KNOWLEDGE BASE.
No introduzcas conceptos, términos, ejemplos ni relaciones que no estén en el KB.
Las preguntas de kb.usedQuestions[] NO PUEDEN repetirse verbatim — crea variaciones nuevas.
DEVUELVE SOLO JSON VÁLIDO. En español.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KNOWLEDGE BASE — contenido ya enseñado en la Misión completada por el estudiante
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${kbJson}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 1 — CONCEPTOS A DESAFIAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Usa EXACTAMENTE los conceptos de kb.concepts[] en el orden dado. Máx. 4.
El campo conceptName en CADA slide DEBE coincidir exactamente con el nombre en kb.concepts[].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 2 — DISEÑO DEL DESAFÍO: 5 SLIDES POR CONCEPTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para CADA concepto en kb.concepts[], genera EXACTAMENTE en este orden:

[1] discovery_challenge — interactionType: "multiple_choice" SIEMPRE
    Pregunta de descubrimiento usando términos y ejemplos del KB.
    - question: max 20 palabras. NO repetir kb.usedQuestions[]. Usa kb.examples[].expression.
    - choices: EXACTAMENTE 3 (A, B, C). Una correcta. Dos distractores basados en kb.mistakes[].
    - correctAnswer: "A"|"B"|"C" — VARIAR posición entre conceptos, no siempre A
    - explanation: por qué es correcto (max 100 chars, sin "Correcto" ni emojis)
    - wrongHints: basados en kb.mistakes[] de ese concepto — por qué cada opción incorrecta falla
    - emoji: emoji del concepto — NUNCA geometría (📐📏🔺🔷); usar 🔢🧮➗✖️➕➖ para matemáticas

[2] interactive_challenge — interactionType ROTA entre conceptos:
    C0 → "match_pairs", C1 → "fill_blank", C2 → "classify", C3 → "order_steps"
    (Con 2 conceptos: C0 → "match_pairs", C1 → "fill_blank")
    (Con 3 conceptos: C0 → "match_pairs", C1 → "fill_blank", C2 → "classify")

    Usa kb.examples[] y kb.mistakes[] como material para pares/opciones/ítems.

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
    - body: 1-2 oraciones, max 35 palabras. Puede referenciar un error de kb.mistakes[].

[4] insight — SIN interactionType
    No interactivo. Usa kb.concepts[i].definition como base de la definición.
    - emoji, title (max 5 palabras), body (definición del KB + analogía, max 35 palabras)
    - examples: 2 ítems de kb.examples[] como mini tarjetas
      { "expression": "texto de kb.examples[].expression (max 12 chars)", "label": "etiqueta (max 12 chars)" }

[5] reinforcement_challenge — interactionType según concepto:
    C0/C2 → "multiple_choice". C1/C3 → mismo tipo que [2] de ese concepto.
    DIFERENTE ángulo al discovery_challenge del mismo concepto.
    Usa material de kb.examples[] y kb.mistakes[].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 3 — SPACED REPETITION (insertar ENTRE bloques de conceptos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Después de los 5 slides de cada concepto (empezando por el segundo concepto):
Insertar 1 slide type "spaced_repetition" que repasa el CONCEPTO ANTERIOR:
  - interactionType: "multiple_choice" O "fill_blank"
  - isSpacedRepetition: true
  - conceptIndex: índice del concepto que se repasa
  - Pregunta DIFERENTE a las ya generadas para ese concepto y a kb.usedQuestions[]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 4 — BOSS CHALLENGE (al finalizar todos los conceptos y spaced repetitions)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generar 2 slides boss_loop:
  - PRIMER boss: interactionType ≠ "multiple_choice" (usar "classify" o "match_pairs")
    conceptIndex: -1, conceptName: "Boss Battle"
    Integra material de ≥ 2 conceptos del KB
  - SEGUNDO boss: interactionType "multiple_choice"
    conceptIndex: -1, conceptName: "Boss Battle", emoji: "🏆"
    Pregunta integradora que solo puede responder quien dominó TODOS los conceptos (max 30 palabras)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 5 — MASTERY SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Slide final no interactiva. type: "mastery_screen"
  - conceptIndex: -1, title (max 6 palabras), body (max 25 palabras)
  - conceptsCovered: nombres EXACTOS de kb.concepts[] (igual que conceptName de los insights)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 6 — RETRY SLIDES (campo "retrySlides" en JSON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para CADA concepto de kb.concepts[], generar 2 retry slides en retrySlides[String(conceptIndex)]:
  - type: "reinforcement_challenge", isRetry: true
  - Las 2 preguntas DIFERENTES entre sí y distintas a discovery, reinforcement y spaced_repetition
  - NO repetir kb.usedQuestions[]
  - Retry 1: interactionType DIFERENTE al [2] de ese concepto
    (Si [2] fue "match_pairs" → usar "fill_blank" o "multiple_choice")
  - Retry 2: interactionType diferente al retry 1 (puede ser "multiple_choice")
  - Misma dificultad, ángulos distintos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS TRANSVERSALES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Distractores plausibles — basados en kb.mistakes[], no inventados
• Sin "Todas/Ninguna de las anteriores"
• La opción correcta NO es siempre la más larga
• wrongHints OBLIGATORIOS para todas las opciones incorrectas en multiple_choice
• Para ${curso}: vocabulario y contextos apropiados al nivel

${DESAFIO_SCHEMA}`;
}

function buildSimpleDesafioPrompt(kb: DesafioKnowledgeBase, curso: string): string {
  return `Eres un diseñador de sesiones de aprendizaje para estudiantes chilenos de ${curso}.
REGLA CRÍTICA: Devuelve SOLO JSON VÁLIDO, sin comentarios, sin texto adicional. En español.
TODO contenido DEBE derivarse EXCLUSIVAMENTE del KNOWLEDGE BASE. No introduzcas conceptos nuevos.
Las preguntas de kb.usedQuestions[] NO pueden repetirse verbatim.

KNOWLEDGE BASE:
${JSON.stringify(kb, null, 2)}

Para cada concepto en kb.concepts[] genera en orden:
1. discovery_challenge (multiple_choice): pregunta usando kb.examples[] como material
2. insight: body basado en kb.concepts[i].definition, con 2 examples de kb.examples[]
3. reinforcement_challenge (multiple_choice): pregunta diferente al discovery

Al final agrega 1 boss_loop (multiple_choice integrador de todos los conceptos) y 1 mastery_screen.

Reglas para multiple_choice: exactamente 3 opciones (A, B, C), incluye correctAnswer y wrongHints.
conceptName DEBE coincidir exactamente con kb.concepts[i].name.

JSON de respuesta:
{
  "topic": "Nombre del tema",
  "slides": [
    {
      "type": "discovery_challenge",
      "interactionType": "multiple_choice",
      "conceptIndex": 0,
      "conceptName": "Nombre EXACTO de kb.concepts[0].name",
      "emoji": "🔢",
      "question": "Pregunta usando ejemplos del KB (max 20 palabras)?",
      "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
      "correctAnswer": "A",
      "explanation": "Por qué es correcto (max 80 chars).",
      "wrongHints": {"B": "Por qué B es incorrecto.", "C": "Por qué C es incorrecto."}
    },
    {
      "type": "insight",
      "conceptIndex": 0,
      "conceptName": "Nombre EXACTO de kb.concepts[0].name",
      "emoji": "💡",
      "title": "Nombre corto del concepto",
      "body": "Basado en kb.concepts[0].definition + analogía cotidiana. Max 35 palabras.",
      "examples": [
        {"expression": "De kb.examples[]", "label": "categoría"}
      ]
    },
    {
      "type": "reinforcement_challenge",
      "interactionType": "multiple_choice",
      "conceptIndex": 0,
      "conceptName": "Nombre EXACTO de kb.concepts[0].name",
      "question": "Pregunta diferente al discovery (max 20 palabras)?",
      "choices": [{"letter":"A","text":"..."},{"letter":"B","text":"..."},{"letter":"C","text":"..."}],
      "correctAnswer": "B",
      "explanation": "Por qué es correcto (max 80 chars).",
      "wrongHints": {"A": "Por qué A es incorrecto.", "C": "Por qué C es incorrecto."}
    }
  ],
  "retrySlides": {}
}`;
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
    examples: Array.isArray(s.examples)
      ? (s.examples as any[])
          .filter(e => typeof e?.expression === 'string' && typeof e?.label === 'string')
          .map(e => ({ expression: e.expression as string, label: e.label as string }))
      : undefined,
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
    slides.push({
      type: 'mastery_screen',
      conceptIndex: -1,
      conceptName: 'Completado',
      title: '¡Desafío superado!',
      body: 'Completaste todos los conceptos del Desafío.',
      conceptsCovered: [],
    });
  }

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

// ── Main export ───────────────────────────────────────────────────────────────

interface DesafioGenerationResult {
  session: DesafioSession;
  pedagogicalType: string;
}

export async function generateDesafioContent(
  missionSlides: any[],
  curso: string,
  topic?: string,
): Promise<DesafioGenerationResult> {
  const kb = extractKnowledgeBase(missionSlides, topic ?? '');

  if (kb.concepts.length === 0) {
    throw new Error('No se encontraron conceptos en la Misión para generar el Desafío');
  }

  console.log(`[Desafío] KB extraído — ${kb.concepts.length} conceptos, ${kb.examples.length} ejemplos, ${kb.mistakes.length} errores comunes`);

  // Attempt 1 — full adaptive prompt with KB
  try {
    const prompt = buildDesafioPrompt(kb, curso);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 16000,
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    const finishReason = completion.choices[0]?.finish_reason;
    if (!raw) throw new Error(`Empty AI response (finish_reason: ${finishReason})`);
    console.log(`[Desafío] Full prompt response — finish_reason: ${finishReason}, length: ${raw.length} chars`);
    const { topic: responseTopic, slides, retrySlides } = parseDesafioJson(raw);
    const conceptCount = slides.filter(s => s.type === 'insight').length;
    return {
      session: {
        id: randomUUID(),
        topic: responseTopic,
        conceptCount,
        slides,
        retrySlides: Object.keys(retrySlides).length > 0 ? retrySlides : undefined,
      },
      pedagogicalType: 'CONCEPTUAL',
    };
  } catch (err: any) {
    console.warn('[Desafío] Full prompt failed, retrying with simple prompt:', err?.message);
  }

  // Attempt 2 — simplified prompt (MC only)
  const simplePrompt = buildSimpleDesafioPrompt(kb, curso);
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: simplePrompt }],
    temperature: 0.4,
    max_tokens: 6000,
  });
  const raw = completion.choices[0]?.message?.content ?? '';
  const { topic: responseTopic, slides, retrySlides } = parseDesafioJson(raw);
  const conceptCount = slides.filter(s => s.type === 'insight').length;
  return {
    session: {
      id: randomUUID(),
      topic: responseTopic,
      conceptCount,
      slides,
      retrySlides: Object.keys(retrySlides).length > 0 ? retrySlides : undefined,
    },
    pedagogicalType: 'CONCEPTUAL',
  };
}

export function buildDesafioSession(session: DesafioSession): DesafioSession {
  return session;
}
