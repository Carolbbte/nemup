/**
 * Generation service for study sessions using OpenAI.
 */

import OpenAI from 'openai';
import type {
  MultipleChoiceQuestion,
  Flashcard,
  Summary,
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

  const prompt = `You are a Duolingo-style learning experience designer for Chilean high-school students. Your mission is NOT to summarize a document. Your mission is to engineer DISCOVERY moments.

THE FUNDAMENTAL RULE OF THIS SESSION:
  ❌ WRONG sequence: Concepto → explicación → pregunta
  ✅ RIGHT sequence: Pregunta → descubrimiento → explicación breve

The student must DISCOVER the concept, not receive it. Each screen must make them feel:
  Curiosidad → Descubrimiento → Relación → Aplicación → Refuerzo

RETURN ONLY VALID JSON. No extra text.

CURSO DEL ESTUDIANTE: ${curso}

ADAPT EVERYTHING to this academic level:
- 1º Medio: very simple language, everyday examples, recognition questions, no inference.
- 2º Medio: plain language, basic application, conceptual understanding.
- 3º Medio: relational analysis, reasoning, real consequences.
- 4º Medio: critical thinking, complex application, pre-university depth.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMOTIONAL VALIDATION — apply to EVERY screen before writing it:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ask yourself: "¿Un adolescente chileno diría 'ah, por eso pasa eso' o 'no sabía eso'?"
If NO → rewrite the screen.

Each screen must provoke exactly ONE of these:
- Curiosidad: "¿Por qué pasa eso?"
- Sorpresa: "No sabía que..."
- Conexión personal: "Eso me pasa a mí"
- Descubrimiento: "Ah, entonces por eso..."
- Reflexión: "¿Y si...?"

A screen that only INFORMS is NOT valid. It must make the student FEEL something.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WOW RULE — mandatory for every session:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
At least ONE screen must produce the reaction: "Ah, por eso pasa eso."
This is the WOW moment — a counterintuitive fact the student would NOT have guessed before the session.
WOW moment examples (adapt to your topic, do NOT copy verbatim):
  "Una subida de precio puede REDUCIR las ventas Y las ganancias al mismo tiempo."
  "Ahorrar mucho puede en realidad ralentizar la economía de un país."
  "Un producto puede subir de precio aunque ninguna persona haya ganado más dinero."
  "Cuando todos venden al mismo tiempo, todos pierden — aunque cada uno actúe de forma racional."
If no screen produces this reaction → rewrite the most informational screen with a counterintuitive angle.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERNAL ANALYSIS — do this mentally BEFORE generating the JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ask yourself:
1. What 2-3 concepts MUST the student grasp to pass the exam?
2. How do these concepts connect causally (not just relationally)?
3. Is there a chain reaction or domino effect in the material?
4. What would a student who only uses TikTok and watches Netflix incorrectly believe about this?
5. Which real teen situation (Spotify, zapatillas, celular, bencina) makes this concept land?
6. What is the single most surprising or counterintuitive fact in this material? → this becomes the WOW screen.
7. If the material has diagrams — what real-world chain of events do they represent?

8. Which concept from the material is most counterintuitive? → assign it to ONE screen, do NOT dilute across multiple.
9. Am I about to repeat the same idea in two different screens? If YES → use the second screen for a different concept.

NO-REPETITION LAW: Each of the 10 screens must teach something DIFFERENT. Before writing each screen, ask:
"Have I already shown this idea in a previous screen?" If YES → use a different concept for this screen.
The same cause-effect relationship (e.g., demand rises → price rises) must appear in AT MOST ONE screen.

DO NOT include this analysis in the JSON. Use it to build the 10 screens below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEXT LIMITS — apply to EVERY screen:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- definition: maximum 2 sentences OR 30 words — whichever is shorter. No exceptions.
- example: maximum 15 words.
- title: maximum 8 words.
Prefer scannable short phrases over connected prose. If you have 3 ideas, split into 3 lines.
BAD: "Porque si hay más personas que quieren algo y hay poco disponible, el precio sube."
GOOD: "Más personas quieren comprar.\nHay poco disponible.\nEl precio sube."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE 10 SCREENS — generate EXACTLY in this order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCREEN 1 — type: "mission" — emoji: 🎯
- title: active mission title (e.g., "Misión: Agentes Económicos")
- definition: the learning objective as an active mission statement (1 sentence, max 25 words).
  Example: "En esta misión aprenderás cómo interactúan familias, empresas y Estado en la economía."
  DO NOT write "Aprenderás sobre..." — make it exciting and specific.
- example: null

SCREEN 2 — type: "main_concept" — emoji: fitting to content
FOLLOW THE DISCOVERY SEQUENCE — Pregunta → Descubrimiento → Explicación breve:
  Part 1 — HOOK QUESTION: Start with a question that provokes curiosity. The student does NOT know the answer yet.
    Must make the student think "hm, why does that happen?"
    ✅ Good: "¿Por qué Netflix cuesta más cada año aunque la plata sea la misma?"
    ✅ Good: "¿Por qué la palta sube de precio justo cuando más quieres comer?"
    ❌ Bad: "Cada vez que eliges qué comprar, estás haciendo economía." — this is a statement, not a hook.
  Part 2 — DISCOVERY: One plain sentence that ANSWERS the hook question and reveals the concept. Zero academic jargon.
    Example: "Porque cuando más personas quieren algo y hay poco disponible, el precio sube — eso es oferta y demanda."
  Part 3 — in example field: A SPECIFIC situation a Chilean teenager encounters TODAY.
    Must be concrete: a platform, a product, a real scenario with a number or name.
    ✅ "Tu zapatilla favorita subió $20.000 en una semana porque todos la quieren."
    ❌ "Los consumidores toman decisiones" — too abstract, FORBIDDEN.
- title: the concept name (max 5 words)
- definition: Part 1 + Part 2 combined (max 25 words total, 2 sentences: hook question then discovery answer)
- example: Part 3 — max 12 words. One concrete fact or price from real life.
- connector: REQUIRED — visual causal chain showing HOW this concept works in 3 steps.
  Format: "emoji1 Step1 ↓ verb ↓ emoji2 Step2 ↓ verb ↓ emoji3 Step3"
  Each step node = emoji + max 3 words. Each verb = 1 word.
  ✅ "🙋 Mucha demanda ↓ genera ↓ 📦 Poco stock ↓ eleva ↓ 💰 Precio sube"
  ✅ "📱 Sube el dólar ↓ encarece ↓ 🛒 Productos importados ↓ eleva ↓ 💸 Lo que pagas"
  VERB RULE: each verb must transitively describe what the prior node CAUSES in the next. Use 'genera', 'eleva', 'encarece', 'reduce', 'impulsa' — not bare 'sube'/'baja' when they describe the next node's state rather than the prior node's action.
  This chain IS the main explanation. Keep definition ultra-short.

SCREEN 3 — type: "comprehension" — emoji: 🤔  [INTERACTIVE — REQUIRED]
- title: "¿Comprendiste?"
STRICT QUESTION RULES — any violation means rewrite:
  ❌ PROHIBIDO preguntar definiciones: "¿Qué es la inflación?" — FORBIDDEN
  ❌ PROHIBIDO preguntar conceptos literales: "¿Qué estudia la microeconomía?" — FORBIDDEN
  ❌ PROHIBIDO preguntar exactamente lo que apareció en la tarjeta anterior — FORBIDDEN
  ✅ Las preguntas deben plantear SITUACIONES que requieren aplicar el concepto.
  ✅ Good: "¿Cuál de estas situaciones es un ejemplo de oferta y demanda?"
  ✅ Good: "Si el precio de las bebidas sube en todo Chile, ¿qué está ocurriendo?"
  ✅ Good: "¿Qué pasaría si todas las tiendas de zapatillas subieran sus precios al mismo tiempo?"
- question: a SITUATIONAL question — present a scenario, ask what concept applies or what would happen (max 25 words)
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options, each max 12 words
- correctAnswer: "A", "B", "C", or "D"
- definition: one sentence explaining why the answer is correct (max 15 words)
- DISTRACTOR QUALITY — all 4 options must be believable partial-truths. Model:
  Example: "Si el precio del pan sube, ¿qué harán probablemente las familias?"
  A. Comprarán menos pan           ← correct
  B. Comprarán marcas más baratas  ← plausible (substitution)
  C. Gastarán menos en otras cosas ← plausible (budget effect)
  D. Buscarán ofertas en internet  ← plausible (price search)
  ❌ STRICTLY FORBIDDEN options: "Todas las anteriores", "Todas las opciones", "Ninguna de las anteriores", "Todas pueden ocurrir", "porque sí", "no cambia nada", "dejan de comprar para siempre"
  RULE: There must be EXACTLY ONE clearly correct answer. If two options could both be correct → rewrite.

SCREEN 4 — type: "key_relation" — emoji: 🔗
SHOW EXACTLY ONE CAUSAL CHAIN — ONE relationship, THREE steps maximum. No extensions.
❌ PROHIBITED: chains that go beyond 3 nodes (do NOT add "ventas bajan" or extra consequences after the result).
❌ PROHIBITED: abstract nodes like "Oferta", "Demanda", "Consumo" alone — these mean nothing to a teenager.
✅ REQUIRED: nodes must be VISIBLE EVERYDAY ACTIONS or SITUATIONS.
CORRECT: Más personas quieren zapatillas ↓ genera ↓ Tiendas piden más stock ↓ eleva ↓ Precios
WRONG: Más personas compran ↓ sube ↓ Demanda ↓ sube ↓ Precio ↓ bajan ↓ Ventas ↓ cae ↓ Empresa
- connector: chain in EXACTLY this format — situación real → consecuencia visible → impacto:
  "Acción cotidiana ↓ verbo ↓ Consecuencia visible ↓ verbo ↓ Impacto"
  Each node = max 4 words. Each verb = max 2 words. Use ↓ NOT →.
  VERB RULE — CRITICAL: Every verb must complete "NodeA [verb] NodeB" as a TRANSITIVE causal action.
  The verb describes what NodeA DOES TO cause NodeB — it is NOT a description of NodeB's state.
  ✅ Correct verbs: genera, impulsa, eleva, reduce, causa, provoca, encarece, dispara, baja, sube (only when transitively meaningful).
  ❌ WRONG: using "sube", "bajan", "cae" when they describe NodeB's state, not NodeA's action on NodeB.
  Example of the error to AVOID: "Más personas compran zapatillas ↓ sube ↓ Tiendas piden más stock" — "sube" does NOT describe what buying does to stores. CORRECT: "genera".
  ✅ Good: "Más personas compran zapatillas ↓ genera ↓ Tiendas piden más stock ↓ eleva ↓ Precios"
  ✅ Good: "Sube el dólar ↓ encarece ↓ Celulares importados ↓ eleva ↓ Precio del iPhone"
  ✅ Good: "Spotify sube su precio ↓ reduce ↓ Suscriptores ↓ baja ↓ Ingresos de artistas"
  ❌ Bad: "Oferta ↓ sube ↓ Demanda ↓ baja ↓ Precios" — abstract, not a real situation.
- title: a short descriptive name for this reaction (max 6 words)
- definition: one sentence explaining WHY this chain matters to the student personally (max 20 words)
- example: null
- FALLBACK: If no concrete real-world chain exists → use type "comprehension" instead.

SCREEN 5 — type: "mini_quiz" — emoji: ⚡  [INTERACTIVE — REQUIRED]
- title: "Quiz rápido"
- question: an APPLICATION question — the student must REASON using the concept, not just remember it (max 25 words).
  Good: "Si el precio del pan sube un 30%, ¿qué pasará probablemente con la cantidad que compra una familia?"
  Bad: "¿Qué es la demanda?" — this is pure recognition, FORBIDDEN.
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options, each max 12 words
- correctAnswer: "A", "B", "C", or "D"
- definition: one sentence explanation WHY the correct answer is right (max 20 words)
- CRITICAL — CORRECT ANSWER must NOT be obvious from the question wording.
- CRITICAL — ALL 4 options must seem plausible at first glance — partial-truths, not absurdities.
  ❌ STRICTLY FORBIDDEN: "Todas las anteriores", "Todas las opciones", "Ninguna de las anteriores", "Todas pueden ocurrir", "porque sí", "no cambia nada"
  ✅ REQUIRED: each wrong option represents a real but incomplete or slightly-off reasoning.
  SINGLE CORRECT ANSWER: if two options could both be correct → rewrite the question.
- CRITICAL — Prioritize REASONING over memorization. If a student can answer without understanding, rewrite.
- 2-SECOND TEST: If the correct answer can be identified in less than 2 seconds without reasoning → the question is too easy → rewrite it.

SCREEN 6 — type: "process_flow" OR "decide" OR "challenge" — emoji: 🔄 or 🤔
- OPTION A — type: "process_flow" — if the material has a clear sequence or flow:
  - title: name of the process or flow (max 6 words)
  - definition: the steps written as "Step1 → Step2 → Step3 → Step4" (max 4 steps, max 5 words each). Show a CAUSAL chain — each step causes the next.
  - example: real-world instance of this process (max 20 words)
- OPTION B — type: "decide" — PREFERRED if no clear process but a dilemma or choice can be posed:  [INTERACTIVE]
  Use this to force the student to APPLY the concept by choosing between two realistic paths.
  - title: "¿Qué harías?" or "¿Cuál elegirías?" or similar (max 8 words)
  - question: a realistic dilemma rooted in the content (max 30 words). Describe a real scenario with two possible choices.
    ✅ Good: "El gobierno quiere bajar el desempleo. ¿Qué política sería más efectiva a corto plazo?"
    ✅ Good: "Eres empresario y sube el costo del café. ¿Qué decisión tomarías para proteger tus ganancias?"
  - options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 3 or 4 options (each max 12 words)
    Each option must reflect a different but plausible economic/conceptual reasoning.
  - correctAnswer: "A", "B", "C", or "D" — the option that best demonstrates understanding of the concept.
  - definition: one sentence explaining WHY that answer shows correct conceptual understanding (max 20 words)
  - example: null
  ❌ FORBIDDEN options: "Todas las anteriores", "Ninguna de las anteriores", "No haría nada"
- OPTION C — type: "challenge" — only if NEITHER process NOR dilemma works for this material:
  - title: "Reflexiona"
  - definition: an open-ended "what if" or "why" question that requires applying the concepts (max 30 words)
    Example: "Si desaparecieran los impuestos, ¿qué servicio público podría verse más afectado y por qué?"
  - example: null
  - question, options, correctAnswer: all null

SCREEN 7 — type: "application" — emoji: 🌍
THIS SCREEN MUST ANSWER: "¿Dónde veré esto hoy?"
The student must leave this screen thinking "eso pasa en algo que uso todos los días."
MANDATORY: use a specific named platform or product. Priority order:
  1st choice: PlayStation, iPhone, zapatillas de marca, conciertos, videojuegos, ropa de temporada
  2nd choice: Uber, PedidosYa, Mercado Libre, Steam, TikTok, Samsung, Spotify
  Last resort: Netflix (overused — only if nothing else fits)
  ❌ PROHIBITED: generic examples — "una empresa", "un consumidor", "una tienda", "los productores" with no real name.
  ❌ PROHIBITED: examples from books or school contexts.
  ❌ PROHIBITED: inventing prices or facts — only use real economic mechanisms.
- title: a concrete scenario AS A QUESTION using one of the above (max 15 words)
  ✅ "¿Por qué Uber sube su precio cuando llueve y hay poca disponibilidad?"
  ✅ "¿Por qué Mercado Libre muestra precios distintos para el mismo celular?"
  ✅ "¿Por qué Steam pone juegos en oferta solo en fechas específicas?"
- definition: answer explaining WHICH concept applies and WHY — plain language, no jargon (max 2 sentences, 40 words)
- example: one sentence connecting this to the student's daily life (max 15 words)
- ACCURACY RULE: The explanation must be TECHNICALLY CORRECT. Do NOT invent causes.
  Use the actual mechanism: costos de producción, competencia, oferta y demanda, inflación, estrategia comercial — whichever actually applies.
  ❌ FORBIDDEN: "Netflix sube su precio porque más personas lo usan." — this is incorrect.
  ✅ CORRECT: "Netflix sube su precio por aumento de costos de contenido y para financiar nuevas producciones."

SCREEN 8 — type: "common_error" — emoji: ⚠️
SHOW WHAT TEENAGERS ACTUALLY BELIEVE — not textbook errors.
Think: what does a smart 15-year-old who uses TikTok but never studied this assume to be true? That assumption IS the error.
Real teen error examples to model (adapt to this topic, do NOT copy verbatim):
  ❌ "El dólar solo afecta a las empresas, no a mí"
  ❌ "La inflación es culpa de una tienda que quiere ganar más"
  ❌ "Ahorrar siempre ayuda a la economía"
  ❌ "Si algo sube de precio es una estafa"
RULES:
1. definition = the WRONG belief phrased as what "mucha gente cree" or "muchos piensan" (1 sentence, max 20 words).
   ✅ Good: "Muchos creen que si el dólar sube, el gobierno puede simplemente bajar su precio."
   ❌ Bad: "Confunden oferta con demanda." — too academic, not a real teen belief.
2. example = the CORRECT reality stated as a surprising fact (1 sentence, max 20 words).
   It must SURPRISE the student — they didn't know this.
3. BOTH fields are REQUIRED. If no real teen misconception exists, replace with type "comprehension".
4. The error must be specific to THIS topic and believable for a smart teenager.

SCREEN 9 — type: "wow_fact" — emoji: 🤯
THIS IS THE WOW INSIGHT SCREEN — the single most counterintuitive or surprising fact from this topic.
The student must finish this screen thinking: "No tenía idea de que eso pasaba."
- title: "¿Sabías que...?" (or a short intriguing phrase, max 6 words)
- definition: ONE surprising, counterintuitive fact that challenges what the student assumed. MAX 3 lines / 30 words. No more.
  Must be 100% accurate. Must relate directly to this session's topic.
  Model structure: "Aunque parezca imposible, [hecho contraintuitivo]. Esto ocurre porque [mecanismo real simple]."
  ✅ Topic: precios → "Subir el precio de un producto puede reducir las ganancias totales de la empresa."
  ✅ Topic: ahorro → "Cuando todos ahorran al mismo tiempo, el país puede entrar en recesión."
  ✅ Topic: dólar → "Chile puede exportar más cuando el peso se DEBILITA, no cuando se fortalece."
  ✅ Topic: inflación → "Un poco de inflación es intencional — sin ella la economía se congela."
- example: one sentence grounding this in a teen's everyday life (max 20 words)
- OPTIONAL INTERACTIVE VERIFICATION: If you can write a HIGH-QUALITY verification question about the wow fact, include:
  - question: ONE question that directly tests if the student understood the counterintuitive fact (max 20 words). Must be about the wow fact itself, not a repeat of earlier screens.
  - options: ["A. ...", "B. ...", "C. ..."] — exactly 3 options (each max 10 words), one clearly correct
  - correctAnswer: "A", "B", or "C"
  If the question would be trivial, repetitive, or low-quality → leave question/options/correctAnswer as null.

SCREEN 10 — type: "victory" — emoji: 🏆
- title: "¡Misión cumplida!"
- definition: MANDATORY CHECKLIST FORMAT — list the specific concepts mastered in this session.
  Format: "Aprendiste: ✓ [Concepto 1] • ✓ [Concepto 2] • ✓ [Concepto 3] • ✓ [Concepto 4]"
  Use the EXACT names of the concepts covered in screens 2, 4, 6, 7, 8, 9.
  Example: "Aprendiste: ✓ Oferta y demanda • ✓ Inflación • ✓ Cómo afectan los precios • ✓ Relación micro y macro"
  MAX 4 concepts in the checklist.
- example: MANDATORY — start with "Lo usarás cuando..." and name a specific teen situation (max 20 words).
  Example: "Lo usarás cuando el precio de tu celular favorito cambie y entiendas por qué."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES FOR ALL 10 SCREENS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Generate EXACTLY 10 slides in the exact order above. No type may be duplicated.
- NEVER copy text literally from the transcription.
- NEVER create two consecutive informational screens with definitions only.
- NEVER ignore diagrams, flows, or visual structures in the material — convert them into screen 6 (process_flow) or screen 4 (key_relation).
- NEVER create empty or vague slides. If a type cannot be filled with quality content, use the FALLBACK types specified above.
- Reorganize content by PEDAGOGICAL IMPORTANCE, not by document order.
- Prioritize: understanding → application → retention. NOT total content coverage.
- The 2 interactive screens (screens 3, 5) are MANDATORY. They must always be comprehension/mini_quiz with real questions and options.
- INTERACTIVITY TARGET: At least 35% of screens must be interactive. With 10 screens = minimum 3-4 interactive screens. Screens 3 and 5 are mandatory. Use "decide" for screen 6 and/or interactive wow_fact (screen 9) to reach this target. Prefer "decide" over "challenge" whenever a realistic dilemma can be posed.
- Screen 9 (wow_fact) CAN optionally be interactive if a high-quality verification question exists.
- CONCEPTUAL BRIDGE: When the session moves from micro-level concepts (individual choices, product prices) to macro-level concepts (inflation, GDP, Banco Central, monetary policy), write an explicit bridge in the definition field of the transition screen. Example bridge: "Lo que ocurre con el precio de la palta también pasa a escala de toda la economía — así funcionan los precios a nivel macro."
- CURSO ADAPTATION is MANDATORY. The complexity of vocabulary, the depth of reasoning required, and the length of explanations must match the student's curso level: ${curso}. A 1º Medio session must feel simpler than a 4º Medio session in every screen.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL VALIDATION — run this checklist before outputting JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ¿Hay curiosidad? → ¿Al menos una tarjeta provoca "¿por qué pasa eso?"
2. ¿Hay descubrimiento? → ¿El estudiante aprende algo que no sabía, no que le repiten algo?
3. ¿Las preguntas requieren pensar? → ¿No se pueden responder en menos de 2 segundos sin razonar?
4. ¿Los ejemplos son adolescentes? → ¿Aparece Netflix, Spotify, TikTok, Uber, Steam, iPhone, PedidosYa, o Mercado Libre — no "una empresa" genérica?
5. ¿Existe al menos un momento WOW? → ¿La tarjeta 9 (wow_fact) contiene un hecho contraintuitivo que sorprendería a un adolescente?
6. ¿Las preguntas interactivas (screens 3 y 5) tienen question y options completas? → Si NO → reescribir esa pantalla completa.
7. ¿La tarjeta 10 (victory) tiene el checklist de conceptos en formato ✓ ? → Si NO → regenerar.
8. ¿El nivel de complejidad es correcto para ${curso}? → Si el lenguaje parece universitario para 1º Medio, simplificar.
If any answer is NO → rewrite the failing screen before outputting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUIZ QUESTIONS (separate from summary screens):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Generate questions that test understanding and application, not just memorization.
- Each question must have exactly 4 options.
- Distractors must be plausible — related to the topic, could seem correct at first glance.
- Mix difficulty: recognition (1°), application (2°-3°), reasoning and interpretation (4°).
- explanation: why the correct answer is right AND why the main distractor is wrong.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLASHCARDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- front: concise question or concept (max 10 words)
- back: direct, memorable answer (max 25 words)
- Mix "what" cards with "how" and "why" cards.
- Avoid pure definition repetition.

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

If the transcription is shorter than 100 words, return a JSON with an empty questions and flashcards list and a minimal 10-screen summary using the same structure.

Transcription:
${normalizeText(transcription)}
`;

  const system = `Eres un diseñador de experiencias de aprendizaje estilo Duolingo para jóvenes de enseñanza media chilena. Tu objetivo NO es resumir un documento — es crear momentos de DESCUBRIMIENTO. Cada pantalla debe provocar curiosidad, sorpresa o una conexión personal. Un adolescente debe terminar la sesión pensando "no sabía eso" o "ah, por eso pasa". Construye misiones interactivas, NO resúmenes escolares. Genera exactamente 10 pantallas en el orden indicado. Proporciona JSON válido. Todo el contenido en español.`;
  const response = await openai.chat.completions.create({
    model: config.openai_model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 6500,
  });

  const raw = response.choices?.[0]?.message?.content ?? response.choices?.[0]?.message?.content?.toString?.() ?? '';
  const resultText = normalizeText(raw);
  let parsed;
  try {
    parsed = JSON.parse(resultText);
  } catch (error) {
    const fallback = raw.match(/\{[\s\S]*\}/);
    if (!fallback) {
      throw new Error('No se pudo parsear la respuesta de OpenAI.');
    }
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
    // Structured mission screens (primary — current generation)
    'mission', 'main_concept', 'comprehension', 'key_relation',
    'mini_quiz', 'process_flow', 'decide', 'application', 'common_error', 'wow_fact', 'victory',
    'challenge',
    // Kept for backward compatibility with older sessions
    'final_challenge',
    // Legacy types
    'concept', 'key_fact', 'important', 'remember', 'example', 'curiosity',
    'did_you_know', 'true_false', 'observe', 'compare', 'partial_summary',
  ];
  const VALID_ILLUSTRATION_TYPES: IllustrationType[] = ['educational', 'diagram', 'concept', 'timeline', 'map', 'process', 'comparison'];

  // Interactive types that require question + options (wow_fact optional, victory never needs them)
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
    // Interactive slides must have question + options — convert to 'challenge' if missing
    if (isMissionModel && INTERACTIVE_SLIDE_TYPES.includes(slide.type)) {
      const hasQuestion = typeof slide.question === 'string' && slide.question.trim().length > 0;
      const hasOptions = Array.isArray(slide.options) && slide.options.length >= 2;
      if (!hasQuestion || !hasOptions) {
        console.warn(`[Generation] Interactive slide ${i} (${slide.type}) missing question/options — converting to challenge`);
        return {
          ...slide,
          type: 'challenge' as SummarySlideType,
          definition: slide.definition?.trim() || slide.title || 'Reflexiona sobre los conceptos aprendidos en esta sesión.',
          question: null,
          options: null,
          correctAnswer: null,
        };
      }
    }
    // wow_fact with partial interactive fields — clean up if incomplete
    if (isMissionModel && slide.type === 'wow_fact') {
      const hasQ = typeof slide.question === 'string' && slide.question.trim().length > 0;
      const hasOpts = Array.isArray(slide.options) && slide.options.length >= 2;
      if (hasQ !== hasOpts) {
        // Partial — strip interactive fields rather than leaving broken state
        return { ...slide, question: null, options: null, correctAnswer: null };
      }
    }
    // wow_fact slide (screen 9) must have a definition — patch if missing
    if (isMissionModel && slide.type === 'wow_fact' && !slide.definition?.trim()) {
      console.warn(`[Generation] wow_fact slide ${i} missing definition — applying fallback`);
      return {
        ...slide,
        definition: `Un hecho sorprendente sobre ${topic}: los conceptos de esta sesión tienen efectos que van más allá de lo que parece a primera vista.`,
      };
    }
    // victory slide must have a definition — patch if missing
    if (isMissionModel && slide.type === 'victory' && !slide.definition?.trim()) {
      console.warn(`[Generation] victory slide ${i} missing definition — applying fallback`);
      return {
        ...slide,
        definition: `Aprendiste los conceptos clave de esta sesión sobre ${topic}.`,
        example: slide.example || `Lo usarás cuando notes cómo los precios y decisiones económicas afectan tu vida diaria.`,
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

  return {
    subject,
    topic,
    questions,
    flashcards,
    summary,
    groundingScore,
  };
}

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

  // No quotes generated → consider valid (LLM omitted them but content is there)
  if (allQuotes.length === 0) {
    return { validated: true, score: 1, missingQuotes: [] };
  }

  const matchedCount = allQuotes.reduce((count, quote) => {
    const normalizedQuote = normalizeText(quote).toLowerCase();
    // Accept if the quote appears verbatim OR if most words overlap (fuzzy match)
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

  return {
    validated: score >= 0.5,
    score,
    missingQuotes,
  };
}

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
