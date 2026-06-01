/**
 * Generation service for study sessions using OpenAI.
 * Pedagogical philosophy: micro-learning gamificado estilo Duolingo.
 * Each session follows: HOOK → CONCEPTO → MICRO RETO → APLICACIÓN → ERROR → DESAFÍO → CURIOSIDAD → VICTORIA
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
}

export async function generateSessionContent(
  transcription: string,
  configValues: SessionConfig,
  curso: string = '1º Medio'
): Promise<GenerationResult> {
  console.log('[Generation] Curso utilizado para generar sesión:', curso);

  const prompt = `You are a Duolingo-style learning experience designer for Chilean high-school students (${curso}). Your mission is NOT to summarize a document — it is to engineer DISCOVERY moments that make a teenager feel "quiero ver la siguiente pantalla."

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
}

If the transcription is shorter than 100 words, return a JSON with empty questions and flashcards and a minimal 10-screen summary using the same structure.

Transcription:
${normalizeText(transcription)}
`;

  const system = `Eres un diseñador de experiencias de aprendizaje gamificadas para jóvenes chilenos de enseñanza media. Tu filosofía: HOOK → DESCUBRIMIENTO → RETO → APLICACIÓN → ERROR → CURIOSIDAD → VICTORIA. Cada pantalla debe hacer que el estudiante quiera ver la siguiente. NO resúmenes escolares — misiones interactivas con progresión de dificultad. Genera exactamente 10 pantallas en el orden indicado. JSON válido únicamente. Todo en español.`;

  const response = await openai.chat.completions.create({
    model: config.openai_model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: 0.25,
    max_tokens: 6500,
  });

  const raw = response.choices?.[0]?.message?.content ?? '';
  const resultText = normalizeText(raw);
  let parsed;
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

  const VALID_SLIDE_TYPES: SummarySlideType[] = [
    'mission', 'main_concept', 'comprehension', 'key_relation',
    'mini_quiz', 'process_flow', 'decide', 'application', 'common_error', 'wow_fact', 'victory',
    'challenge', 'final_challenge',
    'concept', 'key_fact', 'important', 'remember', 'example', 'curiosity',
    'did_you_know', 'true_false', 'observe', 'compare', 'partial_summary',
  ];
  const VALID_ILLUSTRATION_TYPES: IllustrationType[] = ['educational', 'diagram', 'concept', 'timeline', 'map', 'process', 'comparison'];
  const INTERACTIVE_SLIDE_TYPES = ['comprehension', 'mini_quiz', 'final_challenge', 'decide'];

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
    },
    xpReward,
    gemReward,
  };
}
