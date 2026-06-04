/**
 * Generation service for study sessions using OpenAI.
 * Pedagogical philosophy: micro-learning gamificado estilo Duolingo.
 * Routes to different prompt structures based on pedagogical type:
 *   CONCEPTUAL  → 10-screen discovery mission (HOOK → CONCEPTO → … → VICTORIA)
 *   PROCEDURAL  → 7-screen skills mission (GANCHO → MÉTODO → PRÁCTICA → … → VICTORIA)
 *   MEMORIZATION → 8-screen memory mission (DATO → ASOCIACIÓN → RETO → … → VICTORIA)
 *   MIXED       → CONCEPTUAL structure (safe fallback)
 */

import OpenAI from 'openai';
import type {
  MultipleChoiceQuestion,
  Flashcard,
  Summary,
  SummarySlide,
  SummarySlideType,
  IllustrationType,
  SessionConfig,
  GeneratedSession,
} from '../types.js';
import { config } from '../config.js';
import { classifyContent, type DetectedSkill } from './pedagogicalClassifier.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

function normalizeText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fisher-Yates shuffle — used to randomize quiz option positions after generation.
// AI models have a strong prior toward placing the correct answer first and writing
// it longer, so prompt rules alone cannot fix position/length bias reliably.
function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Maps whatever the AI put in correctOptionId ("A", "1", "o-1", or an actual ID)
// to the stable internal ID of the matching option — resolved BEFORE the shuffle
// so that correctOptionId remains valid after options are reordered.
function resolveCorrectOptionId(options: { id: string }[], rawId: string): string {
  if (!rawId) return options[0]?.id ?? 'o-1';
  if (options.some(o => o.id === rawId)) return rawId;
  const letterIdx = 'ABCD'.indexOf(rawId.toUpperCase().trim());
  if (letterIdx >= 0 && letterIdx < options.length) return options[letterIdx].id;
  const numIdx = parseInt(rawId, 10) - 1;
  if (!isNaN(numIdx) && numIdx >= 0 && numIdx < options.length) return options[numIdx].id;
  return options[0]?.id ?? 'o-1';
}

export interface GenerationResult {
  subject: string;
  topic: string;
  questions: MultipleChoiceQuestion[];
  flashcards: Flashcard[];
  summary: Summary;
  groundingScore: number;
  pedagogicalType?: string;
  primarySkill?: DetectedSkill;
  learningPath?: DetectedSkill[];
}

// ── Shared JSON schema (appended to all prompts) ─────────────────────────────

