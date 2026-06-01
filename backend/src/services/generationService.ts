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
        "correctAnswer": string | null
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
1. What 2-3 concepts MUST the student grasp to pass the exam?
2. What is the causal chain? (A causes B causes C — not just "A relates to B")
3. What would a smart 15-year-old who only uses TikTok WRONGLY believe about this topic?
4. Which real teen situation (Spotify, zapatillas, celular, bencina, videojuego) makes this LAND?
5. What is the single most counterintuitive fact? → this becomes screen 9 (wow_fact).
6. Which concept can be turned into a genuine dilemma? → this becomes screen 6 (decide).
7. Are any two concepts nearly identical? If YES → only include the more interesting one.
NO-REPETITION LAW: Each of the 10 screens must teach something DIFFERENT. Before writing each screen ask: "Did I already show this idea?" If YES → use a different concept.

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
  - definition: open-ended "what if" question that requires applying concepts (max 30 words)
  - question, options, correctAnswer: all null

SCREEN 7 — type: "application" — emoji: 🌍
THIS SCREEN ANSWERS: "¿Dónde se aplica esto en el mundo real?"
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
❌ PROHIBITED: "una empresa", "un consumidor" without a specific educational context.
❌ PROHIBITED: inventing mechanisms or facts not derivable from the transcription.
- title: a concrete real-world scenario that demonstrates the concept (max 15 words, preferably a question)
  FORMAT ONLY — create from THIS document's subject, never copy these:
  ✅ Física/Ondas: "¿Cómo detectan los médicos el corazón de un bebé antes de nacer con ultrasonido?"
  ✅ Física/Electricidad: "¿Por qué los cables de alta tensión transportan electricidad a miles de voltios?"
  ✅ Biología/ADN: "¿Cómo identifica la medicina forense a una persona con una sola célula encontrada?"
  ✅ Matemáticas: "¿Cómo usan los ingenieros las derivadas para diseñar puentes que no colapsen?"
  ⚠️ FORMAT ONLY — create the application scenario from THIS document's specific concept.
- definition: which concept applies and WHY, plain language, no jargon (max 40 words, 2 sentences)
  ACCURACY RULE: technically correct. The mechanism must be derivable from the transcription content.
  ❌ FORBIDDEN: "La tecnología usa este concepto para mejorar la experiencia." — too vague.
- example: connects this to something the student can observe or verify (max 15 words)

SCREEN 8 — type: "common_error" — emoji: ⚠️
SHOW WHAT TEENAGERS ACTUALLY BELIEVE — not textbook errors.
Think: what does a smart 15-year-old who uses TikTok but never studied this assume to be true? That IS the error.
MANDATORY FORMAT — no exceptions:
- definition: MUST start with "❌" (max 20 words)
  Format: "❌ Muchos creen que [wrong belief specific to THIS document's topic]."
  FORMAT ONLY — identify the real teen misconception about THIS document's content:
  Física: ❌ "Muchos creen que el sonido viaja más rápido en el vacío que en materiales sólidos."
  Biología: ❌ "Muchos creen que las plantas solo respiran de noche y hacen fotosíntesis de día."
  Química: ❌ "Muchos creen que hervir agua siempre la purifica de todos sus contaminantes."
  ❌ Bad: "Confunden [término A] con [término B]." — too academic, not a real teen belief.
  ⚠️ NEVER copy the subjects above (sonido, plantas, agua) — identify the error from THIS document's content.
- example: MUST start with "✅" (max 20 words)
  Format: "✅ En realidad, [surprising truth that contradicts the error]."
  It must SURPRISE the student — they didn't know this.