const JSON_SCHEMA = `
JSON SCHEMA — return ONLY this structure:
{
  "subject": string,
  "topic": string,
  "questions": [
    {
      "id": string,
      "text": string,
      "options": [{"id": string, "text": string}],
      "correctOptionId": string,
      "explanation": string,
      "sourceQuote": string,
      "difficulty": "easy" | "medium" | "hard"
    }
  ],
  "flashcards": [
    {
      "id": string,
      "front": string,
      "back": string,
      "sourceQuote": string,
      "difficulty": "easy" | "medium" | "hard"
    }
  ],
  "summary": {
    "id": string,
    "title": string,
    "slides": [
      {
        "type": "mission"|"main_concept"|"comprehension"|"key_relation"|"mini_quiz"|"process_flow"|"decide"|"application"|"common_error"|"wow_fact"|"victory"|"challenge",
        "emoji": string,
        "title": string,
        "definition": string,
        "example": string | null,
        "connector": string | null,
        "visualHint": string | null,
        "illustrationType": "educational"|"diagram"|"concept"|"timeline"|"map"|"process"|"comparison"|null,
        "question": string | null,
        "options": [string] | null,
        "correctAnswer": string | null,
        "wrongAnswerHints": { "<letter>": string } | null
      }
    ],
    "sourceQuotes": [string]
  }
}`;

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildConceptualPrompt(transcription: string, curso: string): string {
  return `You are a Duolingo-style learning experience designer for Chilean high-school students (${curso}). Your mission is NOT to summarize a document — it is to engineer DISCOVERY moments that make a teenager feel "quiero ver la siguiente pantalla."

⚠️ CRITICAL CONTENT RULE — READ BEFORE GENERATING ANYTHING:
ALL content (titles, definitions, examples, questions, options, connectors) MUST be derived EXCLUSIVELY from the transcription below.
DO NOT introduce concepts, terms, vocabulary, or examples from outside the transcription.
The format examples scattered through this prompt are FORMAT demonstrations only — their subject matter (e.g., biology, physics examples used to illustrate structure) must NEVER appear in the output unless they also appear in the transcription.
If the transcription is about Ondas → every screen talks about ondas, frecuencia, amplitud, longitud de onda — NEVER about demanda, precio, stock, or any other topic.
Treat the transcription as the ONLY allowed source of academic content.

SESSION PHILOSOPHY:
  HOOK → CONCEPTO CLAVE → MICRO RETO → RELACIÓN → MINI QUIZ → DESAFÍO → APLICACIÓN → ERROR COMÚN → CURIOSIDAD → VICTORIA
  Each screen must provoke exactly ONE of: Curiosidad / Sorpresa / Conexión personal / Descubrimiento / Reflexión.
  A screen that only INFORMS is invalid. It must make the student FEEL something.

RETURN ONLY VALID JSON. No extra text. All content in Spanish.

CURSO ADAPTATION (MANDATORY):
- 1º Medio: very simple language, recognition questions, everyday examples, no inference.
- 2º Medio: plain language, basic application, conceptual understanding.
- 3º Medio: relational analysis, reasoning, real consequences.
- 4º Medio: critical thinking, complex application, pre-university depth.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERNAL ANALYSIS — do this mentally BEFORE generating JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. List ALL distinct concepts and topics present in this document (exhaustive — no skipping). Count them. Then confirm your session will cover ≥80% of them (if 5 concepts → minimum 4 must appear in slides). Write the list now before generating JSON.
2. Assign each key concept to a specific screen BEFORE writing JSON. Interactive screens (3, 5, 6) must each test a DIFFERENT concept.
3. What is the causal chain? (A causes B causes C — not just "A relates to B")
4. What would a smart 15-year-old WRONGLY believe about this topic?
5. What is the single most counterintuitive fact? → this becomes screen 9 (wow_fact).
6. Which concept can be turned into a genuine dilemma? → this becomes screen 6 (decide).
7. Are any two concepts nearly identical? If YES → only include the more interesting one.
NO-REPETITION LAW: Each of the 10 screens must teach something DIFFERENT. Before writing each screen ask: "Did I already show this idea?" If YES → use a different concept.
COVERAGE LAW: If the document has N distinct concepts, at least ⌈N × 0.8⌉ must appear in the session. A single-concept session from a multi-concept document is INVALID.
NEVER-EMPTY LAW: Every slide MUST have title ≥ 3 words and definition ≥ 10 words. Check each slide before including it in the JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEXT LIMITS — apply to EVERY screen:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- definition: maximum 2 sentences OR 30 words — whichever is shorter.
- example: maximum 15 words.
- title: maximum 8 words.
Prefer scannable phrases over connected prose.
FORMAT ONLY — replace with concepts from the document:
BAD: "La onda es una perturbación que viaja a través del medio transfiriendo su energía de un punto al otro."
GOOD: "La onda viaja por el medio.\nLleva energía, no materia.\nSe debilita con la distancia."
⚠️ NEVER copy this subject matter (ondas) into sessions about other topics.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROGRESSIVE DIFFICULTY — mandatory across interactive screens:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Screen 3 (comprehension) → NIVEL 1: RECORDAR — recognition. Did they absorb the concept?
Screen 5 (mini_quiz)     → NIVEL 2-3: COMPRENDER + APLICAR — must reason, not just recall.
Screen 6 (decide)        → NIVEL 3-4: APLICAR + ANALIZAR — choice with consequences.
wow_fact question        → NIVEL 4: ANALIZAR — reason about the counterintuitive outcome.
Each successive interactive screen MUST be harder than the previous one.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMOTIONAL FEEDBACK RULE — applies to ALL interactive screens (3, 5, 6, wow_fact):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The "definition" field is shown AFTER the student answers. It must feel like a coach, not a textbook.
MANDATORY: start with ONE of these emoji reactions, then explain WHY in max 15 words:
  🔥 Exacto — [why, derived from THIS document's content]
  🚀 Correcto — [why, derived from THIS document's content]
  ⚡ Lo captaste — [why, derived from THIS document's content]
  🎯 Acertaste — [why, derived from THIS document's content]
❌ FORBIDDEN: "La respuesta correcta es...", "Correcto porque...", "Esta opción es la correcta..."
✅ REQUIRED: the explanation should also hint why the main distractor was tempting.
FORMAT: "🔥 Exacto — [key insight from THIS topic in 10 words, hinting why wrong option was tempting]."
⚠️ The explanation content MUST come exclusively from the transcription. Never invent concepts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISTRACTOR QUALITY RULE — all interactive screens:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All wrong options must be believable partial-truths, not obvious nonsense.
❌ STRICTLY FORBIDDEN in any option: "Todas las anteriores", "Ninguna de las anteriores", "No cambia nada", "porque sí", "todas pueden ocurrir", "no tiene ningún efecto".
RULE: EXACTLY ONE clearly correct answer per question. If two options could both be correct → rewrite.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE 10 SCREENS — generate EXACTLY in this order:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCREEN 1 — type: "mission" — emoji: 🎯
THE HOOK — most critical screen. Creates IMMEDIATE curiosity. If this screen is boring, the student stops.
- title: A CURIOSITY QUESTION about the topic. MAX 14 words. MUST end with "?".
  The student reads it and thinks: "Hm, I want to know the answer to that."
  ✅ GOOD — Física/Ondas: "¿Cómo puede viajar música por el aire sin ningún cable?"
  ✅ GOOD — Física/Ondas: "¿Por qué escuchas el trueno DESPUÉS de ver el relámpago?"
  ✅ GOOD — Biología: "¿Cómo come una planta si no tiene boca ni estómago?"
  ✅ GOOD — Tecnología: "¿Cómo sabe Spotify qué canción querrás escuchar antes de que la conozcas?"
  ✅ GOOD — Historia: "¿Por qué un país rico puede volverse pobre en pocos años?"
  ✅ GOOD — Química: "¿Por qué mezclar agua con aceite es casi imposible?"
  ⚠️ FORMAT EXAMPLES ONLY — create a curiosity question about THIS document's topic, not these subjects.
  ❌ BAD: "Misión: Ondas y sus parámetros" — NOT a question. Creates zero curiosity.
  ❌ BAD: "Descubre cómo funcionan las ondas" — declarative statement, not a hook.
  ❌ BAD: "¿Qué son las ondas?" — too direct. Doesn't create mystery.
  RULE: The title MUST be an indirect curiosity question, NOT a direct "¿Qué es X?" question.
- definition: ONE sentence that teases the discovery — what will they understand by the end? Max 20 words.
  DO NOT reveal the answer. Create anticipation.
  ✅ "Al terminar esta misión, entenderás por qué esto afecta tu vida más de lo que crees."
  ✅ "Descubrirás algo sobre este tema que contradice lo que la mayoría da por sentado."
  ❌ "Aprenderás sobre las ondas y sus parámetros" — boring, informational, no anticipation.
- example: subject area in 3-5 words. Example: "Física · 2° Medio" or "Biología · 3° Medio"

SCREEN 2 — type: "main_concept" — emoji: fitting to content
DISCOVERY SEQUENCE: Pregunta → Descubrimiento → Explicación breve
- title: concept name (max 5 words)
- definition: TWO sentences max 25 words total:
  Sentence 1: A question the student can't yet answer (curiosity hook)
  Sentence 2: The discovery — answers the question simply, zero jargon
  FORMAT ONLY — write about THIS document's content, never copy these subjects:
  ✅ Física: "¿Por qué los murciélagos vuelan en total oscuridad? Emiten sonidos y detectan el eco que rebotan en los objetos."
  ✅ Biología: "¿Por qué sientes hambre aunque acabas de comer? Tu cuerpo usa señales químicas para mantener estable su nivel de energía."
  ❌ "En esta sesión aprenderemos sobre [tema]." — statement, not discovery.
- example: SPECIFIC situation a Chilean teenager encounters TODAY. Concrete name or number.
  FORMAT ONLY — write about THIS document's content, never copy these subjects:
  ✅ Física: "Tu celular usa señales 5G: ondas con frecuencia altísima que transmiten más datos por segundo."
  ✅ Biología: "Cuando entrenas, tus músculos se rompen microscópicamente y el cuerpo los repara más gruesos."
  ❌ "Esto es relevante para la vida cotidiana." — FORBIDDEN, too abstract.
- connector: REQUIRED — visual causal chain in EXACTLY this format:
  "emoji1 Step1 ↓ verb ↓ emoji2 Step2 ↓ verb ↓ emoji3 Step3"
  Each node = emoji + max 3 words. Each verb = 1 transitive word.
  FORMAT ONLY — never copy these subjects; derive from the document:
  ✅ Física: "🎵 Fuente vibra ↓ genera ↓ 🌊 Onda sonora ↓ llega a ↓ 👂 Percepción auditiva"
  ✅ Biología: "☀️ Luz solar ↓ activa ↓ 🌿 Fotosíntesis ↓ produce ↓ 🍬 Glucosa celular"
  ⚠️ NEVER copy (sonido, fotosíntesis) — use concepts from THIS document.
  VERB RULE: each verb must describe what NodeA DOES to cause NodeB — NOT NodeB's state.
  ✅ Correct verbs: genera, eleva, activa, reduce, impulsa, causa, provoca, transforma
  ❌ WRONG: using "sube" or "baja" when they describe the next node's state, not the prior node's action.

SCREEN 3 — type: "comprehension" — emoji: 🤔  [INTERACTIVE — NIVEL 1: RECORDAR]
- title: "¿Comprendiste?"
- question: SITUATIONAL — present a scenario, ask what concept applies (max 25 words). NOT a definition question.
  ✅ "¿Cuál de estas situaciones describe mejor el concepto anterior?"
  ✅ "Si el precio de las bebidas sube en todo Chile, ¿qué está ocurriendo probablemente?"
  ❌ "¿Qué es la demanda?" — FORBIDDEN, pure definition.
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options, each max 12 words
- correctAnswer: "A", "B", "C", or "D"
- definition: emotional feedback (see EMOTIONAL FEEDBACK RULE above). Max 20 words total.
  Must start with 🔥, 🚀, ⚡, or 🎯.

SCREEN 4 — type: "key_relation" — emoji: 🔗
ONE CAUSAL CHAIN — exactly 3 nodes, no more.
❌ PROHIBITED: abstract nodes that name only the concept without an action.
✅ REQUIRED: nodes must be VISIBLE everyday actions or situations from the document.
- connector: "Acción cotidiana ↓ verbo ↓ Consecuencia visible ↓ verbo ↓ Impacto"
  VERB RULE — CRITICAL: every verb must be a TRANSITIVE causal action.
  FORMAT ONLY — never copy these subjects; derive chain from the document:
  ✅ Física: "🎵 Fuente vibra rápido ↓ genera ↓ 🌊 Frecuencia alta ↓ reduce ↓ 📏 Longitud de onda"
  ✅ Biología: "☀️ Luz llega ↓ activa ↓ 🌿 Clorofila ↓ transforma ↓ 🍬 Azúcar energética"
  ✅ Química: "🔥 Calor aumenta ↓ acelera ↓ ⚗️ Reacción química ↓ libera ↓ 💨 Producto nuevo"
  ⚠️ NEVER copy (frecuencia, clorofila, calor) — use concepts from THIS document.
  ❌ "[ConceptoA] ↓ sube ↓ [ConceptoB] ↓ baja ↓ [ConceptoC]" — abstract, not a real situation.
- title: short descriptive name for this relationship (max 6 words)
- definition: why this chain matters to the student personally (max 20 words)
- example: null
- FALLBACK: If no concrete chain exists → use type "comprehension" instead.

SCREEN 5 — type: "mini_quiz" — emoji: ⚡  [INTERACTIVE — NIVEL 2-3: COMPRENDER + APLICAR]
- title: "Quiz rápido"
- question: APPLICATION question — the student REASONS, not just recalls (max 25 words).
  The student must apply the concept to a situation they haven't seen yet.
  FORMAT ONLY — never copy these subjects; write about THIS document's content:
  ✅ Física: "Si duplicas la frecuencia de una onda, ¿qué le ocurre a su longitud de onda manteniendo velocidad constante?"
  ✅ Biología: "Si desaparece el depredador principal de un ecosistema, ¿qué pasará con la población de su presa?"
  ❌ "¿Qué es [término del documento]?" — FORBIDDEN, pure recognition.
  ⚠️ NEVER copy (frecuencia, ecosistema) — write the question about THIS document's concepts.
  2-SECOND TEST: if answerable in < 2 seconds without reasoning → too easy → rewrite.
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options, each max 12 words
- correctAnswer: "A", "B", "C", or "D"
- definition: emotional feedback (see EMOTIONAL FEEDBACK RULE). Max 20 words.
  Must start with 🔥, 🚀, ⚡, or 🎯.

SCREEN 6 — type: "decide" — emoji: 🤔  [INTERACTIVE — NIVEL 3-4: APLICAR + ANALIZAR]  ← PREFERRED
Use "decide" whenever a realistic dilemma can be posed from the material.
Use "process_flow" ONLY if there is a clear sequential process (flow A→B→C→D) in the material AND no good dilemma exists.
Use "challenge" ONLY as last resort if neither works.
- OPTION A — type: "decide":
  - title: "¿Qué harías?" or "¿Cuál elegirías?" (max 8 words)
  - question: a realistic dilemma rooted in the content (max 30 words). Two realistic paths.
    FORMAT ONLY — never copy these subjects; create dilemma from THIS document's content:
    ✅ Física: "Un puente metálico vibra a la misma frecuencia que el viento. ¿Qué solución aplicarías para evitar el colapso?"
    ✅ Biología: "Un ecosistema pierde su depredador principal por caza excesiva. ¿Qué consecuencia es más probable a largo plazo?"
    ⚠️ NEVER copy (puente, ecosistema) — create the dilemma exclusively from THIS document's topic.
  - options: ["A. ...", "B. ...", "C. ...", "D. ..."] — 3 or 4 options, each max 12 words.
    Each option reflects a different but plausible reasoning.
  - correctAnswer: "A", "B", "C", or "D"
  - definition: emotional feedback (see EMOTIONAL FEEDBACK RULE). Max 20 words.
    Must start with 🔥, 🚀, ⚡, or 🎯.
  - example: null
  ❌ FORBIDDEN options: "Todas las anteriores", "Ninguna de las anteriores", "No haría nada"
- OPTION B — type: "process_flow":
  - title: name of the process (max 6 words)
  - definition: "Step1 → Step2 → Step3 → Step4" (max 4 steps, max 5 words each). Each step causes the next.
  - example: real-world instance (max 20 words)
- OPTION C — type: "challenge" (last resort):
  - title: "Reflexiona"
  - definition: brief context that frames the choice (max 20 words). NOT the question itself.
  - question: a simple choice the student must make based on the concept (max 25 words). Example: "¿Qué consecuencia tiene esto en la práctica?"
  - options: exactly 3 options ("A. ...", "B. ...", "C. ..."). One clearly correct, two plausible distractors. Each max 12 words.
  - correctAnswer: "A", "B", or "C"
  - example: emotional feedback after answering. Starts with 🔥, 🚀, ⚡, or 🎯. Max 15 words.

SCREEN 7 — type: "application" — emoji: 🌍  [INTERACTIVE — NIVEL 3: APLICAR]
THIS SCREEN ANSWERS: "¿Dónde se aplica esto en el mundo real?" — and the student must confirm they can apply it.
DOCUMENT-FIRST RULE: identify the most direct, real-world application of the document's main concept.
Use applications that NATURALLY follow from the subject in the transcription:
  Física/Ondas: radio FM, radar meteorológico, ultrasonido médico, ecografía, sonares, instrumentos musicales, fibra óptica, señales WiFi, sísmica
  Física/Electricidad: circuitos domésticos, generadores, motores eléctricos, electroimanes, paneles solares
  Física/Óptica: lentes, microscopios, telescopios, cámaras, láseres, fibra óptica
  Biología/Genética: análisis de ADN forense, pruebas de paternidad, ingeniería genética, diagnóstico médico
  Biología/Célula: medicina, vacunas, nutrición deportiva
  Química: procesos culinarios, combustión de motores, baterías recargables, fabricación de materiales
  Matemáticas: ingeniería civil, arquitectura, estadísticas deportivas, presupuestos, navegación GPS
  Historia: procesos y hechos reales del período estudiado, documentos históricos
  Lenguaje: análisis de noticias reales, publicidad, discursos históricos, textos literarios
❌ NEVER use brand names (Spotify, Netflix, TikTok, Uber, Instagram, Airbnb, Amazon, PedidosYa, Steam) unless they appear explicitly in the transcription.
❌ PROHIBITED: inventing mechanisms or facts not derivable from the transcription.
- title: concrete real-world scenario (max 15 words, question format preferred). Creates context for the question.
  FORMAT ONLY — create from THIS document's concept:
  ✅ "¿Cómo detectan los médicos el corazón de un bebé antes de nacer?" (Física/Ondas)
  ✅ "¿Cómo identifica la medicina forense a una persona con una sola célula?" (Biología/ADN)
  ⚠️ FORMAT ONLY — create from THIS document.
- definition: which concept applies and WHY (max 30 words, plain language, no jargon).
  This is shown BEFORE the question as context.
- question: MANDATORY — a simple situational question the student must answer by applying the concept. Max 20 words.
  Format: "Si [situation], ¿qué ocurrirá?" or "¿Qué concepto explica [real outcome]?"
  FORMAT ONLY — create from THIS document:
  ✅ "Si una cuerda vibra más rápido, ¿qué ocurrirá con el tono producido?" (Física/Ondas)
  ✅ "Si duplicas la concentración de reactivos, ¿qué sucede con la velocidad de reacción?" (Química)
  ⚠️ FORMAT ONLY — write the question about THIS document's concept.
- options: exactly 3 options ("A. ...", "B. ...", "C. ..."). One correct. Two plausible distractors. Max 10 words each.
- correctAnswer: "A", "B", or "C"
- example: post-answer reveal — what actually happens in this real context. Starts with 🌍. Max 20 words.
  Shown to the student AFTER they answer. Connects the correct answer to the real mechanism.

SCREEN 8 — type: "common_error" — emoji: ⚠️  [INTERACTIVE — ERROR DETECTION]
SHOW WHAT TEENAGERS ACTUALLY BELIEVE — not textbook errors.
The student reads the misconception and identifies WHAT is wrong — this is NOT passive reading.
Think: what does a smart 15-year-old who uses TikTok but never studied this assume to be true? That IS the error.
MANDATORY FORMAT — all fields required:
- definition: MUST start with "❌" (max 25 words)
  Format: "❌ Muchos creen que [wrong belief specific to THIS document's topic]."
  FORMAT ONLY — identify the real teen misconception about THIS document's content:
  Física: ❌ "Muchos creen que el sonido viaja más rápido en el vacío que en materiales sólidos."
  Biología: ❌ "Muchos creen que las plantas solo respiran de noche y hacen fotosíntesis de día."
  Química: ❌ "Muchos creen que hervir agua siempre la purifica de todos sus contaminantes."
  ❌ Bad: "Confunden [término A] con [término B]." — too academic, not a real teen belief.
  ⚠️ NEVER copy the subjects above — identify the error from THIS document's content.
- question: MANDATORY — ask the student to identify what is incorrect. Max 15 words.
  Format: "¿Qué tiene de incorrecto esta afirmación?" or "¿Por qué esta creencia está equivocada?"
- options: MANDATORY — exactly 3 options ("A. ...", "B. ...", "C. ..."). Max 12 words each.
  One option correctly identifies the specific flaw in the misconception.
  The other two are plausible but wrong diagnoses.
  ❌ FORBIDDEN options: "Todo está correcto", "Nada está mal", "Es completamente falso".
- correctAnswer: "A", "B", or "C"
- example: MANDATORY — MUST start with "✅" (max 20 words).
  Format: "✅ En realidad, [surprising truth that contradicts the error]."
  Shown AFTER the student answers. Must SURPRISE them.
The error must be specific to THIS topic and believable for a smart teenager.
If no real teen misconception exists → replace with type "comprehension".

SCREEN 9 — type: "wow_fact" — emoji: 🤯
THE SINGLE MOST COUNTERINTUITIVE FACT from this topic.
The student must finish thinking: "No tenía idea de que eso pasaba."
- title: "¿Sabías que...?" — MANDATORY, no alternatives, no exceptions.
- definition: ONE surprising, counterintuitive fact. MAX 30 words. 100% accurate. Related directly to this topic.
  Structure: "Aunque parezca imposible, [counterintuitive fact]. Esto ocurre porque [simple real mechanism]."
  FORMAT ONLY — never copy these subjects; find the counterintuitive fact in THIS document:
  ✅ Física/Ondas: "Las ondas sísmicas permiten estudiar el interior de la Tierra sin excavar nada."
  ✅ Física/Electricidad: "Un rayo puede ser más caliente que la superficie del Sol."
  ✅ Biología: "Tu cuerpo produce anticuerpos incluso antes de que una bacteria entre por primera vez."
  ✅ Química: "El acero es más resistente que el hierro puro, aunque el hierro es su componente principal."
  ⚠️ NEVER copy these subjects — find the counterintuitive fact from THIS document's content.
- example: one sentence grounding this in a teen's everyday life (max 20 words)
- OPTIONAL INTERACTIVE VERIFICATION: include ONLY if you can write a HIGH-QUALITY question about the wow fact:
  - question: tests if the student understood the COUNTERINTUITIVE aspect (max 20 words). NOT a repeat of earlier screens.
  - options: ["A. ...", "B. ...", "C. ..."] — exactly 3 options, each max 10 words
  - correctAnswer: "A", "B", or "C"
  - definition: emotional feedback (see EMOTIONAL FEEDBACK RULE). Must start with 🔥, 🚀, ⚡, or 🎯.
  If the question would be trivial or repeat previous screens → leave question/options/correctAnswer/definition as null.

SCREEN 10 — type: "victory" — emoji: 🏆
- title: "¡Misión cumplida!"
- definition: MANDATORY CHECKLIST FORMAT:
  "Aprendiste: ✓ [Concept 1] • ✓ [Concept 2] • ✓ [Concept 3] • ✓ [Concept 4]"
  Use EXACT concept names from screens 2, 4, 7, 8. MAX 4 concepts.
  FORMAT — use THIS document's concept names, never copy these subjects:
  Física: "Aprendiste: ✓ Qué es una onda • ✓ Frecuencia y amplitud • ✓ Ondas en tecnología • ✓ Error: velocidad ≠ frecuencia"
  Biología: "Aprendiste: ✓ Fotosíntesis • ✓ Rol de la clorofila • ✓ Energía solar en vida • ✓ Error: plantas no respiran"
  ⚠️ NEVER copy (onda, fotosíntesis) — use the actual concepts from THIS session's screens 2, 4, 7, 8.
- example: TWO parts, joined with " | " (max 35 words total):
  Part 1: "Lo usarás cuando [specific teen situation tied to THIS document's topic]."
  Part 2: "Próximo desafío: [specific related topic to study next, connected to THIS document's subject]."
  FORMAT — derive from THIS document's topic, never copy:
  Física: "Lo usarás cuando ajustes el sonido de tus audífonos. | Próximo desafío: Investiga el efecto Doppler y sus usos en medicina."
  Biología: "Lo usarás cuando notes cómo reacciona tu cuerpo al ejercicio. | Próximo desafío: Estudia cómo el cuerpo regula su temperatura."
  ⚠️ NEVER copy (sonido, cuerpo) — the "Lo usarás" and "Próximo desafío" must match THIS document's subject.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES FOR ALL 10 SCREENS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Generate EXACTLY 10 slides in the exact order above. No type may be duplicated.
- Screen 1 title MUST be a curiosity question ending with "?". No exceptions.
- Screens 3 and 5 MUST have complete question + options (not null).
- Screen 8 definition MUST start with "❌". Screen 8 example MUST start with "✅". Screen 8 MUST have question + options + correctAnswer.
- Screen 9 title MUST be "¿Sabías que...?".
- Screen 10 definition MUST use ✓ checklist format.
- NEVER copy text literally from the transcription.
- NEVER create two consecutive non-interactive screens with only definitions — screens 3, 5, 6 enforce interaction.
- NEVER use abstract nodes in causal chains — only visible real-world actions.
- NEVER use brand names (Spotify, Netflix, TikTok, Uber, Instagram, Airbnb, Amazon) unless they appear explicitly in the transcription.
- CONSISTENCY LAW: for every interactive slide (screens 3, 5, 6, 9-wow), the question, the correct answer option, and the feedback definition MUST address the SAME concept. Before finalizing each interactive slide, verify: "Does my feedback explain exactly why the correct answer answers this specific question?" If NO → rewrite the feedback.
- WRONG-ANSWER HINTS (MANDATORY): Every slide that has options MUST include "wrongAnswerHints". Keys = each incorrect option letter (e.g. "B", "C", "D"). Value = EXACTLY 2 sentences, 20–45 words total.
  MANDATORY STRUCTURE — both sentences are required:
    SENTENCE 1 — Name what the student chose and why it seemed reasonable. MUST start with one of:
      • "Elegiste [description of what the wrong option actually describes — its real concept or category]."
      • "Te enfocaste en [what aspect of the wrong option drew the student's attention]."
      • "Esta alternativa describe [the real concept that the wrong option belongs to]."
    SENTENCE 2 — Contrast with what the question was actually asking. MUST start with one of:
      • "La pregunta buscaba [the exact concept or criterion the question required]."
      • "Sin embargo, [correct conceptual distinction that explains why this option doesn't answer the question]."
  QUALITY GATE — before writing each hint, verify ALL four checks pass:
    ✅ Check 1: Does it reference the wrong option's concept (explicitly or implicitly)? If NO → rewrite.
    ✅ Check 2: Does it identify the specific confusion (what the student mixed up)? If NO → rewrite.
    ✅ Check 3: Does it compare wrong concept vs correct concept? If NO → rewrite.
    ✅ Check 4: Would this hint be useless if shown for a DIFFERENT question on a different topic? If NO (= it could apply anywhere) → rewrite.
  FORBIDDEN — reject and rewrite if any of these appear:
    ❌ Defining only the correct answer without mentioning the wrong option
    ❌ "Es posible, pero..." / "Es una X, pero no..." / "No es exactamente..." / "Aunque es correcto..."
    ❌ "A veces..." / "Aunque parece..." / "Identifica qué razonamiento..." / "Puede dañar..." / "No es seguro ni inmediato..."
    ❌ Curious facts, isolated definitions, or motivational messages
    ❌ Repeating the correct answer text verbatim or the question text
  CORRECT examples — question: "¿Cuál situación describe mejor la interacción entre familias y empresas?":
    ✅ "B" (Empresas reciben subsidios del Estado): "Elegiste una relación entre empresas y Estado. La pregunta buscaba una interacción entre familias y empresas mediante compra y venta de bienes."
    ✅ "C" (El Estado cobra impuestos a las familias): "Elegiste una transferencia fiscal que involucra al Estado. La pregunta buscaba un intercambio directo de bienes o servicios entre hogares y empresas privadas."
    ❌ "B": "Los subsidios son transferencias del Estado, no una compra o venta directa." — only defines correct concept, never names what the student chose. FORBIDDEN.
    ❌ "C": "Es posible, pero no es un efecto directo ni seguro." — forbidden pattern.
- DOCUMENT-FIRST LAW: 100% of academic content must be derivable from the transcription. If a concept, example, or application cannot be traced back to the transcription → remove it.
- COVERAGE LAW: if the document has N ≥ 3 distinct concepts, at least ⌈N × 0.8⌉ must appear across slides. A session that uses only 1 of 5 available concepts is INVALID.
- NON-EQUIVALENCE LAW: interactive screens 3, 5, 6, and 9 must each test a DIFFERENT concept from the document. Check: "Is this question testing the same idea as a previous interactive slide?" If YES → rewrite using a different concept.
- NEVER-EMPTY LAW: every slide must have title ≥ 3 words and definition ≥ 10 words. Before finalizing, scan all 10 slides and verify none are empty.
- Reorganize content by PEDAGOGICAL IMPORTANCE, not document order.
- INTERACTIVITY: minimum 6 interactive screens. Screens 3, 5, 6, 7, 8 are MANDATORY interactive. Screen 9 (wow_fact) is optional. After the guided example (screen 2), at least 70% of screens must require a student action (choice, detection, or application).
- PASSIVE SCREENS LIMIT: no more than 2 consecutive non-interactive screens after screen 2.
- CONCEPTUAL BRIDGE: when moving from micro to macro concepts, write an explicit bridge sentence in the relevant screen's definition.
- CORSO ADAPTATION is MANDATORY: complexity, vocabulary, depth must match ${curso}.
- WOW RULE: at least one screen (preferably screen 9) must produce "No tenía idea de que eso pasaba."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL VALIDATION CHECKLIST — run before outputting JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Screen 1 title is a curiosity question ending with "?" → if NO, rewrite.
2. Screens 3 and 5 have complete question + options → if NO, rewrite that screen.
3. Screen 8 definition starts with "❌" and example starts with "✅" → if NO, rewrite.
4. Screen 9 title is exactly "¿Sabías que...?" → if NO, fix.
5. Screen 10 definition uses ✓ checklist format → if NO, rewrite.
6. All interactive screen definitions start with 🔥, 🚀, ⚡, or 🎯 → if NO, fix.
7. No two consecutive non-interactive screens → if violation, swap or add comprehension.
8. At least one screen produces the "No tenía idea de que eso pasaba" reaction → if NO, strengthen screen 9.
9. Screen 7 (application) has question + options + correctAnswer → if NO, rewrite to add them.
9b. Screen 8 (common_error) has question + options + correctAnswer → if NO, rewrite to add them.
10. Complexity matches ${curso} → if too hard for 1° Medio or too easy for 4° Medio, adjust.
11. CONSISTENCY CHECK — for each interactive slide (3, 5, 6, wow_fact): does the feedback definition explain exactly why the correct answer is correct for THIS specific question? → if the feedback talks about a different concept, rewrite the feedback.
12. DOCUMENT-FIRST CHECK — does any slide contain concepts not present in the transcription? → if YES, replace with content from the transcription.
13. Every interactive slide (with options) has wrongAnswerHints with one entry per incorrect option → if NO, add them.
If any check fails → fix that screen before outputting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUIZ QUESTIONS (separate from summary screens):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE GOAL: Every question must make the student THINK. All 4 options must compete — the correct answer is not detectable by elimination, length, or position.
STANDARD: A quality modern school exam (SIMCE/PAES level), NOT a memorization worksheet.

── DIFFICULTY PROGRESSION — PLAN THIS BEFORE WRITING ────────────
The 4 quiz questions MUST follow this exact progression: EASY → MEDIUM → MEDIUM → HARD.
DO NOT generate 4 questions at the same level. DO NOT reorder the progression.

QUESTION 1 — EASY (recognition or basic identification)
  Goal: verify that the student can recognize or identify a basic concept from the material.
  Characteristics: one concept | direct identification | evident for someone who studied.
  Format: present a brief situation and ask which concept, institution, or category applies.
  ✅ Accept: "Una familia decide ahorrar más dinero. ¿Qué rama estudia esta decisión?"
  ✅ Accept: "¿Qué institución fija la tasa de interés en Chile?"
  NOTE: this is the ONLY level where a definition-style question is permitted.

QUESTION 2 — MEDIUM (apply a concept to a real situation — cause/effect)
  Goal: evaluate whether the student connects a concept to a concrete cause-effect situation.
  Characteristics: real context | cause → effect reasoning | cannot answer with a bare definition.
  ✅ Accept: "Si baja la tasa de interés, ¿qué podría ocurrir con el consumo de las familias?"
  ✅ Accept: "Si disminuye la oferta de paltas en la feria, ¿qué ocurrirá probablemente con el precio?"
  ❌ Avoid: "¿Qué es la tasa de interés?" — pure definition, forbidden at this level.

QUESTION 3 — MEDIUM (decision or consequence analysis)
  Goal: apply a concept to a realistic scenario requiring analysis of alternatives.
  Characteristics: realistic scenario | analyze alternatives | cannot depend on pure common sense.
  ✅ Accept: "Una empresa enfrenta mayores costos de producción. ¿Qué decisión es más probable?"
  ✅ Accept: "Una salmonera recibe sanciones ambientales. ¿Qué medida podría ayudar a reducir el problema?"
  ❌ Avoid: "¿Qué estudia la microeconomía?" — definition question, forbidden at this level.

QUESTION 4 — HARD (integrate 2+ concepts from the document)
  Goal: require the student to integrate TWO OR MORE distinct concepts from the transcription.
  Characteristics: multi-concept scenario | inference required | cannot be solved with a single definition.
  MANDATORY: the question must explicitly involve at least 2 different concepts from the document.
  ✅ Accept: "Si muchas familias ahorran más mientras las empresas reducen inversión, ¿qué efecto podría observarse en el crecimiento económico?"
  ✅ Accept: "Si sube la demanda y al mismo tiempo disminuye la oferta, ¿qué ocurrirá probablemente con el precio?"
  ❌ Avoid: single-concept questions at this level.

DIFFICULTY PROGRESSION VALIDATION — check before writing the first question:
  □ Is Q1 easy (recognition/identification, one concept)?
  □ Does Q2 require connecting a concept to a real cause-effect situation (medium)?
  □ Does Q3 require analyzing a realistic scenario with alternatives (medium)?
  □ Does Q4 integrate 2+ concepts from the document and require inference (hard)?
  □ Is the progression genuinely EASY → MEDIUM → MEDIUM → HARD?
If any box is unchecked → adjust before writing.

── CONTEXT VARIETY RULE ──────────────────────────────────────────
Within one session, DO NOT repeat the same scenario or protagonist across the 4 questions.
❌ Avoid using the same actor more than once: palta, salmonera, Banco Central as the only examples.
✅ Use variety: videojuegos, streaming, transporte, comida rápida, celulares, zapatillas, redes sociales, conciertos, turismo, supermercados, emprendimientos juveniles — when appropriate for the course level and content.

── REASONING GATE — APPLY TO QUESTIONS 2, 3, AND 4 ─────────────
Ask: "Can this question be answered by memorizing a definition?"
→ If YES → the question is too simple → REGENERATE.
Ask: "Does answering require applying a concept, inferring a consequence, or making a decision?"
→ If YES → ACCEPT.
NOTE: only Q1 (easy) may allow a definition-type question.

── EXPLANATION QUALITY RULE ──────────────────────────────────────
The "explanation" field must TEACH — explain WHY the correct answer is correct, not just confirm it.
❌ BAD: "Correcto." / "Porque sí." / "Esta es la respuesta correcta."
✅ GOOD: "Correcto. Cuando baja la tasa de interés, pedir créditos es más barato. Eso incentiva el consumo y la inversión, dinamizando la economía."
Format: [confirmation] + [causal mechanism in 1-2 sentences] + [connection to student's world if possible].

── 4-QUESTION FINAL VALIDATION — RUN BEFORE OUTPUTTING JSON ──────
1. Is Q1 easy (recognition/identification, one concept)? → If NO → rewrite Q1.
2. Is Q2 medium (real context, cause-effect, not answerable by definition)? → If NO → rewrite Q2.
3. Is Q3 medium (realistic scenario, decision or consequence, not pure common sense)? → If NO → rewrite Q3.
4. Does Q4 integrate 2+ concepts from the transcription and require inference (hard)? → If NO → rewrite Q4.
5. Do all 4 use different contexts or situations? → If NO → change the repeated one.
6. Are at least 3 of the 4 questions situational? → If NO → rewrite definition-only questions.
7. Does each question from Q2 to Q4 require reasoning beyond recall? → If NO → regenerate.
8. Does complexity match ${curso}? → If NO → adjust language and scenario depth.
If any check fails → rewrite that question before outputting.

── RULE 0: COURSE-LEVEL PROFILE — MANDATORY FIRST STEP ──────────
Before writing ANY question, lock in the cognitive profile for ${curso}.
This profile overrides everything else — quality rules apply WITHIN this level, not above it.

  1º Medio  → simple everyday vocabulary | one concept per question | situations from daily life
              (family, school, neighborhood) | recognition + basic application | NO multi-variable analysis.
  2º Medio  → plain language | basic application | single cause-effect step | familiar Chilean contexts.
  3º Medio  → relational analysis | consequences of actions | two-variable reasoning | slightly technical vocabulary.
  4º Medio  → critical thinking | pre-university depth | comparing two concepts | complex scenarios.
  Universitario / Especialización → specialized vocabulary | advanced critical analysis | multi-source interpretation.

❌ NEVER write university-depth questions for enseñanza media students.
❌ NEVER simplify 3°/4° Medio questions down to pure recognition — they must require reasoning.
All rules below apply WITHIN the profile above. If a rule conflicts with the student's level, the level wins.

── RULE 1: MINI-CASE FORMAT ──────────────────────────────────────
Every question must present an observable situation, then ask for the most probable cause, consequence, or best decision.
❌ WEAK: "¿Qué pasa si baja la tasa de interés?"
✅ STRONG: "El Banco Central reduce la tasa de interés. Meses después aumentan las solicitudes de crédito. ¿Cuál es la explicación más probable?"
Pattern: [OBSERVABLE SITUATION in 1-2 sentences] + [ONE question about cause / consequence / decision / explanation].
Preferred question openings: "¿Cuál es la causa más probable?", "¿Qué efecto es más probable?", "¿Cuál de estas explica mejor X?", "¿Qué decisión es más adecuada?"

── RULE 2: ALL OPTIONS IN THE SAME CONCEPTUAL UNIVERSE ──────────
⚠️ THIS IS THE MOST CRITICAL RULE. Apply it before writing a single option.

FOR EACH DISTRACTOR, answer this test:
"¿Puede un estudiante eliminar esta opción SIN haber comprendido el tema de la pregunta?"
→ If YES → the distractor is in the wrong domain → rewrite it.

❌ CRITICAL FAILURE example — question about oferta y demanda:
  "B. El Banco Central cambió la tasa." / "C. El PIB creció." / "D. El dólar bajó."
  → A student who knows nothing about oferta y demanda immediately eliminates B, C, D. NO reasoning required.

✅ CORRECT example — question about why the price of palta rose:
  "A. Aumentó la demanda."  /  "B. Disminuyó la oferta."
  "C. Subieron los costos de transporte."  /  "D. Hubo menor producción agrícola."
  → All 4 options are plausible price-increase explanations. The student MUST reason to choose.

Rule: if you cannot write 3 plausible same-domain distractors → REFRAME the question until you can.

── RULE 3: PLAUSIBLE DISTRACTORS — THE PARTIAL-UNDERSTANDING TEST ─
For EACH wrong option, verify: "¿Un estudiante que entendió PARCIALMENTE la materia podría elegirla?"
→ If NO → the distractor is too weak → rewrite.

Build distractors from real student errors and partial-truths about THIS specific topic:
  ✅ Correct = "Oferta baja → precio sube" → Distractor = "Demanda baja → precio sube" (confuses direction, same mechanism)
❌ FORBIDDEN: absurd, obviously false, or cross-domain options that any student eliminates immediately.

── RULE 4: NO BINARY QUESTIONS ──────────────────────────────────
A question becomes "binary" when only one option is domain-relevant and the other three can be eliminated by topic alone.
❌ BINARY (bad): "¿Qué ocurre cuando aumenta la demanda?" + [3 unrelated options] + [correct] → answerable by elimination.
✅ ANALYTIC (good): All 4 options describe effects on price → student must reason which one this specific change causes.
REQUIREMENT: At least 2 options must seem genuinely plausible to someone who studied the topic but isn't sure of the answer.

── RULE 5: REQUIRE AT LEAST ONE INFERENCE ───────────────────────
Every question must require reasoning — not just recognition or recall.
Accepted question types (use a variety across the 4 questions):
  ✅ Causa probable | ✅ Consecuencia probable | ✅ Decisión más adecuada
  ✅ Explicación más razonable | ✅ Interpretación de una situación
❌ FORBIDDEN: definitions, isolated concept questions, anything answerable by reading the options without thinking.

── RULE 6: SITUATIONAL GROUNDING AND CHILEAN CONTEXT ────────────
Ground every question in a situation that feels real to the student.
Preferred actors and contexts for ${curso}:
  ✅ Familias, estudiantes, ferias, supermercados, emprendimientos, pymes, transporte, ahorro, consumo
  ✅ If material contains Chilean context: Banco Central, salmoneras, pymes, mercado local
❌ Do NOT force Chilean context where unnatural. Only use it when the material supports it.

── RULE 7: NO VISUAL CUES ────────────────────────────────────────
❌ Correct option must NOT be: the longest | the most detailed | the most technical | always position A.
All 4 options must be similar in length (max ~20% difference).
Distribute correctOptionId: ~25% A, 25% B, 25% C, 25% D across the 4-question set.
Verify position spread before writing the last question.

── RULE 8: DISTRACTORS FROM REAL STUDENT MISCONCEPTIONS ─────────
Each wrong option should reflect a plausible reasoning error students actually make about this topic.
  ✅ Example: correct = "Oferta baja → precio sube" → distractor = "Demanda baja → precio sube" (wrong variable, same logic)
❌ Do NOT invent distractors that have no conceptual basis in this subject.

── RULE 9: QUALITY GATE — RUN FOR EVERY QUESTION BEFORE ACCEPTING ─
Answer all 5 checks. If ANY fails → rewrite before including:
  1. ¿Puede la correcta detectarse por ser la más larga o detallada? → Si SÍ → reescribir opciones.
  2. ¿Puede la correcta detectarse por su posición (A la mayoría)? → Si SÍ → redistribuir.
  3. ¿Pueden eliminarse 2 o más opciones sin comprender el tema? → Si SÍ → reescribir esas opciones.
  4. ¿Al menos 2 opciones parecen genuinamente plausibles? → Si NO → reescribir las débiles.
  5. ¿Responder requiere comprender el contenido (falla test de 2 segundos)? → Si NO → reescribir la pregunta.

── REFERENCE EXAMPLE — anchor all distractor writing to this ─────
❌ BAD — cross-domain distractors, answerable by elimination:
  "Si muchas familias ahorran más, ¿qué pasa?"
  A. Crece menos la economía.   B. Baja el dólar.   C. Baja la palta.   D. Cambia la tasa.
  → A student eliminates B, C, D immediately. No economic knowledge needed.

✅ GOOD — all options are plausible economic effects, student must reason:
  "Durante varios meses las familias chilenas deciden gastar menos y ahorrar más. ¿Cuál es el efecto más probable sobre la economía?"
  A. Menor consumo y menor crecimiento económico.
  B. Mayor inflación por exceso de compras.
  C. Más importaciones por aumento del gasto.
  D. Menor ahorro disponible en los bancos.
  → All 4 are plausible economic effects. Student must understand savings vs. consumption to choose correctly.

── DIFFICULTY ────────────────────────────────────────────────────
difficulty "easy"   = recognize or identify one concept; definition-style questions are allowed here only.
difficulty "medium" = apply a concept to a real situation; requires cause-effect reasoning or decision analysis.
difficulty "hard"   = integrate 2+ concepts from the document; requires multi-step inference.
Use "easy" for Q1, "medium" for Q2 and Q3, "hard" for Q4 — matching the progression above.

── GENERATION ORDER — FOLLOW THIS SEQUENCE FOR EVERY QUESTION ───
Step 1 — Write the question text (scenario + inference request).
Step 2 — Write the CORRECT answer text. Note its approximate word count (N).
Step 3 — Write 3 distractors, each from the SAME conceptual domain, each ≈N words (±20%).
          For each distractor ask: "Can a student eliminate this without knowing the topic?" → If YES → rewrite.
Step 4 — Assign positions A/B/C/D by writing options in a random order — do NOT put the correct answer first.
Step 5 — Set correctOptionId to match whichever position the correct answer landed in.
This order prevents the correct answer from being the first written AND the longest written.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLASHCARDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- front: concise question or concept (max 10 words)
- back: direct, memorable answer (max 25 words)
- Mix "what" cards with "how" and "why" cards. Avoid pure definition repetition.

If the transcription is shorter than 100 words, return a JSON with empty questions and flashcards and a minimal 10-screen summary using the same structure.

Transcription:
${normalizeText(transcription)}
${JSON_SCHEMA}`;
}