BOTH fields required. The error must be specific to THIS topic and believable for a smart teenager.
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
- Screen 8 definition MUST start with "❌". Screen 8 example MUST start with "✅".
- Screen 9 title MUST be "¿Sabías que...?".
- Screen 10 definition MUST use ✓ checklist format.
- NEVER copy text literally from the transcription.
- NEVER create two consecutive non-interactive screens with only definitions — screens 3, 5, 6 enforce interaction.
- NEVER use abstract nodes in causal chains — only visible real-world actions.
- NEVER use brand names (Spotify, Netflix, TikTok, Uber, Instagram, Airbnb, Amazon) unless they appear explicitly in the transcription.
- CONSISTENCY LAW: for every interactive slide (screens 3, 5, 6, 9-wow), the question, the correct answer option, and the feedback definition MUST address the SAME concept. Before finalizing each interactive slide, verify: "Does my feedback explain exactly why the correct answer answers this specific question?" If NO → rewrite the feedback.
- DOCUMENT-FIRST LAW: 100% of academic content must be derivable from the transcription. If a concept, example, or application cannot be traced back to the transcription → remove it.
- Reorganize content by PEDAGOGICAL IMPORTANCE, not document order.
- INTERACTIVITY: minimum 4 interactive screens (3, 5, 6 mandatory + wow_fact optional = 3-4 total).
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
9. Screen 7 (application) uses a concrete real-world application derived from the document's concept, NO brand names unless in transcription → if NO, rewrite.
10. Complexity matches ${curso} → if too hard for 1° Medio or too easy for 4° Medio, adjust.
11. CONSISTENCY CHECK — for each interactive slide (3, 5, 6, wow_fact): does the feedback definition explain exactly why the correct answer is correct for THIS specific question? → if the feedback talks about a different concept, rewrite the feedback.
12. DOCUMENT-FIRST CHECK — does any slide contain concepts not present in the transcription? → if YES, replace with content from the transcription.
If any check fails → fix that screen before outputting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUIZ QUESTIONS (separate from summary screens):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate questions that test understanding and application, not memorization.
Each question: exactly 4 options. Distractors: plausible partial-truths.
Mix difficulty: recognition (1°), application (2°-3°), reasoning and interpretation (4°).
difficulty field: "easy" for recognition, "medium" for application, "hard" for reasoning/inference.
explanation: why correct answer is right AND why the main distractor is wrong.

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

// ── PROCEDURAL prompt (focused on ONE skill) ──────────────────────────────────