// ── Skill-specific algorithms embedded in the procedural prompt ───────────────
// Gives the model the REAL algorithm for each skill so it can teach step-by-step.

const SKILL_ALGORITHMS: Record<string, string> = {
  SKILL_CLASSIFY_DECIMAL: `
ALGORITMO PARA CLASIFICAR DECIMALES:
Paso 1: Realiza la división (si el número es fracción) o analiza las cifras decimales dadas.
Paso 2: Observa si los decimales terminan o continúan indefinidamente.
  → Si terminan → DECIMAL EXACTO (ej: 0,25 = 1/4)
  → Si continúan → DECIMAL PERIÓDICO
Paso 3: Si es periódico:
  → ¿Se repite desde la primera cifra decimal? → PERIÓDICO PURO (ej: 0,333... período: 3)
  → ¿Hay una parte que no se repite antes? → SEMIPERIÓDICO (ej: 0,1666... anteperíodo: 1, período: 6)
TRUCO: en la división larga, cuando aparece el mismo residuo dos veces → empieza el período.`,

  SKILL_ORDER_DECIMALS: `
ALGORITMO PARA ORDENAR DECIMALES:
Paso 1: Escribe todos los decimales alineando la coma vertical.
Paso 2: Agrega ceros a la derecha hasta que todos tengan el mismo número de cifras decimales.
Paso 3: Compara como si fueran números enteros (ignora la coma).
Paso 4: Ordena de menor a mayor o mayor a menor según lo pedido.
EJEMPLO: Ordenar 0,3 — 0,25 — 0,307
→ Con 3 decimales: 0,300 — 0,250 — 0,307
→ Como enteros: 250 < 300 < 307
→ Resultado: 0,25 < 0,3 < 0,307`,

  SKILL_FRACTION_TO_DECIMAL: `
ALGORITMO PARA CONVERTIR FRACCIÓN A DECIMAL (división larga):
Paso 1: Divide el numerador entre el denominador.
Paso 2: Si numerador < denominador → escribe "0," y continúa: multiplica el residuo por 10.
Paso 3: Divide y anota cada cifra decimal en el cociente.
Paso 4: Continúa hasta residuo 0 (exacto) o hasta detectar repetición del residuo.
Paso 5: Si el mismo residuo aparece dos veces → hay período. El número es periódico.
EJEMPLO: 4 ÷ 15
4 ÷ 15 = 0 resto 4 → 40 ÷ 15 = 2 resto 10 → 100 ÷ 15 = 6 resto 10 → residuo 10 se repite
Resultado: 0,2(6) = 0,2666... → semiperiódico (anteperíodo: 2, período: 6)`,

  SKILL_DECIMAL_TO_FRACTION: `
ALGORITMO PARA CONVERTIR DECIMAL PERIÓDICO A FRACCIÓN:
CASO A — PERIÓDICO PURO (ej: 0,666...):
Paso 1: Sea x = 0,666...
Paso 2: Multiplica por 10^n (n = cifras del período): 10x = 6,666...
Paso 3: Resta: 10x − x = 6 → 9x = 6
Paso 4: x = 6/9 → Simplifica: 2/3

CASO B — SEMIPERIÓDICO (ej: 2,1(3) = 2,1333...):
Paso 1: Sea x = 2,1333...
Paso 2: Multiplica por 10 (para sacar anteperíodo): 10x = 21,333...
Paso 3: Multiplica por 100 (para sacar período): 100x = 213,333...
Paso 4: Resta: 100x − 10x = 192 → 90x = 192
Paso 5: x = 192/90 → Simplifica: 32/15`,

  SKILL_OPERATIONS_DECIMALS: `
ALGORITMO PARA OPERAR CON DECIMALES:
SUMA/RESTA: alinea las comas decimales → opera columna por columna → el resultado conserva la coma.
MULTIPLICACIÓN: multiplica ignorando la coma → cuenta total de cifras decimales de los factores → coloca la coma en el resultado.
DIVISIÓN: si el divisor tiene decimales → multiplica ambos por 10/100 para convertirlo en entero → divide normalmente.
EJEMPLO MULTIPLICACIÓN: 0,3 × 0,25 = 075 → 2 decimales + 2 decimales = 4 decimales → 0,0075`,

  SKILL_SIMPLIFY_FRACTIONS: `
ALGORITMO PARA SIMPLIFICAR FRACCIONES:
Paso 1: Encuentra el MCD (Máximo Común Divisor) de numerador y denominador.
  Método: descomposición en factores primos o algoritmo de Euclides.
Paso 2: Divide numerador y denominador por el MCD.
Paso 3: La fracción resultante es irreducible.
EJEMPLO: 12/18 → MCD(12,18) = 6 → 12÷6 / 18÷6 = 2/3`,

  SKILL_OPERATIONS_FRACTIONS: `
ALGORITMO PARA OPERAR CON FRACCIONES:
SUMA/RESTA (mismo denominador): suma/resta numeradores, conserva denominador.
SUMA/RESTA (distinto denominador): calcula el MCM → convierte ambas fracciones → suma/resta numeradores.
MULTIPLICACIÓN: multiplica numeradores entre sí y denominadores entre sí → simplifica.
DIVISIÓN: multiplica por la fracción inversa del divisor → simplifica.`,

  SKILL_FACTORIZATION: `
ALGORITMO PARA FACTORIZAR:
Paso 1: Identifica el tipo:
  → Diferencia de cuadrados: a²−b² = (a+b)(a−b)
  → Cuadrado perfecto: a²±2ab+b² = (a±b)²
  → Trinomio ax²+bx+c: busca dos factores de a·c que sumen b
Paso 2: Aplica la fórmula → escribe los factores.
Paso 3: Verifica multiplicando los factores.`,

  SKILL_EQUATIONS: `
ALGORITMO PARA RESOLVER ECUACIONES:
Paso 1: Agrupa términos con la incógnita en un lado y constantes en el otro (cambio de signo al pasar).
Paso 2: Combina términos semejantes.
Paso 3: Despeja la incógnita dividiendo por su coeficiente.
Paso 4: Verifica sustituyendo el valor en la ecuación original.`,

  SKILL_DERIVATIVES: `
ALGORITMO PARA DERIVAR:
Regla de la potencia: (xⁿ)' = n·xⁿ⁻¹
Derivada de constante: k' = 0
Suma/Resta: derivar término a término.
Producto: (f·g)' = f'·g + f·g'
Cadena: [f(g(x))]' = f'(g(x))·g'(x)
EJEMPLO: f(x) = 3x² + 2x − 5 → f'(x) = 6x + 2`,
};

// ── PROCEDURAL prompt (single-skill, focused micro-mission) ──────────────────
// Each call covers exactly ONE skill. Caller (sessions.ts) handles sequencing across skills.

function buildFocusedProceduralPrompt(
  transcription: string,
  curso: string,
  primarySkill: DetectedSkill,
  _learningPath: DetectedSkill[], // reserved — sequencing is handled by the caller
): string {
  const algorithm = SKILL_ALGORITHMS[primarySkill.skillId] ?? '';
  const skill = primarySkill.skillLabel;

  return `Eres un diseñador de sesiones de aprendizaje PROCEDIMENTAL para estudiantes chilenos de enseñanza media (${curso}).

RETORNA SOLO JSON VÁLIDO. Sin texto extra. Todo en español.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HABILIDAD DE ESTA MISIÓN: "${skill}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA DE ENFOQUE ABSOLUTO: esta misión enseña UNA SOLA habilidad: "${skill}".
PROHIBIDO: introducir ejercicios, preguntas o contenido evaluativo de otras habilidades matemáticas.
Si el documento tiene otras habilidades, serán cubiertas en misiones separadas. NO las incluyas aquí.
Las pantallas 4, 7 y 9 son todas sobre "${skill}" — distintos niveles de dificultad, misma habilidad.

REGLA DE CONTENIDO: TODO el contenido (pasos, números, ejemplos) DEBE derivarse de la transcripción.
No inventes ejercicios que no estén en el documento. Usa los MISMOS tipos de problemas del material.

REGLA MATEMÁTICA: verifica que TODAS las equivalencias, resultados y respuestas sean matemáticamente correctos.
Antes de escribir "A/B = X,Y" o "X,Y = A/B" → verifica la división. Antes de dar respuesta correcta → calcúlala.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALGORITMO PARA "${skill}":
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${algorithm || 'Extrae los pasos del procedimiento directamente desde la transcripción.'}

PREGUNTAS Y FLASHCARDS:
Cubren ÚNICAMENTE la habilidad "${skill}". El estudiante APLICA el procedimiento — no define ni memoriza.
Flashcards: frente = un paso o situación de "${skill}"; reverso = la acción o resultado correcto.
difficulty: "easy" = identificar el método, "medium" = aplicarlo, "hard" = detectar un error en la aplicación.

ESTÁNDAR: evaluación escolar de calidad (SIMCE/PAES). Todas las opciones compiten — la correcta NO es detectable por descarte.

REGLA 0 — PERFIL POR CURSO (PASO OBLIGATORIO ANTES DE ESCRIBIR CUALQUIER PREGUNTA):
Determina el perfil cognitivo de ${curso} y respétalo en todas las preguntas:
  1° Medio → vocabulario simple | un paso a la vez | situaciones cotidianas | sin razonamiento multivariable.
  2° Medio → lenguaje claro | aplicación directa del procedimiento | contextos familiares.
  3° Medio → razonamiento en dos pasos | detección de errores conceptuales | vocabulario algo técnico.
  4° Medio → pensamiento crítico | comparación de métodos | profundidad preuniversitaria.
❌ NUNCA escribir preguntas universitarias para enseñanza media.
❌ NUNCA bajar 3°/4° Medio a reconocimiento básico.
Las reglas de calidad se aplican DENTRO de este perfil. Si hay conflicto, el curso tiene prioridad.

REGLA 1 — MINI CASO: plantea un contexto observable, luego pregunta por causa, resultado o error.
  ❌ "¿Cuál es el resultado de 3/4 como decimal?"
  ✅ "Un alumno divide 3 entre 4 y obtiene 0,75. ¿Qué tipo de decimal es ese resultado y por qué?"

REGLA 2 — MISMO UNIVERSO PROCEDIMENTAL (REGLA MÁS CRÍTICA):
  ⚠️ Para cada distractor, aplicar este test: "¿Puede un estudiante eliminar esta opción sin haber practicado '${skill}'?"
  → Si SÍ → el distractor está fuera de dominio → reescribir.
  Todos los distractores deben ser resultados o pasos plausibles dentro de "${skill}":
    errores de cálculo reales | paso aplicado en orden incorrecto | confusión entre variantes del mismo método.
  ❌ PROHIBIDO: respuestas de otras habilidades matemáticas, resultados sin sentido en el contexto de "${skill}".

REGLA 3 — TEST DEL CONOCIMIENTO PARCIAL: para cada distractor verificar:
  "¿Un estudiante que praticó '${skill}' una vez pero aún no lo domina podría elegirla?"
  → Si NO → el distractor es demasiado débil → reescribir.

REGLA 4 — SIN PREGUNTAS BINARIAS: al menos 2 opciones deben parecer plausibles al estudiante.
  ❌ Una opción correcta + tres imposibles de confundir con "${skill}" = pregunta binaria → reescribir.

REGLA 5 — DISTRIBUCIÓN Y PARIDAD:
  correctOptionId distribuida entre A, B, C y D (≈25% cada una). Verificar antes del último ítem.
  Longitud de opciones similar (diferencia máx. 20%). La correcta NO puede ser sistemáticamente más larga.

REGLA 6 — PUERTA DE CALIDAD (verificar cada pregunta antes de incluir):
  1. ¿La correcta es identificable por ser la más larga? → Si SÍ → reescribir opciones.
  2. ¿La correcta es identificable por posición? → Si SÍ → redistribuir.
  3. ¿Pueden eliminarse opciones sin conocer "${skill}"? → Si SÍ → reescribir esas opciones.
  4. ¿Al menos 2 opciones parecen plausibles a quien estudió pero no domina "${skill}"? → Si NO → reescribir las débiles.
  5. ¿Se requiere aplicar el procedimiento para responder? → Si NO → reescribir la pregunta.
  Si algún check falla → reescribir antes de incluir. Sin excepciones.
  Si alguna respuesta es SÍ/NO desfavorable → reescribir antes de incluir.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANÁLISIS PREVIO (completa mentalmente ANTES de escribir el JSON):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Extrae de la transcripción TODOS los ejercicios de "${skill}" con sus números reales.
2. Asigna niveles: NIVEL 1 (más simple) → NIVEL 3 (más complejo).
3. Pantalla 4 = NIVEL 1 de "${skill}" (valores simples, directamente del documento).
4. Pantalla 7 = NIVEL 2 de "${skill}" con números DISTINTOS a pantalla 4.
5. Pantalla 9 = NIVEL 3 de "${skill}" con números DISTINTOS a pantallas 4 y 7.
6. Los tres problemas usan números distintos y dificultad creciente.

CRITERIO DE NO REPETICIÓN:
❌ Prohibido: pantalla 4 "Ordena 0,4 y 0,45" y pantalla 7 "Ordena 0,45 y 0,4" — mismos números reordenados.
✅ Correcto: pantalla 4 usa valores simples, pantalla 7 usa más cifras, pantalla 9 usa el caso más complejo del material.

CRITERIO NUNCA-VACÍO:
Cada pantalla DEBE tener title con ≥ 3 palabras y definition con ≥ 10 palabras. Sin excepción.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAS 10 PANTALLAS — ESTRUCTURA PEDAGÓGICA FIJA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PANTALLA 1 — type: "mission" — emoji: 🎯  [GANCHO]
- title: pregunta motivadora sobre "${skill}". DEBE terminar en "?". Max 14 palabras.
  Genera curiosidad real: el estudiante debe pensar "nunca supe cómo hacer esto" o "esto me pasa en clase".
- definition: lo que PODRÁN HACER al terminar esta misión. Max 20 palabras. Empieza con "Al terminar...".
- example: área temática en 3-5 palabras (ej: "Matemáticas · 2° Medio").

PANTALLA 2 — type: "process_flow" — emoji: ⚙️  [MÉTODO]
- title: "Método: ${skill}" (o nombre corto del algoritmo)
- definition: algoritmo de "${skill}" paso a paso en formato EXACTO:
  "Paso 1: [verbo + acción concreta] → Paso 2: [verbo + acción concreta] → Paso 3: [verbo + acción concreta] → Paso 4: [verbo + acción concreta]"
  Usa entre 3 y 4 pasos. Máximo 8 palabras por paso. Este texto se convierte en juego de ordenamiento.
  NO uses corchetes: escribe los pasos concretos del algoritmo de "${skill}".
- example: mini-ejemplo de "${skill}" con números reales del documento (max 25 palabras).

PANTALLA 3 — type: "main_concept" — emoji: 📐  [EJEMPLO GUIADO]
- title: "Ejemplo resuelto"
- definition: solución completa de un ejercicio de "${skill}" PASO A PASO con números reales del documento. Formato exacto:
  "Problema: [enunciado con números reales]\\nPaso 1: [acción con esos números]\\nPaso 2: [resultado intermedio]\\nPaso 3: [siguiente acción]\\nResultado: [respuesta final]"
  Usa \\n para separar cada paso. Max 80 palabras. Los pasos DEBEN ser matemáticamente correctos.
- example: "✅ Comprobación: [verificación de por qué la respuesta es correcta, max 15 palabras]"
- connector: null

PANTALLA 4 — type: "comprehension" — emoji: 🧩  [INTERACTIVA — NIVEL 1 de "${skill}"]
Ejercicio NIVEL 1. El más simple. Practica "${skill}" directamente.
- title: "Tu turno"
- question: problema de NIVEL 1 sobre "${skill}" con valores simples del documento. Max 25 palabras. NO uses corchetes.
- options: exactamente 4 opciones (A, B, C, D). Una correcta. Tres errores plausibles de "${skill}": error en paso 1, error en paso 2, error conceptual clásico.
- correctAnswer: "A", "B", "C" o "D" — verifica que sea matemáticamente correcto.
- definition: feedback emocional que explica el error. DEBE empezar con 🎯 o ⚡. Max 20 palabras.

PANTALLA 5 — type: "application" — emoji: 🌍  [APLICACIÓN — "${skill}" en la vida real]
Contexto real donde se usa "${skill}". NO interactiva.
- title: escenario cotidiano donde aplica "${skill}". Max 15 palabras, preferiblemente pregunta.
- definition: por qué esta habilidad importa fuera del aula. Max 40 palabras. Específico y concreto.
- example: conexión con algo que el estudiante puede observar o hacer (max 15 palabras).
- question: null, options: null, correctAnswer: null

PANTALLA 6 — type: "common_error" — emoji: ⚠️  [ENCUENTRA EL ERROR — INTERACTIVA]
El alumno identifica en qué paso de una solución de "${skill}" está el error.
- title: "Encuentra el error"
- definition: solución INCORRECTA de un ejercicio de "${skill}". DEBE empezar con "❌". Max 40 palabras.
  Escribe la solución completa con UN error específico en un paso concreto.
- example: la solución CORRECTA del mismo ejercicio. DEBE empezar con "✅". Max 30 palabras.
- question: "¿En qué paso está el error?" (máx 10 palabras)
- options: exactamente 4 opciones concretas sobre los pasos del método de "${skill}".
  Una es correcta (identifica el paso real con error). Tres son incorrectas.
  La cuarta opción SIEMPRE es: "D. El procedimiento no tiene errores" (esta es SIEMPRE incorrecta).
- correctAnswer: "A", "B", o "C"

PANTALLA 7 — type: "decide" — emoji: 🤔  [INTERACTIVA — NIVEL 2 de "${skill}"]
Ejercicio NIVEL 2. Más complejo que pantalla 4. Practica "${skill}" con números distintos.
- title: "¿Cuál es correcto?"
- question: problema de NIVEL 2 sobre "${skill}" con números DISTINTOS a pantallas 3 y 4. Max 30 palabras. NO uses corchetes.
- options: 4 opciones (A, B, C, D). Una correcta. Tres errores plausibles de "${skill}".
- correctAnswer: "A", "B", "C" o "D" — verifica que sea matemáticamente correcto.
- definition: feedback emocional. DEBE empezar con 🔥, 🚀, ⚡ o 🎯. Max 20 palabras.

PANTALLA 8 — type: "challenge" — emoji: 🧠  [CONFUSIÓN CONCEPTUAL sobre "${skill}"]
Explica la confusión conceptual más frecuente cometida por estudiantes al trabajar "${skill}".
REGLA CRÍTICA: NO repitas la respuesta correcta de pantallas anteriores. NO empieces con "Recuerda:".
ESTRUCTURA OBLIGATORIA:
  1. Describe qué es lo que los estudiantes suelen creer erróneamente (la confusión).
  2. Explica en una frase por qué esa confusión parece razonable.
  3. Muestra en una frase la distinción correcta que la deshace.
- title: elige UNO de: "🤔 ¿Por qué ocurre este error?", "💡 La clave está aquí", "🧠 El error más común"
- definition: 2-3 frases. Entre 30 y 80 palabras. Lenguaje simple y directo.
- question: null, options: null, correctAnswer: null

PANTALLA 9 — type: "final_challenge" — emoji: 🏆  [INTERACTIVA — NIVEL 3 de "${skill}"]
Ejercicio NIVEL 3. El más difícil de esta misión. Usa el caso más complejo del material.
- title: "Desafío final"
- question: problema de NIVEL 3 sobre "${skill}" con números DISTINTOS a pantallas 4 y 7. Max 35 palabras. NO uses corchetes.
- options: 4 opciones (A, B, C, D). Una correcta. Tres distractores con errores en distintos pasos de "${skill}".
- correctAnswer: "A", "B", "C" o "D" — verifica que sea matemáticamente correcto.
- definition: explica el proceso correcto de "${skill}" paso a paso. DEBE empezar con 🏆. Max 25 palabras.

PANTALLA 10 — type: "victory" — emoji: 🏆  [RESULTADO]
- title: "¡Misión completada!"
- definition: "✓ Dominaste: ${skill}. Ahora aplicas este procedimiento con seguridad."
- example: "Úsalo en pruebas y guías del colegio. | Sigue con la próxima misión de tu ruta de aprendizaje."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS ABSOLUTAS — verifica ANTES de outputtar el JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Genera EXACTAMENTE 10 pantallas en el orden indicado (mission→process_flow→main_concept→comprehension→application→common_error→decide→challenge→final_challenge→victory).
2. Pantalla 1 title DEBE terminar en "?".
3. Pantalla 2 definition DEBE ser "Paso 1: X → Paso 2: X → Paso 3: X" con 3-4 pasos.
4. Pantalla 3 definition DEBE usar \\n para separar pasos (Problema → Paso 1 → Paso 2 → Resultado).
5. Pantallas 4, 7 y 9 DEBEN tener question + options + correctAnswer reales (no textos genéricos ni corchetes).
6. Pantalla 6 DEBE tener question + options + correctAnswer (es interactiva). definition empieza con ❌. example empieza con ✅.
7. Pantalla 8 (challenge) NO tiene question/options.
8. Pantalla 10 definition menciona "${skill}" con ✓.
9. NUNCA escribir corchetes como [texto] en question, options, definition. Escribe el contenido real.
10. NUNCA-VACÍO: title ≥ 3 palabras, definition ≥ 10 palabras en TODAS las pantallas.
11. ENFOQUE: pantallas 4, 7 y 9 son todas sobre "${skill}" — distintos niveles, misma habilidad.
12. MATEMÁTICAS: todas las respuestas correctas y equivalencias numéricas son matemáticamente correctas.
13. WRONG-ANSWER HINTS (OBLIGATORIO): Toda pantalla con options DEBE incluir "wrongAnswerHints". Claves = letras de opciones incorrectas. Valor = EXACTAMENTE 2 frases, 20–45 palabras totales.
    ESTRUCTURA OBLIGATORIA — ambas frases son requeridas:
      FRASE 1: Nombra lo que el alumno eligió y por qué parecía razonable. DEBE empezar con una de:
        • "Elegiste [descripción del concepto real que representa la opción incorrecta]."
        • "Te enfocaste en [qué aspecto de la opción incorrecta atrajo al estudiante]."
        • "Esta alternativa describe [el concepto real al que pertenece la opción incorrecta]."
      FRASE 2: Contrasta con lo que la pregunta realmente buscaba. DEBE empezar con una de:
        • "La pregunta buscaba [el concepto o criterio exacto que requería la pregunta]."
        • "Sin embargo, [distinción conceptual correcta que explica por qué esta opción no responde la pregunta]."
    CRITERIO DE CALIDAD — verificar los 4 antes de aceptar:
      ✅ ¿Hace referencia al concepto de la opción incorrecta? Si NO → reescribir.
      ✅ ¿Identifica la confusión específica del alumno? Si NO → reescribir.
      ✅ ¿Compara el concepto equivocado con el correcto? Si NO → reescribir.
      ✅ ¿Esta reflexión sería inútil si se mostrara para una pregunta diferente? Si NO → reescribir.
    PROHIBIDO — rechazar y reescribir si aparecen:
      ❌ Definir solo el concepto correcto sin nombrar la opción incorrecta
      ❌ "Es posible, pero..." / "Es una X, pero no..." / "No es exactamente..." / "Aunque es correcto..."
      ❌ "A veces..." / "Aunque parece..." / "Puede dañar..." / "No es seguro ni inmediato..."
      ❌ Datos curiosos, definiciones aisladas o mensajes motivacionales
      ❌ Repetir textualmente la respuesta correcta o el enunciado de la pregunta

Transcripción:
${normalizeText(transcription)}
${JSON_SCHEMA}`;
}