function buildFocusedProceduralPrompt(
  transcription: string,
  curso: string,
  primarySkill: DetectedSkill,
  learningPath: DetectedSkill[],
): string {
  const algorithm = SKILL_ALGORITHMS[primarySkill.skillId] ?? '';

  // Build "upcoming missions" text for the victory screen
  const upcoming = learningPath
    .filter(s => s.skillId !== primarySkill.skillId)
    .slice(0, 4)
    .map((s, i) => `${i + 2}️⃣ ${s.skillLabel}`)
    .join(' • ');
  const upcomingLine = upcoming
    ? `Próximas misiones: ${upcoming}`
    : 'Próximo desafío: explora habilidades relacionadas en tu guía.';

  return `Eres un diseñador de sesiones de aprendizaje PROCEDIMENTAL para estudiantes chilenos de enseñanza media (${curso}).

⚠️ REGLA DE ENFOQUE ÚNICO — LEE ANTES DE GENERAR CUALQUIER COSA:
Esta misión enseña ÚNICAMENTE la habilidad: "${primarySkill.skillLabel}"
PROHIBIDO incluir ejercicios, preguntas o contenido de otras habilidades.
TODAS las pantallas (método, ejemplos, preguntas, desafío) deben tratar exclusivamente "${primarySkill.skillLabel}".
Si el documento contiene otras habilidades (ordenar, convertir, clasificar, etc.) → IGNORARLAS en esta misión.

⚠️ REGLA DE CONTENIDO: TODO el contenido (pasos, números, ejemplos) DEBE derivarse de la transcripción.
No inventes ejercicios ajenos al documento. Usa los MISMOS tipos de problemas del material.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALGORITMO REAL PARA ESTA HABILIDAD:
(Usa este algoritmo en el método y en el ejemplo guiado. Adapta los números al documento.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${algorithm || 'Extrae los pasos del procedimiento directamente desde la transcripción.'}

RETORNA SOLO JSON VÁLIDO. Sin texto extra. Todo en español.

PREGUNTAS Y FLASHCARDS:
- TODAS sobre "${primarySkill.skillLabel}" EXCLUSIVAMENTE. Ninguna de otra habilidad.
- Preguntas: el estudiante aplica el procedimiento a un problema concreto (NO definiciones).
- Flashcards: frente = un paso o situación del procedimiento; reverso = la acción o resultado correcto.
- difficulty: "easy" = identificar el método, "medium" = aplicarlo, "hard" = detectar error en la aplicación.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAS 10 PANTALLAS — generar EXACTAMENTE en este orden:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PANTALLA 1 — type: "mission" — emoji: 🎯
EL GANCHO — pregunta concreta sobre el problema que aprenderán a resolver.
- title: Pregunta sobre "${primarySkill.skillLabel}". DEBE terminar en "?". Max 14 palabras.
  ✅ Ejemplos de FORMATO (no copiar — crea uno para ESTA habilidad):
  "¿Cómo transformas 4/15 a decimal sin que te salga un número infinito?"
  "¿Puedes ordenar 0,3 y 0,25 de menor a mayor sin equivocarte?"
  "¿Sabes cuándo un decimal deja de ser exacto y se convierte en periódico?"
- definition: Anticipa lo que PODRÁN HACER al terminar (no lo que aprenderán). Max 20 palabras.
  ✅ "Al terminar esta misión, resolverás cualquier ejercicio de este tipo en segundos."
- example: área temática en 3-5 palabras. Ej: "Matemáticas · 2° Medio"

PANTALLA 2 — type: "process_flow" — emoji: ⚙️
EL MÉTODO — algoritmo paso a paso para "${primarySkill.skillLabel}".
FORMATO CRÍTICO: definition DEBE ser exactamente "Paso 1: [acción] → Paso 2: [acción] → Paso 3: [acción] → Paso 4: [acción]"
  - Cada paso: verbo concreto + objeto específico, máximo 8 palabras por paso.
  - Entre 3 y 4 pasos (el frontend convierte esto en un juego interactivo de ordenamiento).
  - Los pasos DEBEN ser el algoritmo REAL de arriba, adaptado en forma clara.
  ✅ Formato obligatorio: "Paso 1: Alinea las comas decimales verticalmente → Paso 2: Agrega ceros hasta igualar cifras → Paso 3: Compara como números enteros → Paso 4: Ordena el resultado"
  ⚠️ NUNCA copies este ejemplo — usa el algoritmo de ESTA habilidad.
- title: "Método: ${primarySkill.skillLabel}" (o versión corta si es larga)
- example: Un mini-ejemplo con números reales del documento (max 25 palabras).
  Formato: "[Problema real del documento] → Paso 1 aplicado → resultado → conclusión"

PANTALLA 3 — type: "main_concept" — emoji: 📐
EJEMPLO GUIADO — solución completa de un problema concreto del documento.
- title: "Ejemplo resuelto"
- definition: Solución detallada usando EXACTAMENTE el método de la pantalla 2.
  Formato obligatorio:
  "Problema: [enunciado concreto con números del documento]\\nPaso 1: [acción exacta con números]\\nPaso 2: [resultado intermedio]\\nPaso 3: [siguiente acción]\\nResultado: [respuesta final]"
  Max 80 palabras. USA NÚMEROS REALES del documento cuando estén disponibles.
- example: "✅ Comprobación: [por qué la respuesta es correcta, en max 15 palabras]"
- connector: null

PANTALLA 4 — type: "comprehension" — emoji: 🧩  [INTERACTIVA — EJERCICIO GUIADO]
TU TURNO (guiado) — problema nuevo con pista integrada en las opciones.
- title: "Tu turno"
- question: "[Problema de ${primarySkill.skillLabel} con números DISTINTOS al ejemplo]" Max 25 palabras.
  Usa el mismo tipo de problema de la pantalla 3 pero con valores diferentes.
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactamente 4 opciones.
  Las opciones DEBEN incluir el resultado correcto Y errores típicos de cada paso del método.
  Formato sugerido: "A. [resultado correcto]", "B. [error en paso 1]", "C. [error en paso 2]", "D. [error conceptual]"
- correctAnswer: "A", "B", "C" o "D"
- definition: Feedback que EXPLICA el paso donde se equivocan los que fallan. Empieza con 🎯 o ⚡. Max 20 palabras.

PANTALLA 5 — type: "mini_quiz" — emoji: ⚡  [INTERACTIVA — MINI QUIZ 1]
PRACTICA TÚ — aplica el método de forma independiente.
- title: "Mini Quiz"
- question: "[Problema sobre ${primarySkill.skillLabel} con números distintos a pantallas 3 y 4]" Max 25 palabras.
  DEBE ser un problema CONCRETO sobre "${primarySkill.skillLabel}". NO sobre otra habilidad.
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactamente 4 opciones.
  Los distractores deben ser errores PLAUSIBLES de aplicación (error en un paso específico).
- correctAnswer: "A", "B", "C" o "D"
- definition: feedback emocional. DEBE empezar con 🔥, 🚀, ⚡ o 🎯. Max 20 palabras.

PANTALLA 6 — type: "common_error" — emoji: ⚠️
ERROR FRECUENTE al aplicar "${primarySkill.skillLabel}".
- definition: DEBE empezar con "❌" (max 25 palabras)
  "❌ Muchos cometen el error de [enfoque incorrecto específico de este procedimiento]."
- example: DEBE empezar con "✅" (max 25 palabras)
  "✅ La forma correcta es [paso o acción correcta del algoritmo]."
- title: "Error frecuente"
- question: null, options: null, correctAnswer: null

PANTALLA 7 — type: "decide" — emoji: 🤔  [INTERACTIVA — MINI QUIZ 2]
DECIDE — problema diferente a pantallas 3, 4 y 5. Mismo tipo de habilidad.
- title: "¿Cuál es correcto?"
- question: "[Situación donde deben elegir el procedimiento o resultado correcto para ${primarySkill.skillLabel}]" Max 30 palabras.
  Usa números DISTINTOS a todas las pantallas anteriores. Mismo tipo de procedimiento.
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — 4 opciones.
  Solo una correcta. Las demás son errores plausibles de aplicación.
- correctAnswer: "A", "B", "C" o "D"
- definition: feedback emocional empezando con 🔥, 🚀, ⚡ o 🎯. Max 20 palabras.

PANTALLA 8 — type: "application" — emoji: 🌍
APLICACIÓN REAL — dónde usarán esta habilidad fuera del aula.
- title: Escenario concreto donde se usa "${primarySkill.skillLabel}" (max 15 palabras, preferiblemente pregunta).
- definition: Por qué esta habilidad es relevante. Max 40 palabras. NO abstracta — situación concreta del mundo real.
- example: Conexión con algo cotidiano del estudiante (max 15 palabras).
- question: null, options: null, correctAnswer: null

PANTALLA 9 — type: "final_challenge" — emoji: 🏆  [INTERACTIVA — DESAFÍO FINAL]
DESAFÍO FINAL — el problema más difícil de la sesión. Exige dominio completo.
- title: "Desafío final"
- question: "[Problema complejo de ${primarySkill.skillLabel} que requiere aplicar TODOS los pasos del método]" Max 35 palabras.
  Usa números y contexto DISTINTOS a todas las pantallas anteriores.
  Puede combinar 2 pasos del método (pero NO mezclar otra habilidad distinta).
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactamente 4 opciones.
  Un correcto. Tres distractores que representan errores distintos del método.
- correctAnswer: "A", "B", "C" o "D"
- definition: Feedback completo. Explica el proceso correcto completo. Empieza con 🏆. Max 25 palabras.

PANTALLA 10 — type: "victory" — emoji: 🏆
VICTORIA — certifica la habilidad REALMENTE enseñada en esta sesión.
- title: "¡Habilidad dominada!"
- definition: FORMATO CHECKLIST — ÚNICAMENTE lo que se enseñó en ESTA sesión:
  "Aprendiste: ✓ ${primarySkill.skillLabel}"
  NO incluir otras habilidades que no se hayan enseñado en esta sesión.
- example: "Lo aplicarás en pruebas y ejercicios de matemáticas. | ${upcomingLine}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS ABSOLUTAS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Generar EXACTAMENTE 10 pantallas en el orden indicado.
- Pantalla 1 DEBE terminar en "?".
- Pantalla 2 DEBE usar formato "Paso 1: X → Paso 2: X → Paso 3: X" con 3-4 pasos.
- Pantalla 3 DEBE mostrar la solución paso a paso con números reales.
- Pantallas 4, 5, 7 y 9 DEBEN tener question + options + correctAnswer completos sobre "${primarySkill.skillLabel}" ÚNICAMENTE.
- Pantalla 6 definition DEBE empezar con "❌". example DEBE empezar con "✅".
- Pantalla 10 definition DEBE certificar SOLO las habilidades enseñadas.
- TODO el contenido académico deriva de la transcripción. NUNCA inventar ejercicios de otro tipo.
- NUNCA mezclar habilidades: si esta misión es "${primarySkill.skillLabel}", CERO contenido de otras habilidades.

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
- Preguntas de RECONOCIMIENTO y ASOCIACIÓN, no de procedimiento.
- Flashcards: frente = el dato a memorizar, reverso = la asociación o contexto que lo hace memorable.
- difficulty: "easy" = reconocimiento directo, "medium" = aplicar en contexto, "hard" = distinguir entre conceptos similares.

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
    parsed = JSON.parse(fallback[0]);
  }

  const subject = configValues.subject?.trim() || parsed.subject || 'Tema del material';
  const topic = configValues.topic?.trim() || parsed.topic || 'Resumen del material';

  const questions = (parsed.questions || []).map((question: any, index: number) => ({
    id: question.id || `q-${index + 1}`,
    text: question.text || question.pregunta || `Pregunta ${index + 1}`,
    options: (question.options || []).map((option: any, optionIndex: number) => ({
      id: option.id || `o-${optionIndex + 1}`,
      text: option.text || option,
    })),
    correctOptionId: question.correctOptionId || question.correctOption || (question.options?.[0]?.id ?? 'o-1'),
    explanation: question.explanation || question.explicacion || 'Revisa el material para confirmar la respuesta.',
    sourceQuote: question.sourceQuote || question.cita || '',
    difficulty: question.difficulty || 'medium',
  })) as MultipleChoiceQuestion[];

  const flashcards = (parsed.flashcards || []).map((card: any, index: number) => ({
    id: card.id || `f-${index + 1}`,
    front: card.front || card.pregunta || `Tarjeta ${index + 1}`,
    back: card.back || card.respuesta || '',
    sourceQuote: card.sourceQuote || card.cita || '',
    difficulty: card.difficulty || 'easy',
  })) as Flashcard[];

  const rawSlides = (parsed.summary?.slides || []).map((slide: any, i: number) => ({
    type: VALID_SLIDE_TYPES.includes(slide.type) ? slide.type : 'concept',
    emoji: slide.emoji || '📚',
    title: slide.title || `Concepto ${i + 1}`,
    definition: slide.definition || slide.content || '',
    example: slide.example || null,
    visualHint: slide.visualHint || undefined,
    illustrationType: VALID_ILLUSTRATION_TYPES.includes(slide.illustrationType) ? slide.illustrationType : undefined,
    connector: slide.connector ?? null,
    question: slide.question ?? null,
    options: Array.isArray(slide.options) && slide.options.length > 0 ? slide.options : null,
    correctAnswer: slide.correctAnswer ?? null,
  }));

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

  const summary: Summary = {
    id: parsed.summary?.id || 'summary-1',
    title: parsed.summary?.title || `Resumen de ${topic}`,
    slides: validatedSlides,
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
export async function generateSkillMission(
  transcription: string,
  sessionConfig: SessionConfig,
  curso: string,
  primarySkill: DetectedSkill,
  learningPath: DetectedSkill[],
): Promise<GenerationResult> {
  const prompt = buildFocusedProceduralPrompt(transcription, curso, primarySkill, learningPath);
  const systemMsg = `Eres un diseñador de sesiones de aprendizaje procedimental para estudiantes chilenos de enseñanza media. Esta misión enseña UNA SOLA habilidad: "${primarySkill.skillLabel}". Tu filosofía: GANCHO → MÉTODO → EJEMPLO → 4 RONDAS DE PRÁCTICA → ERROR → APLICACIÓN → DESAFÍO → VICTORIA. NO mezcles habilidades distintas. Genera exactamente 10 pantallas en el orden indicado. JSON válido únicamente. Todo en español.`;
  const base = await callOpenAIAndBuildResult(prompt, systemMsg, sessionConfig, 8000);
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
  const xpReward = Math.max(20, Math.min(120, Math.round(wordCount / 8)));
  const gemReward = Math.max(5, Math.min(25, Math.round(xpReward / 10)));

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
    gemReward,
  };
}