// ── MEMORIZATION prompt ───────────────────────────────────────────────────────

function buildMemorizationPrompt(transcription: string, curso: string): string {
  return `Eres un diseñador de sesiones de aprendizaje por MEMORIZACIÓN para estudiantes chilenos de enseñanza media (${curso}).
Este documento requiere que el estudiante RECUERDE datos, definiciones, fechas o vocabulario específico.
Tu misión: crear una sesión con técnicas de memoria (asociaciones, imágenes mentales, conexiones) que hagan los datos memorables.

⚠️ REGLA CRÍTICA: TODO el contenido DEBE venir EXCLUSIVAMENTE de la transcripción. No inventes datos.

FILOSOFÍA: DATO → ASOCIACIÓN → RETO → APLICACIÓN → REPASO → CURIOSIDAD → VICTORIA
Cada pantalla debe hacer que el dato se "pegue" en la memoria del estudiante.

RETORNA SOLO JSON VÁLIDO. Sin texto extra. Todo en español.

PREGUNTAS Y FLASHCARDS:
Tipo: RECONOCIMIENTO y ASOCIACIÓN en contexto — el estudiante ubica el dato en una situación, no lo recita.
Flashcards: frente = el dato a memorizar; reverso = la asociación o contexto que lo hace memorable.
difficulty: "easy" = reconocimiento en contexto, "medium" = aplicar en situación nueva, "hard" = distinguir entre conceptos similares.

ESTÁNDAR: evaluación escolar de calidad (SIMCE/PAES). Todas las opciones compiten — la correcta NO es detectable por descarte.

── PROGRESIÓN DE DIFICULTAD — PLANIFICA ANTES DE ESCRIBIR ─────────
Las 4 preguntas del quiz DEBEN seguir esta progresión exacta: FÁCIL → MEDIA → MEDIA → DIFÍCIL.
NO generar 4 preguntas del mismo nivel. NO alterar el orden de la progresión.

PREGUNTA 1 — FÁCIL (reconocimiento o identificación básica)
  Objetivo: verificar que el estudiante puede reconocer o identificar un dato clave del material.
  Características: un solo concepto | identificación directa | evidente para quien estudió el contenido.
  Formato: ubica el dato en una situación y pregunta cuál corresponde.
  ✅ Aceptar: "Una investigadora analiza muestras de 476 d.C. ¿A qué período histórico corresponden?"
  ✅ Aceptar: "¿Cuántos elementos tiene la tabla periódica según el documento?"
  NOTA: este es el ÚNICO nivel donde se permite una pregunta de tipo definición o dato directo.

PREGUNTA 2 — MEDIA (aplicar el dato en una situación real — causa/efecto)
  Objetivo: evaluar si el estudiante conecta el dato con su significado o consecuencia en un contexto real.
  Características: contexto real | razonamiento dato → consecuencia | no responde solo con la definición.
  ✅ Aceptar: "Si un metal pertenece al grupo de los conductores, ¿cuál de estas propiedades presentará?"
  ✅ Aceptar: "Un evento histórico ocurre en 476 d.C. ¿Qué período quedaría clausurado con esa fecha?"
  ❌ Evitar: preguntas de tipo "¿Qué es...?" o "¿Cuál es la definición de...?" en este nivel.

PREGUNTA 3 — MEDIA (decisión o análisis de consecuencias)
  Objetivo: aplicar el dato memorizado en un escenario realista que requiera analizar alternativas.
  Características: escenario realista | análisis de alternativas | no puede depender del sentido común puro.
  ✅ Aceptar: "Un investigador necesita identificar si una sustancia pertenece a este grupo. ¿Qué propiedad verifica primero?"
  ✅ Aceptar: "Un museo recibe artefactos sin datación. ¿Qué dato del documento usaría para ubicarlos temporalmente?"
  ❌ Evitar: preguntas de tipo definición o puro reconocimiento en este nivel.

PREGUNTA 4 — DIFÍCIL (integrar 2 o más conceptos del documento)
  Objetivo: exigir que el estudiante integre DOS O MÁS conceptos distintos del material.
  Características: escenario multi-concepto | inferencia requerida | no se resuelve con una definición aislada.
  OBLIGATORIO: la pregunta debe involucrar explícitamente al menos 2 conceptos distintos del documento.
  ✅ Aceptar: "Si un elemento conduce electricidad y además reacciona con agua, ¿a qué grupo y subgrupo pertenecería según el documento?"
  ✅ Aceptar: "Si dos períodos históricos comparten características pero difieren en fechas límite, ¿qué criterio del documento define cuál es cuál?"
  ❌ Evitar: preguntas de un solo concepto en este nivel.

VALIDACIÓN DE PROGRESIÓN — verificar antes de escribir la primera pregunta:
  □ ¿Q1 está al nivel fácil (reconocimiento/identificación, un concepto)?
  □ ¿Q2 requiere conectar el dato con una situación real (media)?
  □ ¿Q3 requiere analizar un escenario realista con alternativas (media)?
  □ ¿Q4 integra 2 o más conceptos del documento y requiere inferencia (difícil)?
  □ ¿La progresión es genuinamente FÁCIL → MEDIA → MEDIA → DIFÍCIL?
Si algún casillero queda sin marcar → ajustar antes de escribir.

── REGLA DE VARIEDAD DE CONTEXTO ──────────────────────────────────────
En una misma sesión, NO repetir el mismo escenario ni protagonista entre las 4 preguntas.
❌ Evitar: usar el mismo dato o contexto como único ejemplo en más de una pregunta.
✅ Usar variedad: distintas situaciones reales, áreas o contextos donde el dato es relevante.

── PUERTA DE RAZONAMIENTO — APLICAR A PREGUNTAS 2, 3 Y 4 ──────────
¿Puede responderse esta pregunta recitando literalmente una definición del texto?
→ Si SÍ → la pregunta es demasiado simple → REGENERAR.
¿Responder requiere ubicar el dato en contexto, asociarlo con consecuencias o distinguirlo de datos similares?
→ Si SÍ → ACEPTAR.
NOTA: solo Q1 (fácil) puede admitir una pregunta de tipo definición o dato directo.

── REGLA DE CALIDAD DE LA EXPLICACIÓN ──────────────────────────────────
El campo "explanation" debe ENSEÑAR — explicar POR QUÉ la respuesta es correcta, no solo confirmarla.
❌ MAL: "Correcto." / "Porque sí." / "Esta es la respuesta correcta."
✅ BIEN: "Correcto. El período clásico griego corresponde al siglo V a.C., marcado por el apogeo de Atenas y la democracia."
Formato: [confirmación] + [mecanismo o contexto del dato en 1-2 frases] + [conexión con la vida del estudiante si es posible].

── VALIDACIÓN FINAL DE 4 PREGUNTAS — EJECUTAR ANTES DE OUTPUTTAR JSON ──
1. ¿Q1 es fácil (reconocimiento/identificación, un concepto)? → Si NO → reescribir Q1.
2. ¿Q2 es media (contexto real, causa-efecto, no responde con definición)? → Si NO → reescribir Q2.
3. ¿Q3 es media (escenario realista, decisión o consecuencia, no sentido común puro)? → Si NO → reescribir Q3.
4. ¿Q4 integra 2 o más conceptos del documento y requiere inferencia (difícil)? → Si NO → reescribir Q4.
5. ¿Las 4 preguntas usan contextos o situaciones distintas? → Si NO → cambiar la repetida.
6. ¿Al menos 3 de las 4 preguntas son situacionales? → Si NO → reescribir las que solo piden definiciones.
7. ¿Cada pregunta de Q2 a Q4 requiere razonamiento más allá de recitar el dato? → Si NO → regenerar.
8. ¿La complejidad corresponde a ${curso}? → Si NO → ajustar lenguaje y profundidad.
Si algún check falla → reescribir esa pregunta antes de outputtar.

REGLA 0 — PERFIL POR CURSO (PASO OBLIGATORIO ANTES DE ESCRIBIR CUALQUIER PREGUNTA):
Determina el perfil cognitivo de ${curso} y respétalo en todas las preguntas:
  1° Medio → vocabulario simple | datos y situaciones cotidianas | una idea por pregunta | sin comparación compleja.
  2° Medio → lenguaje claro | asociación básica | reconocimiento en contexto simple.
  3° Medio → distinción entre conceptos similares | análisis de contexto | vocabulario algo técnico.
  4° Medio → interpretación crítica | situaciones con múltiples variables | profundidad preuniversitaria.
❌ NUNCA escribir preguntas universitarias para enseñanza media.
❌ NUNCA bajar 3°/4° Medio a memorización literal sin contexto.
Las reglas de calidad se aplican DENTRO de este perfil. Si hay conflicto, el curso tiene prioridad.

REGLA 1 — MINI CASO: ubica el dato en un contexto observable antes de preguntar.
  ❌ "¿Cuántos elementos tiene la tabla periódica?"
  ✅ "Una investigadora necesita un material que conduzca electricidad. ¿Cuál de estos grupos del documento incluye elementos con esa propiedad?"

REGLA 2 — MISMO UNIVERSO CONCEPTUAL (REGLA MÁS CRÍTICA):
  ⚠️ Para cada distractor, aplicar este test: "¿Puede un estudiante eliminar esta opción sin conocer el tema del documento?"
  → Si SÍ → el distractor está fuera de dominio → reescribir.
  Todos los distractores deben ser datos, nombres o conceptos que el estudiante podría razonablemente confundir con la respuesta correcta.
  ❌ PROHIBIDO: opciones de un campo completamente distinto al tema del documento.

REGLA 3 — TEST DEL CONOCIMIENTO PARCIAL: para cada distractor verificar:
  "¿Un estudiante que leyó el material pero aún no lo memorizó bien podría elegirla?"
  → Si NO → el distractor es demasiado obvio → reescribir.

REGLA 4 — SIN PREGUNTAS BINARIAS: al menos 2 opciones deben parecer plausibles al estudiante.
  ❌ Un dato correcto + tres imposibles de confundir con el tema = pregunta binaria → reescribir distractores.

REGLA 5 — DISTRIBUCIÓN Y PARIDAD:
  correctOptionId distribuida entre A, B, C y D (≈25% cada una). Verificar antes del último ítem.
  Longitud de opciones similar (diferencia máx. 20%). La correcta NO puede ser sistemáticamente más larga.

REGLA 6 — PUERTA DE CALIDAD (verificar cada pregunta antes de incluir):
  1. ¿La correcta es identificable por ser la más larga? → Si SÍ → reescribir opciones.
  2. ¿La correcta es identificable por posición? → Si SÍ → redistribuir.
  3. ¿Pueden eliminarse opciones sin conocer el tema? → Si SÍ → reescribir esas opciones.
  4. ¿Al menos 2 opciones parecen plausibles a quien estudió pero aún no domina el tema? → Si NO → reescribir las débiles.
  5. ¿Se requiere reconocer o asociar el dato para responder? → Si NO → reescribir la pregunta.
  Si algún check falla → reescribir antes de incluir. Sin excepciones.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAS 8 PANTALLAS — generar EXACTAMENTE en este orden:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PANTALLA 1 — type: "mission" — emoji: 🎯
EL GANCHO — pregunta que genera curiosidad sobre el dato que aprenderán.
- title: Pregunta curiosa sobre el dato principal. DEBE terminar en "?". Max 14 palabras.
  ✅ "¿Sabes cuántos elementos tiene la tabla periódica y por qué ese número importa?"
  ✅ "¿Por qué los griegos inventaron el nombre que le damos a este concepto hoy?"
  ⚠️ SOLO EJEMPLOS DE FORMATO — crea una pregunta sobre ESTE documento.
- definition: Anticipa el descubrimiento sin revelarlo. Max 20 palabras.
- example: área temática en 3-5 palabras.

PANTALLA 2 — type: "main_concept" — emoji: 💡
EL DATO CLAVE — el dato principal que hay que memorizar.
- title: nombre corto del concepto o dato (max 5 palabras)
- definition: El dato a memorizar, expresado de forma memorable. Max 25 palabras.
  No solo la definición seca — añade UNA característica que lo hace único o sorprendente.
- example: Contexto real donde aparece este dato (max 15 palabras).
- connector: null

PANTALLA 3 — type: "key_relation" — emoji: 🔗
LA ASOCIACIÓN MENTAL — técnica de memoria para recordar el dato.
CRÍTICO: usa el campo connector para mostrar la cadena de asociación.
- connector: "emoji1 [Ancla mental] ↓ recuerda ↓ emoji2 [El dato] ↓ conecta ↓ emoji3 [Aplicación]"
  Cada nodo: emoji + max 4 palabras. La cadena debe ser una HISTORIA que ayuda a recordar.
  ✅ Ejemplo formato (no copiar): "🏛️ Imperio Romano ↓ cayó en ↓ 📅 476 d.C. ↓ marca el fin de ↓ 🌑 Edad Antigua"
  ⚠️ NUNCA copies este ejemplo — crea la asociación desde ESTE documento.
- title: "Truco para recordarlo" (max 5 palabras)
- definition: Explica por qué esta asociación funciona (max 20 palabras).
- example: null

PANTALLA 4 — type: "comprehension" — emoji: 🤔  [INTERACTIVA — RECONOCIMIENTO]
PREGUNTA RÁPIDA — reconocer el dato en contexto.
- title: "¿Lo recuerdas?"
- question: Presenta el dato en una situación y pide identificarlo o completarlo. Max 25 palabras.
  No preguntar la definición literal — preguntar en contexto.
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactamente 4 opciones
- correctAnswer: "A", "B", "C" o "D"
- definition: feedback emocional empezando con 🔥, 🚀, ⚡ o 🎯. Max 20 palabras.

PANTALLA 5 — type: "mini_quiz" — emoji: ⚡  [INTERACTIVA — APLICACIÓN EN CONTEXTO]
MINI RETO — aplicar el dato memorizado en una situación nueva.
- title: "Mini reto"
- question: El estudiante usa el dato para razonar, no solo recordar. Max 25 palabras.
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactamente 4 opciones
- correctAnswer: "A", "B", "C" o "D"
- definition: feedback emocional empezando con 🔥, 🚀, ⚡ o 🎯. Max 20 palabras.

PANTALLA 6 — type: "application" — emoji: 🌍
DÓNDE LO VERÁS — contexto real donde este dato aparece o importa.
- title: Escenario concreto donde se usa este dato (max 15 palabras, preferiblemente pregunta).
- definition: Por qué este dato es relevante fuera del aula. Max 40 palabras.
- example: Conexión con algo que el estudiante puede observar o verificar (max 15 palabras).

PANTALLA 7 — type: "wow_fact" — emoji: 🤯
CURIOSIDAD — el hecho más sorprendente relacionado con este dato.
- title: "¿Sabías que...?" — OBLIGATORIO, sin alternativas.
- definition: Hecho contraintuitivo o sorprendente directamente relacionado al dato principal. Max 30 palabras.
- example: Conexión con la vida del estudiante (max 20 palabras).
- PREGUNTA OPCIONAL: solo si es de alta calidad, incluye question/options/correctAnswer/definition.
  Si la pregunta sería trivial → deja question/options/correctAnswer/definition como null.

PANTALLA 8 — type: "victory" — emoji: 🏆
REPASO FINAL
- title: "¡Datos dominados!"
- definition: FORMATO CHECKLIST:
  "Aprendiste: ✓ [Dato 1] • ✓ [Dato 2] • ✓ [Dato 3]"
  Usa los datos REALES de esta sesión. Max 4 ítems.
- example: "Lo recordarás cuando [situación concreta]. | Próximo desafío: [tema relacionado a estudiar]."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS ABSOLUTAS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Generar EXACTAMENTE 8 pantallas en el orden indicado.
- Pantalla 1 DEBE terminar en "?".
- Pantalla 3 DEBE tener campo connector con formato "↓".
- Pantallas 4 y 5 DEBEN tener question + options completos.
- Pantalla 7 title DEBE ser "¿Sabías que...?".
- Pantalla 8 DEBE usar formato ✓ checklist.
- TODO el contenido académico debe derivarse de la transcripción.

Transcripción:
${normalizeText(transcription)}
${JSON_SCHEMA}`;
}

// ── Empty-slide guard ─────────────────────────────────────────────────────────

const SLIDE_FALLBACKS: Record<string, { title: string; definition: string }> = {
  mission:        { title: '¿Listo para esta misión?', definition: 'Al terminar, podrás aplicar lo aprendido con confianza.' },
  main_concept:   { title: 'Concepto principal', definition: 'Este es el concepto central que debes comprender.' },
  comprehension:  { title: '¿Comprendiste?', definition: '🎯 Reflexiona sobre lo que acabas de ver.' },
  mini_quiz:      { title: 'Quiz rápido', definition: '⚡ Aplica lo que aprendiste.' },
  process_flow:   { title: 'El método', definition: 'Paso 1: Analiza → Paso 2: Aplica → Paso 3: Verifica' },
  key_relation:   { title: 'Relación clave', definition: 'Estos conceptos están directamente conectados.' },
  decide:         { title: '¿Qué harías?', definition: '🔥 Analiza la situación y toma una decisión informada.' },
  application:    { title: '¿Dónde se aplica?', definition: 'Este concepto tiene aplicaciones concretas en la vida real.' },
  common_error:   { title: 'Error frecuente', definition: '❌ Muchos cometen este error.\n✅ La forma correcta es aplicar el método paso a paso.' },
  wow_fact:       { title: '¿Sabías que...?', definition: 'Este tema tiene aspectos que sorprenden a la mayoría.' },
  final_challenge:{ title: 'Desafío final', definition: '🏆 Demuestra tu dominio aplicando todo lo aprendido.' },
  victory:        { title: '¡Misión completada!', definition: 'Aprendiste los conceptos clave de esta sesión.' },
  challenge:      { title: 'Reflexiona', definition: 'Piensa en cómo aplicarías este concepto en una situación real.' },
};

function ensureSlideContent(slide: any, index: number, topic: string): any {
  const hasTitle = typeof slide.title === 'string' && slide.title.trim().length >= 2;
  const hasDef   = typeof slide.definition === 'string' && slide.definition.trim().length >= 5;
  if (hasTitle && hasDef) return slide;

  const fb = SLIDE_FALLBACKS[slide.type] ?? {
    title: `Concepto ${index + 1}`,
    definition: `Contenido relacionado con ${topic}.`,
  };
  console.warn(`[Generation] Slide ${index} (${slide.type}) empty — applying fallback`);
  return {
    ...slide,
    title:      hasTitle ? slide.title      : fb.title,
    definition: hasDef   ? slide.definition : fb.definition,
  };
}

// ── Equivalent-exercise detector ──────────────────────────────────────────────

function extractNumbers(text: string): string[] {
  return (text.match(/\d+[,.]?\d*/g) ?? []).map(n => n.replace(',', '.'));
}

function isEquivalentExercise(a: any, b: any): boolean {
  if (!a?.question || !b?.question) return false;
  const numsA = extractNumbers(a.question).sort().join('|');
  const numsB = extractNumbers(b.question).sort().join('|');
  if (numsA.length > 2 && numsA === numsB) return true;
  if (a.options && b.options) {
    const strip = (opts: string[]) =>
      opts.map((o: string) => o.replace(/^[A-D]\.\s*/, '').trim().toLowerCase()).sort().join('||');
    if (strip(a.options) === strip(b.options)) return true;
  }
  return false;
}

function logEquivalentExercises(slides: any[]): void {
  const interactive = slides
    .map((s, i) => ({ ...s, _idx: i }))
    .filter(s => ['comprehension', 'mini_quiz', 'decide', 'final_challenge', 'common_error'].includes(s.type) && s.question);

  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      if (isEquivalentExercise(interactive[i], interactive[j])) {
        console.warn(`[Generation] ⚠️ Ejercicios equivalentes: slides ${interactive[i]._idx} (${interactive[i].type}) y ${interactive[j]._idx} (${interactive[j].type})`);
      }
    }
  }
}

// ── Interaction diversity validator ──────────────────────────────────────────
// Logs a warning if the mission has fewer than 2 distinct interaction types.
function validateInteractionDiversity(slides: any[]): void {
  const typeMap: Record<string, string> = {
    comprehension: 'multiple_choice',
    mini_quiz: 'multiple_choice',
    decide: 'multiple_choice',
    final_challenge: 'multiple_choice',
    order_sequence: 'sequence',
    common_error: 'find_error',
    challenge: 'reflection',
    wow_fact: 'multiple_choice',
  };
  const usedCategories = new Set(
    slides.filter(s => typeMap[s.type]).map(s => typeMap[s.type])
  );
  if (usedCategories.size < 2) {
    console.warn(`[Generation] ⚠️ Baja diversidad de interacción: solo categorías ${[...usedCategories].join(', ')}`);
  } else {
    console.log(`[Generation] Interaction diversity OK: ${[...usedCategories].join(', ')}`);
  }
  // Check no more than 60% of interactive slides are the same category
  const interactive = slides.filter(s => typeMap[s.type]);
  const cats: Record<string, number> = {};
  for (const s of interactive) {
    const c = typeMap[s.type];
    cats[c] = (cats[c] ?? 0) + 1;
  }
  const total = interactive.length;
  for (const [cat, count] of Object.entries(cats)) {
    if (total > 0 && count / total > 0.6) {
      console.warn(`[Generation] ⚠️ Sobrerepresentación de "${cat}": ${count}/${total} slides interactivos`);
    }
  }
}

// ── Skill-focus validator ─────────────────────────────────────────────────────
// Checks that interactive slides exercise only the primary skill (no cross-skill contamination).
const SKILL_FOCUS_KEYWORDS: Record<string, string[]> = {
  SKILL_CLASSIFY_DECIMAL: ['decimal', 'exacto', 'periódico', 'semiperiódico', 'período', 'cifra', 'clasificar'],
  SKILL_ORDER_DECIMALS:   ['decimal', 'ordenar', 'menor', 'mayor', 'orden', 'coma', 'cifra'],
  SKILL_FRACTION_TO_DECIMAL: ['fracción', 'decimal', 'división', 'dividir', 'numerador', 'denominador', 'cociente'],
  SKILL_DECIMAL_TO_FRACTION: ['decimal', 'fracción', 'periódico', 'período', 'anteperíodo', 'convertir', 'periódica'],
  SKILL_OPERATIONS_DECIMALS: ['decimal', 'sumar', 'restar', 'multiplicar', 'dividir', 'coma', 'operación'],
  SKILL_SIMPLIFY_FRACTIONS:  ['fracción', 'simplificar', 'mcd', 'numerador', 'denominador', 'irreducible', 'factor'],
  SKILL_OPERATIONS_FRACTIONS:['fracción', 'numerador', 'denominador', 'mcm', 'suma', 'multiplicar', 'operar'],
  SKILL_FACTORIZATION:       ['factor', 'factorizar', 'polinomio', 'cuadrado', 'trinomio', 'binomio'],
  SKILL_EQUATIONS:           ['ecuación', 'incógnita', 'despejar', 'resolver', 'variable', 'igualdad'],
  SKILL_DERIVATIVES:         ['derivada', 'función', 'potencia', 'derivar', 'cociente', 'diferencial'],
};

function validateSkillFocus(slides: any[], primarySkill: DetectedSkill): { score: number; issues: string[] } {
  const issues: string[] = [];
  const ownKeywords = SKILL_FOCUS_KEYWORDS[primarySkill.skillId] ?? [];

  // Foreign keywords: terms from OTHER skills not shared with primary
  const foreignKeywords = Object.entries(SKILL_FOCUS_KEYWORDS)
    .filter(([id]) => id !== primarySkill.skillId)
    .flatMap(([, kws]) => kws)
    .filter(kw => !ownKeywords.includes(kw));

  const interactive = slides.filter(s =>
    ['comprehension', 'decide', 'final_challenge', 'common_error'].includes(s.type)
  );

  let contaminated = 0;
  interactive.forEach((s) => {
    const text = [s.question, s.title, s.definition].filter(Boolean).join(' ').toLowerCase();
    const ownHits = ownKeywords.filter(kw => text.includes(kw)).length;
    const foreignHits = foreignKeywords.filter(kw => text.includes(kw)).length;
    if (ownHits === 0 && foreignHits >= 2) {
      contaminated++;
      issues.push(`Slide "${s.type}" parece ejercitar una habilidad diferente a "${primarySkill.skillLabel}"`);
    }
  });

  // Victory slide should name the primary skill
  const victory = slides.find(s => s.type === 'victory');
  if (victory?.definition) {
    const firstWord = primarySkill.skillLabel.toLowerCase().split(' ')[0];
    if (!victory.definition.toLowerCase().includes(firstWord)) {
      issues.push(`Victory slide no menciona la habilidad primaria "${primarySkill.skillLabel}"`);
    }
  }

  const score = interactive.length === 0 ? 100
    : Math.round(((interactive.length - contaminated) / interactive.length) * 100);
  return { score, issues };
}

// ── Math consistency validator ────────────────────────────────────────────────
// Detects incorrect decimal-fraction equivalences and simplifications in slide text.
function validateMathConsistency(slides: any[]): string[] {
  const issues: string[] = [];

  for (const slide of slides) {
    const texts = [slide.definition, slide.question, slide.example, ...(Array.isArray(slide.options) ? slide.options : [])]
      .filter(Boolean).join(' ').replace(/,/g, '.');

    // decimal = A/B  (e.g. "0.25 = 1/4")
    for (const m of texts.matchAll(/(\d+\.\d+)\s*=\s*(\d+)\/(\d+)/g)) {
      const dec = parseFloat(m[1]);
      const num = parseInt(m[2]), den = parseInt(m[3]);
      if (den === 0) continue;
      if (Math.abs(dec - num / den) > 0.005) {
        issues.push(`[${slide.type}] Equivalencia incorrecta: ${m[0].replace(/\./g, ',')} (${num}/${den} = ${(num/den).toFixed(4)})`);
      }
    }

    // A/B = decimal  (e.g. "1/4 = 0.25")
    for (const m of texts.matchAll(/(\d+)\/(\d+)\s*=\s*(\d+\.\d+)/g)) {
      const num = parseInt(m[1]), den = parseInt(m[2]);
      const dec = parseFloat(m[3]);
      if (den === 0) continue;
      if (Math.abs(num / den - dec) > 0.005) {
        issues.push(`[${slide.type}] Equivalencia incorrecta: ${m[0].replace(/\./g, ',')} (${num}/${den} = ${(num/den).toFixed(4)})`);
      }
    }

    // A/B simplificada = C/D  — cross-multiply to verify equality
    for (const m of texts.matchAll(/(\d+)\/(\d+)\s*(?:simplificad[ao]?\s*=|→)\s*(\d+)\/(\d+)/gi)) {
      const [a, b, c, d] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
      if (b === 0 || d === 0) continue;
      if (a * d !== b * c) {
        issues.push(`[${slide.type}] Simplificación incorrecta: ${m[0]} (${a}×${d}=${a*d} ≠ ${b}×${c}=${b*c})`);
      }
    }
  }

  return issues;
}

// ── Template-placeholder detector ────────────────────────────────────────────
// Detects when the AI returned literal instruction brackets or "..." placeholders.
function stripTemplatePlaceholders(slide: any): any {
  const isPlaceholder = (val: unknown): boolean => {
    if (typeof val !== 'string') return false;
    const s = val.trim();
    return /^\[.*\]$/.test(s) || /^\.{2,}$/.test(s) || s === '...' || s === '[...]';
  };
  const optionsHavePlaceholders = Array.isArray(slide.options) &&
    slide.options.some((o: unknown) => isPlaceholder(o) || (typeof o === 'string' && o.replace(/^[A-D]\.\s*/, '').trim() === '...'));

  let s = { ...slide };
  if (isPlaceholder(s.question) || optionsHavePlaceholders) {
    console.warn(`[Generation] Placeholder en campos interactivos de slide ${s.type} — eliminando`);
    s = { ...s, question: null, options: null, correctAnswer: null };
  }
  if (isPlaceholder(s.title)) s = { ...s, title: '' };
  if (isPlaceholder(s.definition)) s = { ...s, definition: '' };
  return s;
}

// ── Shared slide-type validation constants ───────────────────────────────────

const VALID_SLIDE_TYPES: SummarySlideType[] = [
  'mission', 'main_concept', 'comprehension', 'key_relation',
  'mini_quiz', 'process_flow', 'decide', 'application', 'common_error', 'wow_fact', 'victory',
  'challenge', 'final_challenge',
  'concept', 'key_fact', 'important', 'remember', 'example', 'curiosity',
  'did_you_know', 'true_false', 'observe', 'compare', 'partial_summary',
];
const VALID_ILLUSTRATION_TYPES: IllustrationType[] = ['educational', 'diagram', 'concept', 'timeline', 'map', 'process', 'comparison'];
const INTERACTIVE_SLIDE_TYPES = ['comprehension', 'mini_quiz', 'final_challenge', 'decide'];

// Calls OpenAI with the given prompt and builds the parsed GenerationResult (without skill metadata).
async function callOpenAIAndBuildResult(
  prompt: string,
  systemMsg: string,
  configValues: SessionConfig,
  maxTokens = 7000,
): Promise<Omit<GenerationResult, 'pedagogicalType' | 'primarySkill' | 'learningPath'>> {
  const response = await openai.chat.completions.create({
    model: config.openai_model,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: prompt },
    ],
    temperature: 0.25,
    max_tokens: maxTokens,
  });

  const raw = response.choices?.[0]?.message?.content ?? '';
  const resultText = normalizeText(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(resultText);
  } catch {
    const fallback = raw.match(/\{[\s\S]*\}/);
    if (!fallback) throw new Error('No se pudo parsear la respuesta de OpenAI.');
    try {
      parsed = JSON.parse(fallback[0]);
    } catch {
      console.error('[Generation] Raw AI response (first 500 chars):', raw.substring(0, 500));
      throw new Error('Respuesta de OpenAI no es JSON válido.');
    }
  }

  const subject = configValues.subject?.trim() || parsed.subject || 'Tema del material';
  const topic = configValues.topic?.trim() || parsed.topic || 'Resumen del material';

  const questions = (parsed.questions || []).map((question: any, qIdx: number) => {
    // Build options with stable per-question IDs.
    // Strip any "A. " / "B. " letter prefixes the model adds despite the schema —
    // the frontend renders its own position labels.
    const rawOptions = (question.options || []).map((option: any, oIdx: number) => ({
      id: `q${qIdx + 1}-o${oIdx + 1}`,
      text: ((typeof option === 'string' ? option : (option.text ?? '')).replace(/^[A-D]\.\s*/i, '').trim()) || `Opción ${oIdx + 1}`,
    }));

    // Resolve correctOptionId BEFORE shuffle so the reference survives reordering.
    const rawCorrectId = question.correctOptionId ?? question.correctOption ?? '';
    const correctOptionId = resolveCorrectOptionId(rawOptions, String(rawCorrectId));

    // Shuffle to eliminate the AI's systematic position bias.
    const options = shuffleArray(rawOptions);

    return {
      id: question.id || `q-${qIdx + 1}`,
      text: question.text || question.pregunta || `Pregunta ${qIdx + 1}`,
      options,
      correctOptionId,
      explanation: question.explanation || question.explicacion || 'Revisa el material para confirmar la respuesta.',
      sourceQuote: question.sourceQuote || question.cita || '',
      difficulty: question.difficulty || 'medium',
    };
  }) as MultipleChoiceQuestion[];

  const flashcards = (parsed.flashcards || []).map((card: any, index: number) => ({
    id: card.id || `f-${index + 1}`,
    front: card.front || card.pregunta || `Tarjeta ${index + 1}`,
    back: card.back || card.respuesta || '',
    sourceQuote: card.sourceQuote || card.cita || '',
    difficulty: card.difficulty || 'easy',
  })) as Flashcard[];

  const rawSlides = (parsed.summary?.slides || []).map((slide: any, i: number) => {
    const clean = stripTemplatePlaceholders(slide);
    return {
      type: VALID_SLIDE_TYPES.includes(clean.type) ? clean.type : 'concept',
      emoji: clean.emoji || '📚',
      title: clean.title || `Concepto ${i + 1}`,
      definition: clean.definition || clean.content || '',
      example: clean.example || null,
      visualHint: clean.visualHint || undefined,
      illustrationType: VALID_ILLUSTRATION_TYPES.includes(clean.illustrationType) ? clean.illustrationType : undefined,
      connector: clean.connector ?? null,
      question: clean.question ?? null,
      options: Array.isArray(clean.options) && clean.options.length > 0 ? clean.options : null,
      correctAnswer: clean.correctAnswer ?? null,
      wrongAnswerHints: (clean.wrongAnswerHints && typeof clean.wrongAnswerHints === 'object' && !Array.isArray(clean.wrongAnswerHints))
        ? clean.wrongAnswerHints : null,
    };
  });

  const isMissionModel = rawSlides.length > 0 && rawSlides[0].type === 'mission';

  const validatedSlides = rawSlides.map((slide: any, i: number) => {
    if (isMissionModel && INTERACTIVE_SLIDE_TYPES.includes(slide.type)) {
      const hasQuestion = typeof slide.question === 'string' && slide.question.trim().length > 0;
      const hasOptions = Array.isArray(slide.options) && slide.options.length >= 2;
      if (!hasQuestion || !hasOptions) {
        console.warn(`[Generation] Interactive slide ${i} (${slide.type}) missing question/options — converting to challenge`);
        return {
          ...slide,
          type: 'challenge' as SummarySlideType,
          definition: slide.definition?.trim() || slide.title || 'Reflexiona sobre los conceptos aprendidos.',
          question: null,
          options: null,
          correctAnswer: null,
        };
      }
    }
    if (isMissionModel && slide.type === 'wow_fact') {
      const hasQ = typeof slide.question === 'string' && slide.question.trim().length > 0;
      const hasOpts = Array.isArray(slide.options) && slide.options.length >= 2;
      if (hasQ !== hasOpts) {
        return { ...slide, question: null, options: null, correctAnswer: null };
      }
    }
    if (isMissionModel && slide.type === 'wow_fact' && !slide.definition?.trim()) {
      console.warn(`[Generation] wow_fact slide ${i} missing definition — applying fallback`);
      return {
        ...slide,
        definition: `Un hecho sorprendente sobre ${topic}: los conceptos de esta sesión tienen efectos que van más allá de lo que parece a primera vista.`,
      };
    }
    if (isMissionModel && slide.type === 'victory' && !slide.definition?.trim()) {
      console.warn(`[Generation] victory slide ${i} missing definition — applying fallback`);
      return {
        ...slide,
        definition: `Aprendiste los conceptos clave de esta sesión sobre ${topic}.`,
        example: slide.example || `Lo usarás cuando notes cómo estos conceptos afectan tu vida diaria. | Próximo desafío: Profundiza en los temas relacionados.`,
      };
    }
    return slide;
  });

  // ── Post-gen guards ────────────────────────────────────────────────────────
  const guardedSlides = validatedSlides.map((slide: any, i: number) =>
    ensureSlideContent(slide, i, topic)
  );
  if (isMissionModel) {
    logEquivalentExercises(guardedSlides);
    validateInteractionDiversity(guardedSlides);
  }

  const summary: Summary = {
    id: parsed.summary?.id || 'summary-1',
    title: parsed.summary?.title || `Resumen de ${topic}`,
    slides: guardedSlides,
    sourceQuotes: parsed.summary?.sourceQuotes || parsed.summary?.citas || [],
  };

  const sourceQuoteCount = [
    ...questions.map((q) => q.sourceQuote),
    ...flashcards.map((f) => f.sourceQuote),
    ...summary.sourceQuotes,
  ].filter(Boolean).length;

  const groundingScore = sourceQuoteCount > 0 ? 1 : 0;
  return { subject, topic, questions, flashcards, summary, groundingScore };
}

// ── Main generation function ──────────────────────────────────────────────────

export async function generateSessionContent(
  transcription: string,
  configValues: SessionConfig,
  curso: string = '1º Medio'
): Promise<GenerationResult> {
  console.log('[Generation] Curso utilizado para generar sesión:', curso);

  // Classify content type before selecting prompt
  const classification = classifyContent(transcription);
  console.log(`[Generation] Tipo pedagógico: ${classification.type} (confianza: ${(classification.confidence * 100).toFixed(0)}%)`);
  console.log(`[Generation] Scores — conceptual: ${(classification.scores.conceptual * 100).toFixed(0)}%, procedimental: ${(classification.scores.procedural * 100).toFixed(0)}%, memorización: ${(classification.scores.memorization * 100).toFixed(0)}%`);
  const primarySkill = classification.detectedSkills[0];
  const learningPath = classification.detectedSkills;

  if (learningPath.length > 0) {
    console.log(`[Generation] Habilidades detectadas (${learningPath.length}): ${learningPath.map(s => `${s.skillId}(${(s.confidence * 100).toFixed(0)}%)`).join(', ')}`);
    console.log(`[Generation] Habilidad primaria: ${primarySkill?.skillLabel ?? 'ninguna'}`);
    if (learningPath.length > 1) {
      console.log(`[Generation] Ruta de aprendizaje: ${learningPath.slice(1).map(s => s.skillLabel).join(' -> ')}`);
    }
  }

  let prompt: string;
  let systemMsg: string;

  if (classification.type === 'PROCEDURAL' && primarySkill) {
    prompt = buildFocusedProceduralPrompt(transcription, curso, primarySkill, learningPath);
    systemMsg = `Eres un diseñador de sesiones de aprendizaje procedimental para estudiantes chilenos de enseñanza media. Esta misión enseña UNA SOLA habilidad. Tu filosofía: GANCHO → MÉTODO PASO A PASO → EJEMPLO RESUELTO → PRÁCTICA → ERROR COMÚN → DESAFÍO → VICTORIA. Cada pantalla construye competencia para resolver ejercicios de la habilidad específica. NO mezcles habilidades distintas. Genera exactamente 7 pantallas en el orden indicado. JSON válido únicamente. Todo en español.`;
  } else if (classification.type === 'MEMORIZATION') {
    prompt = buildMemorizationPrompt(transcription, curso);
    systemMsg = `Eres un diseñador de sesiones de aprendizaje por memorización para estudiantes chilenos de enseñanza media. Tu filosofía: DATO → ASOCIACIÓN → RETO → REPASO → CURIOSIDAD → VICTORIA. Cada pantalla usa técnicas de memoria para que los datos sean inolvidables. Genera exactamente 8 pantallas en el orden indicado. JSON válido únicamente. Todo en español.`;
  } else {
    // CONCEPTUAL and MIXED → current discovery-mission structure
    prompt = buildConceptualPrompt(transcription, curso);
    systemMsg = `Eres un diseñador de experiencias de aprendizaje gamificadas para jóvenes chilenos de enseñanza media. Tu filosofía: HOOK → DESCUBRIMIENTO → RETO → APLICACIÓN → ERROR → CURIOSIDAD → VICTORIA. Cada pantalla debe hacer que el estudiante quiera ver la siguiente. NO resúmenes escolares — misiones interactivas con progresión de dificultad. Genera exactamente 10 pantallas en el orden indicado. JSON válido únicamente. Todo en español.`;
  }

  const base = await callOpenAIAndBuildResult(prompt, systemMsg, configValues);
  return { ...base, pedagogicalType: classification.type, primarySkill, learningPath };
}

// Generates ONE focused skill mission without re-classifying (classification done by caller).
// Each call covers a single skill; the caller (sessions.ts) sequences multiple missions.
export async function generateSkillMission(
  transcription: string,
  sessionConfig: SessionConfig,
  curso: string,
  primarySkill: DetectedSkill,
  learningPath: DetectedSkill[],
): Promise<GenerationResult> {
  const prompt = buildFocusedProceduralPrompt(transcription, curso, primarySkill, learningPath);
  const systemMsg = `Eres un diseñador de sesiones de aprendizaje procedimental para estudiantes chilenos de enseñanza media. Esta misión enseña UNA SOLA habilidad: "${primarySkill.skillLabel}". PROHIBIDO incluir ejercicios evaluativos de otras habilidades. Estructura FIJA: GANCHO → MÉTODO → EJEMPLO GUIADO → COMPRENSIÓN → APLICACIÓN → ENCUENTRA EL ERROR → DESAFÍO → REFLEXIÓN → EVALUACIÓN FINAL → VICTORIA. Genera exactamente 10 pantallas en ese orden. Pantalla 6 (common_error) es INTERACTIVA: incluye question + options + correctAnswer. Verifica que todas las equivalencias matemáticas sean correctas. Nunca escribas corchetes como [instrucción] — escribe el contenido real. JSON válido únicamente. Todo en español.`;
  const base = await callOpenAIAndBuildResult(prompt, systemMsg, sessionConfig, 8000);

  // Validate skill focus
  const slides = base.summary?.slides ?? [];
  const focusResult = validateSkillFocus(slides, primarySkill);
  if (focusResult.score < 90) {
    console.warn(`[Generation] ⚠️ SkillFocusScore: ${focusResult.score}/100 para "${primarySkill.skillLabel}"`);
    focusResult.issues.forEach(i => console.warn(`[Generation]   • ${i}`));
  } else {
    console.log(`[Generation] SkillFocusScore: ${focusResult.score}/100 ✓ "${primarySkill.skillLabel}"`);
  }

  // Validate math consistency
  const mathIssues = validateMathConsistency(slides);
  if (mathIssues.length > 0) {
    console.warn(`[Generation] ⚠️ ${mathIssues.length} problema(s) de consistencia matemática:`);
    mathIssues.forEach(i => console.warn(`[Generation]   • ${i}`));
  } else {
    console.log(`[Generation] Consistencia matemática OK ✓`);
  }

  return { ...base, pedagogicalType: 'PROCEDURAL', primarySkill, learningPath };
}

// ── Semantic grounding check ──────────────────────────────────────────────────

const SPANISH_STOP_WORDS = new Set([
  'para', 'como', 'pero', 'que', 'una', 'uno', 'unos', 'unas', 'los', 'las', 'del',
  'con', 'por', 'mas', 'cuando', 'este', 'esta', 'estos', 'estas', 'ser', 'son',
  'puede', 'hace', 'tiene', 'hay', 'sus', 'entre', 'tambien', 'sobre', 'desde',
  'hacia', 'despues', 'porque', 'donde', 'mientras', 'cada', 'toda', 'todo',
  'todos', 'como', 'cual', 'cuales', 'cuando', 'cuanto', 'ellos', 'ella',
  'ellas', 'mismo', 'misma', 'otro', 'otra', 'otros', 'otras', 'muy', 'bien',
  'aqui', 'alli', 'ahi', 'entonces', 'aunque', 'sino', 'incluso', 'solo', 'sola',
  'ahora', 'antes', 'siempre', 'nunca', 'ademas', 'tampoco', 'tanto', 'tanta',
  'alguna', 'algunas', 'ningun', 'ninguna', 'varios', 'varias', 'cualquier',
  'debe', 'hacer', 'hecho', 'algo', 'nada', 'parte', 'tipo', 'forma', 'manera',
  'caso', 'nivel', 'tipo', 'punto', 'tanto', 'tener', 'pueden', 'deben', 'estos',
]);

function extractDocKeywords(text: string, topN = 40): string[] {
  const freq: Record<string, number> = {};
  text
    .toLowerCase()
    .replace(/[¿¡!?.,:;()[\]{}""''«»\-–—\r\n]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !SPANISH_STOP_WORDS.has(w) && /^[a-záéíóúñü]+$/.test(w))
    .forEach(w => { freq[w] = (freq[w] ?? 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w);
}

function getSlideAllText(slide: SummarySlide): string {
  const s = slide as any;
  return [s.title, s.definition, s.example, s.question, ...(Array.isArray(s.options) ? s.options : [])]
    .filter(Boolean)
    .join(' ');
}

export interface SlideGroundingScore {
  slideIndex: number;
  slideType: string;
  overlap: number;
  slideKeywords: string[];
  contaminated: boolean;
}

export interface SemanticGroundingResult {
  docKeywords: string[];
  slideScores: SlideGroundingScore[];
  overallOverlap: number;
  contaminated: boolean;
  contaminatedSlides: number[];
}

const SKIP_GROUNDING_TYPES = new Set(['mission', 'victory']);

export function checkSemanticGrounding(
  transcription: string,
  slides: SummarySlide[],
): SemanticGroundingResult {
  const docKeywords = extractDocKeywords(transcription, 40);

  // If the document is too keyword-sparse (math, numbers-heavy, very short text),
  // there is not enough vocabulary to determine contamination — skip the check.
  if (docKeywords.length < 8) {
    return {
      docKeywords,
      slideScores: slides.map((slide, i) => ({
        slideIndex: i, slideType: slide.type, overlap: 1, slideKeywords: [], contaminated: false,
      })),
      overallOverlap: 1,
      contaminated: false,
      contaminatedSlides: [],
    };
  }

  const docSet = new Set(docKeywords);

  const slideScores: SlideGroundingScore[] = slides.map((slide, i) => {
    if (SKIP_GROUNDING_TYPES.has(slide.type)) {
      return { slideIndex: i, slideType: slide.type, overlap: 1, slideKeywords: [], contaminated: false };
    }

    const text = getSlideAllText(slide)
      .toLowerCase()
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}❌✅✓•↓🔥🚀⚡🎯]/gu, ' ')
      .replace(/[¿¡!?.,:;()[\]{}""''«»\-–—]/g, ' ');

    const words = text
      .split(/\s+/)
      .filter(w => w.length >= 4 && !SPANISH_STOP_WORDS.has(w) && /^[a-záéíóúñü]+$/.test(w));

    const unique = [...new Set(words)];

    if (unique.length < 4) {
      return { slideIndex: i, slideType: slide.type, overlap: 1, slideKeywords: unique, contaminated: false };
    }

    // Soft match: prefix comparison (handles inflection like onda/ondas, frecuencia/frecuencias)
    const matched = unique.filter(sw =>
      docSet.has(sw) || docKeywords.some(dk => {
        const minLen = Math.min(sw.length, dk.length, 6);
        return sw.slice(0, minLen) === dk.slice(0, minLen);
      })
    );

    const overlap = matched.length / unique.length;
    const contaminated = overlap < 0.15 && unique.length >= 5;

    return { slideIndex: i, slideType: slide.type, overlap, slideKeywords: unique.slice(0, 12), contaminated };
  });

  const scored = slideScores.filter(s => !SKIP_GROUNDING_TYPES.has(s.slideType));
  const overallOverlap = scored.length > 0
    ? scored.reduce((sum, s) => sum + s.overlap, 0) / scored.length
    : 1;

  const contaminatedSlides = slideScores.filter(s => s.contaminated).map(s => s.slideIndex);
  const contaminated = contaminatedSlides.length >= 3;

  return { docKeywords, slideScores, overallOverlap, contaminated, contaminatedSlides };
}

// ── Question consistency validator ───────────────────────────────────────────

export interface QuestionConsistencyResult {
  slideIndex: number;
  slideType: string;
  consistent: boolean;
  questionKeywords: string[];
  feedbackKeywords: string[];
  overlap: number;
  issue?: string;
}

export interface QuestionConsistencyReport {
  allConsistent: boolean;
  results: QuestionConsistencyResult[];
  inconsistentSlides: number[];
}

const INTERACTIVE_CHECK_TYPES = new Set(['comprehension', 'mini_quiz', 'decide', 'wow_fact']);

export function validateQuestionConsistency(slides: SummarySlide[]): QuestionConsistencyReport {
  const results: QuestionConsistencyResult[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i] as any;
    if (!INTERACTIVE_CHECK_TYPES.has(slide.type)) continue;

    const question: string = typeof slide.question === 'string' ? slide.question : '';
    const rawFeedback: string = typeof slide.definition === 'string' ? slide.definition : '';

    if (!question.trim() || !rawFeedback.trim()) continue;

    // Strip emoji prefix from feedback before keyword extraction
    const feedback = rawFeedback.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}🔥🚀⚡🎯]\s*\w+\s*—\s*/u, '');

    const questionWords = extractDocKeywords(question, 15);
    const feedbackWords = extractDocKeywords(feedback, 15);

    if (questionWords.length < 2 || feedbackWords.length < 2) {
      results.push({ slideIndex: i, slideType: slide.type, consistent: true, questionKeywords: questionWords, feedbackKeywords: feedbackWords, overlap: 1 });
      continue;
    }

    const qSet = new Set(questionWords);
    const matched = feedbackWords.filter(fw =>
      qSet.has(fw) || questionWords.some(qw => {
        const minLen = Math.min(fw.length, qw.length, 5);
        return fw.slice(0, minLen) === qw.slice(0, minLen);
      })
    );

    const overlap = matched.length / feedbackWords.length;
    const consistent = overlap >= 0.10 || feedbackWords.length < 3;

    results.push({
      slideIndex: i,
      slideType: slide.type,
      consistent,
      questionKeywords: questionWords.slice(0, 8),
      feedbackKeywords: feedbackWords.slice(0, 8),
      overlap,
      issue: !consistent
        ? `Feedback comparte solo ${(overlap * 100).toFixed(0)}% de keywords con la pregunta`
        : undefined,
    });
  }

  const inconsistentSlides = results.filter(r => !r.consistent).map(r => r.slideIndex);
  return { allConsistent: inconsistentSlides.length === 0, results, inconsistentSlides };
}

// ── Engagement validator ─────────────────────────────────────────────────────

export interface EngagementReport {
  valid: boolean;
  interactionCount: number;
  maxConsecutiveNonInteractive: number;
  hasHook: boolean;
  hasRealApplication: boolean;
  hasCommonError: boolean;
  hasWowFact: boolean;
  hasDifficultyProgression: boolean;
  issues: string[];
}

const REAL_BRAND_PATTERNS = [
  'spotify', 'netflix', 'uber', 'playstation', 'iphone', 'tiktok', 'steam',
  'samsung', 'mercado libre', 'pedidosya', 'zapatilla', 'concierto', 'videojuego',
  'android', 'ipad', 'youtube', 'twitch', 'amazon',
];

const INTERACTIVE_TYPES = new Set([
  'comprehension', 'mini_quiz', 'decide', 'final_challenge', 'order_sequence',
]);

/**
 * Validates that a generated session meets minimum engagement standards.
 * Logs warnings when standards are not met — does NOT block session delivery.
 */
export function validateSessionEngagement(
  slides: SummarySlide[],
  _questions: MultipleChoiceQuestion[],
): EngagementReport {
  const issues: string[] = [];

  // ── Interaction count & consecutive non-interactive ───────────────────────
  let interactionCount = 0;
  let maxConsec = 0;
  let consec = 0;

  for (const slide of slides) {
    const slideAny = slide as any;
    const isInteractive =
      INTERACTIVE_TYPES.has(slide.type) && typeof slideAny.question === 'string' && slideAny.question.trim().length > 0;
    const isWowInteractive =
      slide.type === 'wow_fact' && typeof slideAny.question === 'string' && slideAny.question.trim().length > 0;

    if (isInteractive || isWowInteractive) {
      interactionCount++;
      consec = 0;
    } else if (slide.type !== 'mission' && slide.type !== 'victory') {
      consec++;
      maxConsec = Math.max(maxConsec, consec);
    }
  }

  if (interactionCount < 3) {
    issues.push(`Solo ${interactionCount} interacciones (mínimo 3)`);
  }
  if (maxConsec > 2) {
    issues.push(`${maxConsec} pantallas informativas consecutivas (máximo 2)`);
  }

  // ── Hook in screen 1 ──────────────────────────────────────────────────────
  const missionSlide = slides.find(s => s.type === 'mission') as any;
  const hasHook = !!(
    missionSlide?.title?.trim().endsWith('?') ||
    missionSlide?.definition?.includes('?')
  );
  if (!hasHook) issues.push('Screen 1 sin pregunta de curiosidad (hook)');

  // ── Real application (screen 7) ───────────────────────────────────────────
  const appSlide = slides.find(s => s.type === 'application') as any;
  const appText = `${appSlide?.title ?? ''} ${appSlide?.definition ?? ''} ${appSlide?.example ?? ''}`.toLowerCase();
  const hasRealApplication = !appSlide || REAL_BRAND_PATTERNS.some(b => appText.includes(b));
  if (!hasRealApplication) issues.push('Aplicación real sin marca/plataforma específica (screen 7)');

  // ── Common error ❌ format ─────────────────────────────────────────────────
  const errorSlide = slides.find(s => s.type === 'common_error') as any;
  const hasCommonError = !errorSlide || !!(
    errorSlide.definition?.startsWith('❌') ||
    errorSlide.definition?.toLowerCase().includes('muchos creen')
  );
  if (!hasCommonError) issues.push('Error común sin formato ❌ (screen 8)');

  // ── Wow fact present ──────────────────────────────────────────────────────
  const wowSlide = slides.find(s => s.type === 'wow_fact') as any;
  const hasWowFact = !!(wowSlide?.definition?.trim());
  if (!hasWowFact) issues.push('Sin dato sorprendente (wow_fact, screen 9)');

  // ── Difficulty progression (screens 3 → 5 → 6 present) ───────────────────
  const hasComprehension = slides.some(s => s.type === 'comprehension');
  const hasMiniQuiz = slides.some(s => s.type === 'mini_quiz');
  const hasDifficultyProgression = hasComprehension && hasMiniQuiz;
  if (!hasDifficultyProgression) issues.push('Sin progresión de dificultad (faltan comprehension + mini_quiz)');

  const valid = issues.length === 0;
  return {
    valid,
    interactionCount,
    maxConsecutiveNonInteractive: maxConsec,
    hasHook,
    hasRealApplication,
    hasCommonError,
    hasWowFact,
    hasDifficultyProgression,
    issues,
  };
}

// ── Grounding validator ───────────────────────────────────────────────────────

export interface GroundingValidationResult {
  validated: boolean;
  score: number;
  missingQuotes: string[];
}

export function validateGrounding(
  result: GenerationResult,
  transcription: string
): GroundingValidationResult {
  const normalized = normalizeText(transcription).toLowerCase();
  const allQuotes = [
    ...result.questions.map((q) => q.sourceQuote),
    ...result.flashcards.map((f) => f.sourceQuote),
    ...result.summary.sourceQuotes,
  ].filter(Boolean);

  if (allQuotes.length === 0) {
    return { validated: true, score: 1, missingQuotes: [] };
  }

  const matchedCount = allQuotes.reduce((count, quote) => {
    const normalizedQuote = normalizeText(quote).toLowerCase();
    if (normalized.includes(normalizedQuote)) return count + 1;
    const words = normalizedQuote.split(/\s+/).filter((w) => w.length > 3);
    const matchedWords = words.filter((w) => normalized.includes(w)).length;
    return matchedWords / Math.max(words.length, 1) >= 0.7 ? count + 1 : count;
  }, 0);

  const score = matchedCount / allQuotes.length;
  const missingQuotes = allQuotes.filter((quote) => {
    const normalizedQuote = normalizeText(quote).toLowerCase();
    if (normalized.includes(normalizedQuote)) return false;
    const words = normalizedQuote.split(/\s+/).filter((w) => w.length > 3);
    const matchedWords = words.filter((w) => normalized.includes(w)).length;
    return matchedWords / Math.max(words.length, 1) < 0.7;
  });

  return { validated: score >= 0.5, score, missingQuotes };
}

// ── Session builder ───────────────────────────────────────────────────────────

export function buildGeneratedSession(
  userId: string,
  documentId: string,
  transcription: string,
  wordCount: number,
  configValues: SessionConfig,
  generation: GenerationResult
): GeneratedSession {
  const xpReward = Math.max(50, Math.min(200, Math.round(wordCount / 5)));
  const baseXpReward = Math.round(xpReward * 0.2);
  const gemReward = Math.max(5, Math.min(40, Math.round(xpReward / 6)));

  return {
    id: `${documentId}-${Date.now()}`,
    userId,
    documentId,
    subject: generation.subject,
    topic: generation.topic,
    wordCount,
    difficulty: configValues.difficulty,
    format: configValues.format,
    estimatedDuration: configValues.estimatedDuration,
    transcription,
    questions: generation.questions,
    flashcards: generation.flashcards,
    summary: generation.summary,
    metadata: {
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      groundingValidated: generation.groundingScore >= 0.5,
      groundingScore: generation.groundingScore,
      pedagogicalType: generation.pedagogicalType,
      primarySkillId: generation.primarySkill?.skillId,
      primarySkillLabel: generation.primarySkill?.skillLabel,
      learningPath: generation.learningPath?.slice(1).map(s => ({ skillId: s.skillId, skillLabel: s.skillLabel, priority: s.priority })),
    },
    xpReward,
    baseXpReward,
    gemReward,
  };
}
