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
import { validateTruth, buildTruthFeedback } from './truthValidator.js';
import { normalizeAllSlides } from './canonicalNormalizer.js';
import type { KnowledgeGraph } from './knowledgeExtractor.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

function normalizeText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildKnowledgeBlock(graph: KnowledgeGraph): string {
  const lines: string[] = [
    'KNOWLEDGE GRAPH — INSTRUCCIÓN OBLIGATORIA:',
    'Usa SOLO esta estructura de conocimiento. No re-analices. No inventes. No salgas de este knowledge graph.',
    '',
  ];
  if (graph.concepts.length > 0) {
    lines.push('CONCEPTOS:');
    for (const c of graph.concepts) lines.push(`• ${c.name}${c.description ? ': ' + c.description : ''}`);
    lines.push('');
  }
  if (graph.definitions.length > 0) {
    lines.push('DEFINICIONES:');
    for (const d of graph.definitions) lines.push(`• ${d.term}: ${d.definition}`);
    lines.push('');
  }
  if (graph.procedures.length > 0) {
    lines.push('PROCEDIMIENTOS:');
    for (const p of graph.procedures) {
      lines.push(`• ${p.name}:`);
      p.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    }
    lines.push('');
  }
  if (graph.examples.length > 0) {
    lines.push('EJEMPLOS:');
    for (const e of graph.examples) lines.push(`• ${e.content}`);
    lines.push('');
  }
  if (graph.mistakes.length > 0) {
    lines.push('ERRORES COMUNES:');
    for (const m of graph.mistakes) lines.push(`• ${m.description}${m.correction ? ' → ' + m.correction : ''}`);
    lines.push('');
  }
  if (graph.entities.length > 0) {
    lines.push('ENTIDADES (fechas, fórmulas, símbolos, nombres):');
    for (const en of graph.entities) lines.push(`• [${en.type}] ${en.value}${en.context ? ': ' + en.context : ''}`);
    lines.push('');
  }
  if (graph.relationships.length > 0) {
    lines.push('RELACIONES:');
    for (const r of graph.relationships) lines.push(`• ${r.from} → ${r.to} (${r.type})${r.description ? ': ' + r.description : ''}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
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
        "type": "mission"|"main_concept"|"micro_challenge"|"reinforcement_challenge"|"comprehension"|"key_relation"|"mini_quiz"|"process_flow"|"decide"|"application"|"common_error"|"wow_fact"|"final_challenge"|"victory"|"challenge",
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
        "correctAnswerReason": string | null,
        "wrongAnswerHints": { "<letter>": string } | null,
        "feedbackCorrect": string | null,
        "feedbackWrong": string | null
      }
    ],
    "sourceQuotes": [string]
  }
}`;

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildConceptualPrompt(transcription: string, curso: string, contentOverride?: string): string {
  const sourceRule = contentOverride
    ? 'TODO el contenido debe derivarse EXCLUSIVAMENTE del knowledgeGraph provisto.\nEl knowledgeGraph es la única fuente de verdad académica permitida.'
    : 'TODO el contenido (títulos, definiciones, ejemplos, preguntas, opciones, conectores) DEBE derivarse EXCLUSIVAMENTE de la transcripción.\nNO introduzcas conceptos, términos, vocabulario ni ejemplos ajenos a la transcripción.\nTrata la transcripción como la ÚNICA fuente de contenido académico permitida.';
  return `Eres un Arquitecto de Aprendizaje para estudiantes chilenos de enseñanza media (${curso}).
Tu tarea NO es generar una secuencia fija de pantallas. Es DISEÑAR una misión pedagógicamente coherente a partir de un análisis real del contenido.

⚠️ REGLA CRÍTICA DE CONTENIDO — LEE ANTES DE GENERAR CUALQUIER COSA:
${sourceRule}
Los ejemplos de formato en este prompt son SOLO demostraciones de estructura — su contenido temático (biología, física, química usados como ejemplo) NUNCA debe aparecer en el output salvo que también esté en la fuente provista.
Si el contenido trata de Ondas → cada pantalla habla de ondas, frecuencia, amplitud — NUNCA de demanda, precio, fotosíntesis ni ningún otro tema.

DEVUELVE SOLO JSON VÁLIDO. Sin texto adicional. Todo el contenido en español.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 1 — ANÁLISIS PEDAGÓGICO [MENTAL — ANTES DE GENERAR JSON]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Analiza la transcripción completa. Identifica TODOS los elementos pedagógicos presentes:
• Conceptos (qué son las cosas)
• Habilidades (qué se puede hacer con ellas)
• Procedimientos (cómo se ejecuta algo, paso a paso)
• Reglas (cuándo aplica algo, excepciones)
• Modelos y principios (qué explica un patrón general)
• Procesos (qué ocurre por etapas, causa → efecto → resultado)
• Relaciones causa-efecto (A produce B, B produce C)
• Clasificaciones (tipos de X, categorías y criterios)
• Prerrequisitos (qué hay que saber antes de entender el resto)
• Errores frecuentes (qué confunden los estudiantes reales de enseñanza media)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 2 — OBJETIVO DE APRENDIZAJE [MENTAL — ANTES DE CLASIFICAR]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Define UN SOLO objetivo de aprendizaje principal para esta misión.

Formato obligatorio:
  "Al terminar esta misión, el estudiante podrá [VERBO COGNITIVO] [QUÉ] [EN QUÉ CONTEXTO]."

El verbo cognitivo debe corresponder al nivel real que permite el documento:
  Recordar / Identificar → el documento solo describe o lista.
  Explicar / Diferenciar → el documento muestra relaciones o mecanismos.
  Aplicar / Resolver → el documento incluye procedimientos o casos.
  Analizar / Evaluar → el documento presenta causas, consecuencias o decisiones.

REGLA: El objetivo determina qué conceptos son nucleares.
  Un concepto es nuclear SOLO si su ausencia impide alcanzar ese objetivo.
  Un concepto que aporta contexto pero no es necesario para lograr el objetivo → Tipo B o Tipo C.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 3 — CLASIFICACIÓN DE IMPORTANCIA [MENTAL]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Clasifica CADA elemento detectado en una de tres categorías.
La clasificación se hace SIEMPRE EN RELACIÓN AL OBJETIVO DE APRENDIZAJE definido en Fase 2.

TIPO A — CONCEPTO NUCLEAR
Cumple AL MENOS 2 de estas condiciones Y contribuye directamente al objetivo:
  ✓ Su ausencia impide alcanzar el objetivo de aprendizaje
  ✓ Tiene significado propio (no depende de otro para existir)
  ✓ Requiere comprensión profunda, no solo memorización
  ✓ Puede evaluarse de forma independiente respecto al objetivo
  ✓ Tiene errores frecuentes documentados asociados
→ Genera SECCIÓN PROPIA en la misión.

TIPO B — CONCEPTO DE APOYO
  → Ayuda a entender un concepto nuclear, pero no es evaluable por sí solo.
  → O bien: es interesante, pero no es necesario para alcanzar el objetivo.
  → Se explica BREVEMENTE dentro de la pantalla main_concept de la sección nuclear correspondiente.
  → NO genera sección propia.
  → NO puede aparecer como tema central de preguntas interactivas.

TIPO C — INFORMACIÓN COMPLEMENTARIA
  → No contribuye al objetivo de aprendizaje.
  → Solo aporta contexto o curiosidad.
  → No genera pantalla.

PRUEBA DE DEGRADACIÓN — aplicar a cada elemento antes de clasificarlo como Tipo A:
  "Si el estudiante NO aprende este concepto, ¿puede igual alcanzar el objetivo de la misión?"
  → Si SÍ → degradar a Tipo B o Tipo C.
  → Si NO → puede ser Tipo A (verificar las demás condiciones).

REGLA DE CONSERVACIÓN DE OBJETIVOS (prioridad absoluta sobre la Prueba de Degradación):
Si el documento contiene objetivos de aprendizaje explícitos (enumerados con números o letras, declarados con verbos de acción como "reconocer", "identificar", "clasificar", "reducir", "simplificar", "aplicar", "resolver", "agrupar", "operar"):
→ CADA objetivo explícito es Tipo A por defecto. No requiere verificación adicional con la Prueba de Degradación.
→ Ser prerrequisito de otro concepto NO es motivo de degradación.
  Ejemplo correcto: "Reconocer partes del término" ES prerrequisito de "Reducir términos" — y aun así conserva sección propia porque evalúa una habilidad distinta e independiente.
→ Un objetivo explícito SOLO puede degradarse a Tipo B si cumple AL MENOS DOS de estas condiciones simultáneamente:
  (1) Es literalmente un sinónimo del objetivo: mismo verbo, mismo objeto.
      ✅ Sí: "Identificar términos semejantes" ≈ "Reconocer términos semejantes"
      ❌ No: "Reconocer partes del término" ≠ "Reducir términos semejantes"
  (2) Produce exactamente la misma evaluación que otro objetivo Tipo A ya seleccionado.
  (3) El documento lo presenta como aclaración del mismo objetivo, no como objetivo independiente.
→ NUNCA degradar a Tipo C. Los objetivos del documento son contratos pedagógicos.
→ Si excepcionalmente se degrada un objetivo explícito → registrar en victory: "Aprendiste también: [objetivo degradado]".

REGLA CRÍTICA DE SELECCIÓN:
La IA NO debe convertir automáticamente cada concepto en una pantalla.
Objetivo: ENSEÑAR MENOS CONCEPTOS, CON MAYOR PROFUNDIDAD.

Documento corto (hasta ~400 palabras): selecciona MÁXIMO 3 conceptos nucleares (Tipo A).
Documento largo (más de ~400 palabras): selecciona MÁXIMO 5 conceptos nucleares (Tipo A).
Si existen más Tipo A del límite → selecciona los que más contribuyen al objetivo.
El resto queda para futuras sesiones.

ORDEN DE PRIORIDAD cuando se alcanza el límite:
  1. Objetivos explícitos del documento (conservar siempre, reducir conceptos inferidos si hay conflicto)
  2. Conceptos evaluables inferidos del contenido
  3. Analogías y recursos pedagógicos
→ NUNCA eliminar un objetivo explícito para hacer espacio a un concepto inferido.
→ Si los objetivos explícitos ya ocupan el límite: los conceptos inferidos quedan para futuras sesiones.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 4 — VALIDACIÓN DE DEPENDENCIAS CONCEPTUALES [MENTAL]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Antes de diseñar las secciones, verifica el orden de los conceptos nucleares seleccionados.

PASO A — Detectar dependencias:
  Para cada concepto nuclear, pregunta: "¿Para entender este concepto, el estudiante necesita entender primero otro concepto de esta misma lista?"
  Si SÍ → ese otro concepto es un PRERREQUISITO del primero.
  Si el prerrequisito NO está en la lista de nucleares pero sí en el documento → agrégalo como Tipo A al inicio.
  Si el prerrequisito NO aparece en el documento en absoluto → mencionarlo como Tipo B en la primera sección que lo necesite.
  ⚠️ REGLA CRÍTICA: ser PRERREQUISITO de otro concepto NO significa estar absorbido por él.
  "Reconocer las partes de un término" es prerrequisito de "Reducir términos semejantes" —
  ambos son Tipo A independientes porque evalúan habilidades distintas:
  uno evalúa identificación de componentes, el otro evalúa operación algebraica.

PASO B — Ordenar las secciones por dependencia:
  Los conceptos sin prerrequisitos van primero.
  Los conceptos que dependen de otro van después de ese otro.
  Si dos conceptos son independientes entre sí → ordenar por importancia para el objetivo.

PASO C — Verificar que ninguna sección dé por sabido lo que aún no fue enseñado:
  Antes de escribir cada main_concept, confirma: "¿Todo lo que esta pantalla asume que el estudiante ya sabe fue enseñado en una sección anterior de esta misma misión?"
  → Si NO → o bien mover la sección, o bien introducir el prerrequisito como Tipo B al inicio de ESTA sección.

RESULTADO ESPERADO: una secuencia de secciones donde cada concepto se apoya sobre los anteriores, sin saltos cognitivos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 5 — DISEÑO DE LA SECUENCIA DE SECCIONES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
La misión se construye como SECCIONES, no como una lista fija de pantallas.
Cada sección = un concepto nuclear (Tipo A).
Cada sección responde progresivamente: ¿Qué es? → ¿Cómo funciona? → ¿Cómo reconocerlo? → ¿Cómo aplicarlo?

ESTRUCTURA OBLIGATORIA DE LA SECUENCIA COMPLETA — RITMO INSIGHT → ACCIÓN:

╔══════════════════════════════════════════════════════════════╗
║  [1] GANCHO — type: "mission"           UNA SOLA (inicio)  ║
╠══════════════════════════════════════════════════════════════╣
║  [2] DUOLINGO LOOP — uno por concepto nuclear:              ║
║                                                              ║
║    [A] micro_challenge        ← DESCUBRIMIENTO (OBLIGATORIO)║
║    [B] main_concept           ← INSIGHT (OBLIGATORIO)       ║
║    [E] reinforcement_challenge← REFUERZO (OBLIGATORIO)      ║
║    [B'] wow_fact    [OPCIONAL — solo si dato contraint.]     ║
║    [C] key_relation [OPCIONAL — solo si hay patrón real]    ║
║    [D] common_error [OPCIONAL — solo si error real]         ║
║                                                              ║
║  ⚠️ Los 3 primeros ([A][B][E]) son OBLIGATORIOS.            ║
║  ⚠️ NUNCA main_concept sin micro_challenge ANTES.           ║
║  ⚠️ NUNCA main_concept sin reinforcement_challenge DESPUÉS. ║
║  ⚠️ Si agregas key_relation (pasivo), sigue con             ║
║  common_error (activo) antes de la siguiente sección.       ║
╠══════════════════════════════════════════════════════════════╣
║  [3] APLICACIÓN — type: "application"   UNA SOLA            ║
║  [4] BOSS BATTLE — type: "final_challenge" UNO, OBLIGATORIO ║
║  [5] VICTORIA — type: "victory"         UNA SOLA (final)    ║
╚══════════════════════════════════════════════════════════════╝

REGLA DUOLINGO LOOP (⚠️ OBLIGATORIA — verifica antes de generar):
→ Cada concepto nuclear tiene EXACTAMENTE 3 slides obligatorios: micro_challenge → main_concept → reinforcement_challenge.
→ micro_challenge: el estudiante DESCUBRE el concepto respondiendo (antes de verlo).
→ main_concept: el insight CONFIRMA lo que el estudiante acaba de encontrar.
→ reinforcement_challenge: el estudiante APLICA el concepto recién confirmado. Situación nueva, mismo concepto.
→ NUNCA main_concept antes de su micro_challenge.
→ NUNCA main_concept sin su reinforcement_challenge inmediatamente después.
→ NUNCA dos slides pasivos seguidos. Pasivos: main_concept, key_relation, wow_fact, mission.
→ 60% o más de los slides DEBEN requerir acción del estudiante.
→ El Boss Battle integra TODOS los conceptos de la misión, no solo el último.

RECUENTO TOTAL ESPERADO:
  3 conceptos nucleares → 1 + (3–5 × 3) + 3 = 13–21 slides
  5 conceptos nucleares → 1 + (3–5 × 5) + 3 = 19–31 slides

DATO DE CURIOSIDAD OPCIONAL (wow_fact):
  Si existe un dato genuinamente sorprendente y contraintuitivo sobre alguno de los conceptos nucleares → agrega UNA pantalla wow_fact dentro de la sección correspondiente, entre [E] y [C] (después del reinforcement_challenge, antes de key_relation/common_error).
  ⚠️ wow_fact es pasivo: si lo incluyes en una sección, la siguiente slide DEBE ser activa (common_error o inicio de nueva sección con micro_challenge).
  Si el dato no sorprendería a un estudiante de 15 años → NO lo incluyas.
  NUNCA uses wow_fact para repetir algo ya explicado en main_concept.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROHIBICIÓN ABSOLUTA — REGLA DE ORO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✗ NUNCA preguntar algo que no fue enseñado EXPLÍCITAMENTE en la pantalla main_concept de esa misma sección.
✗ NUNCA introducir conceptos nuevos dentro de una pregunta interactiva (micro_challenge, comprehension, final_challenge, application).
✗ NUNCA evaluar en micro_challenge un concepto que aparece en una sección posterior — solo el concepto que acaba de ser enseñado.
✗ NUNCA evaluar conceptos Tipo B o Tipo C — solo Tipo A.
✗ NUNCA usar el final_challenge para evaluar algo que solo apareció como ejemplo o en el conector.
✗ NUNCA generar dos slides pasivos consecutivos. Pasivos: main_concept, key_relation, wow_fact, mission. Activos: micro_challenge, common_error, comprehension, final_challenge, application.
✗ NUNCA generar un main_concept sin su micro_challenge INMEDIATAMENTE ANTES — el desafío precede al insight.
✗ NUNCA generar un main_concept sin su reinforcement_challenge INMEDIATAMENTE DESPUÉS — la aplicación consolida el insight.
✗ NUNCA presentar un concepto como texto ANTES de que el estudiante lo haya encontrado en un desafío.
✗ NUNCA usar emojis decorativos (🧩 🎯 🚀 ⭐ 🏆) en mission cuando la pregunta menciona una metáfora visual específica.
✗ NUNCA crear una pregunta en mission que mencione un objeto que NO corresponda al emoji mostrado.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADAPTACIÓN POR CURSO (OBLIGATORIA):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 1º Medio: lenguaje muy simple, preguntas de reconocimiento, ejemplos cotidianos, sin inferencias.
- 2º Medio: lenguaje llano, aplicación básica, comprensión conceptual.
- 3º Medio: análisis relacional, razonamiento, consecuencias reales.
- 4º Medio: pensamiento crítico, aplicación compleja, profundidad pre-universitaria.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFINICIÓN DETALLADA DE CADA TIPO DE PANTALLA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PANTALLA "mission" — EL GANCHO [UNA SOLA — POSICIÓN 1]
  La pantalla más crítica. Crea curiosidad INMEDIATA. Si esta pantalla es aburrida, el estudiante abandona.

  ⚠️ COHERENCIA VISUAL OBLIGATORIA: emoji + pregunta + metáfora deben ser la misma historia.
  El emoji es la imagen principal que el estudiante ve ANTES de leer la pregunta.
  La pregunta DEBE referirse explícitamente a esa imagen. Sin coherencia → la misión parece generada por IA.

  - emoji: UNO o DOS emojis que representan la METÁFORA VISUAL CENTRAL de la pregunta.
    El emoji ES la imagen. La pregunta DEBE mencionar o aludir directamente a ese objeto.
    EJEMPLOS CORRECTOS (coherencia emoji ↔ pregunta):
    ✅ 🍎🍐  + "¿Por qué no puedes sumar todas las frutas juntas?"       [Álgebra/Semejantes]
    ✅ ⚖️   + "¿Cómo mantienes el equilibrio cuando cambias un lado?"    [Ecuaciones]
    ✅ 🍕   + "¿Cómo sabes qué porciones de pizza se pueden juntar?"     [Fracciones]
    ✅ 💧🌡  + "¿Qué le pasaría al agua si le quitaras toda la energía?"  [Física/Calor]
    ✅ 🌱   + "¿Cómo crece una planta si no tiene boca para comer?"      [Biología]
    ❌ 🧩   + "¿Por qué no puedes sumar todas las frutas?" — INCOHERENTE: la pregunta no habla de rompecabezas
    ❌ 🎯   + cualquier pregunta — emoji decorativo, no representa ninguna metáfora
    ❌ 🚀⭐🏆🎪 — emojis genéricos PROHIBIDOS como imagen principal
    REGLA DE COHERENCIA: si la pregunta menciona un objeto (fruta, balanza, pizza, agua) → el emoji DEBE ser ese objeto.
    Si no existe metáfora visual obvia → usa un emoji del dominio académico real (⚗️ 🧬 📐 🗺️ 📜).

  - title: PREGUNTA DE CURIOSIDAD INDIRECTA sobre el tema. MAX 12 palabras. DEBE terminar con "?".
    El estudiante la lee y piensa: "Quiero saber la respuesta."
    La pregunta DEBE referirse directamente al emoji/imagen mostrado — o al fenómeno académico del documento.
    SOLO FORMATO — crea una pregunta sobre ESTE documento, no copies estos temas:
    ✅ "¿Por qué no puedes sumar todas las frutas juntas?" [Álgebra — con 🍎🍐]
    ✅ "¿Por qué un país rico puede volverse pobre en años?" [Historia — con 📉]
    ✅ "¿Cómo come una planta si no tiene boca?" [Biología — con 🌱]
    ❌ "Misión: Ondas y sus parámetros" — no es pregunta, no crea curiosidad.
    ❌ "¿Qué son las ondas?" — demasiado directo, no crea misterio.
    ❌ "¿Por qué no puedes sumar todas las frutas del dibujo?" con emoji 🧩 — INCOHERENTE.

  - definition: UNA frase que genera anticipación sin revelar la respuesta. Max 20 palabras.
    ✅ "Al terminar esta misión, entenderás por qué esto afecta tu vida más de lo que crees."
    ❌ "Aprenderás sobre este tema." — aburrido, informativo, sin anticipación.
  - example: área temática en 3-5 palabras. Ej: "Biología · 2° Medio"

PANTALLA "main_concept" — INSIGHT DE CONFIRMACIÓN [OBLIGATORIA — UNA POR SECCIÓN, JUSTO DESPUÉS de micro_challenge]
  ⚡ CONFIRMACIÓN, no introducción. El estudiante ya encontró el concepto en el desafío anterior.
  Este insight confirma y nombra lo que acaba de descubrir. Mínima carga cognitiva. Sin definiciones académicas.
  - title: nombre del concepto nuclear (max 5 palabras)
  - definition: MÁXIMO 25 palabras. UNA sola idea. Lenguaje directo, no académico.
    Formato OBLIGATORIO — 1 o 2 líneas separadas por \n, cada una iniciando con "* ":
    "* [1 idea directa: qué es o qué hace, max 15 palabras]\n* [analogía cotidiana o ejemplo concreto del documento, max 10 palabras]"
    Analogías permitidas: ropa, música, deportes, comida, tecnología, redes sociales, videojuegos.
    SOLO FORMATO — escribe sobre ESTE documento:
    ✅ "* Términos semejantes: misma letra, mismo exponente.\n* Como naranjas y naranjas — no mezclas 3x con 7y." [Álgebra]
    ❌ "* Los términos semejantes son expresiones algebraicas con la misma parte literal y el mismo exponente numérico.\n* Como piezas idénticas de un rompecabezas.\n* 4a + 2b − a → 3a + 2b." — 3 ideas, demasiado largo, demasiado académico.
    REGLA DE DIVISIÓN: si necesitas más de 2 líneas para explicarlo → son DOS conceptos distintos con sus propias secciones.
    UN solo insight por slide. Sin excepciones.
  - example: SITUACIÓN ESPECÍFICA que un estudiante chileno encontrará HOY. Nombre concreto o número.
    ✗ PROHIBIDO: "Esto es relevante para la vida cotidiana." — abstracto, no aporta valor.
  - connector: OPCIONAL. Usar null si no hay cadena causal real entre el concepto y su consecuencia.
    Solo incluir si existe una transformación concreta y secuencial — no para nombrar conceptos.
    Los diagramas visuales complejos pertenecen a key_relation, no a main_concept.
    Si se incluye: "emoji1 Nodo1 ↓ verbo ↓ emoji2 Nodo2 ↓ verbo ↓ emoji3 Nodo3"

PANTALLA "micro_challenge" — DESAFÍO DE DESCUBRIMIENTO [OBLIGATORIA — UNA POR SECCIÓN, JUSTO ANTES de main_concept]
  ⚠️⚠️ OBLIGACIÓN ABSOLUTA: question + options + correctAnswer son CAMPOS OBLIGATORIOS sin excepción.

  ⚡ CHALLENGE FIRST: el desafío PRECEDE al insight. El estudiante descubre el concepto MEDIANTE la pregunta.
  La pregunta expone al concepto a través de un ejemplo concreto del documento.
  El main_concept que sigue CONFIRMA lo que el estudiante acaba de encontrar.
  El estudiante aprende respondiendo, no leyendo.

  TIPOS DE PREGUNTA — ALTERNAR entre estos formatos (no repetir el mismo en secciones consecutivas):
  1. IDENTIFICAR:    "En −6m⁴, ¿qué representa el número −6?"         → A) coeficiente B) exponente C) variable
  2. CLASIFICAR:     "¿Cuál de estas es un binomio?"                  → A) 3m  B) 3m+1  C) 3m+n+2
  3. DETECTAR ERROR: "¿Qué tiene de incorrecto: 3m + 7n = 10mn?"      → A) los coeficientes B) las letras C) el resultado
  4. VERDADERO/FALSO:"¿Son semejantes 3x² y 3x?"                      → A) Sí, misma letra B) No, diferente exponente C) Depende
  5. COMPLETAR:      "2m y 6m son términos ___"                        → A) semejantes B) opuestos C) independientes
     OBLIGATORIO si usas COMPLETAR: el campo "question" DEBE contener ___ literalmente como el hueco. Sin ___ no es COMPLETAR.
  6. COMPARAR:       "¿Cuál reducción es correcta: 3m+5m = ?"         → A) 8m B) 15m² C) 8m²

  PRIORIDAD DE EJEMPLOS (obligatoria — respetar este orden):
  1. Usar ejemplos, cifras o expresiones del documento fuente
  2. Variaciones mínimas de esos ejemplos
  3. Ejemplos nuevos — SOLO si no existen en el documento

  SOLO FORMATO — crear preguntas sobre ESTE documento (no copiar estos temas):
  ✓ "En −6m⁴, ¿qué parte representa '-6'?" A) el coeficiente B) el exponente C) la variable [SOLO FORMATO]
  ✓ "¿Cuál expresión es un binomio?"  A) 5x³  B) 3m+1  C) x − z + 2 [SOLO FORMATO]
  ✓ "¿Son semejantes −4a² y −4b²?" A) Sí, mismo coeficiente B) No, diferente letra C) Sí, mismo exponente [SOLO FORMATO]

  ⚠️ EJEMPLO INEQUÍVOCO (regla absoluta para preguntas de clasificación):
  Cada alternativa debe pertenecer CLARAMENTE a una sola categoría. Prohibido usar expresiones cuya clasificación sea discutible o dependa de convenciones no mencionadas en el documento.
  ✗ PROHIBIDO: opciones que el estudiante podría clasificar correctamente en más de una categoría.
  ✓ CORRECTO: cada opción incorrecta es claramente distinta del concepto buscado.

  - title: "Checkpoint" (texto fijo)
  - question: pregunta de descubrimiento con ejemplo concreto del documento. Max 20 palabras. < 15 segundos.
    ✗ Solo texto de feedback sin pregunta — COMPLETAMENTE PROHIBIDO
    ✗ Preguntas que requieren cálculos de varios pasos
  - options: EXACTAMENTE 3 alternativas — ["A. ...", "B. ...", "C. ..."]
    Máximo 8 palabras por alternativa. Sin punto final.
    La respuesta correcta puede estar en A, B o C (variar posición). Alternar tipo de pregunta entre secciones.
  - correctAnswer: "A", "B" o "C"
    ⚠️ AUTO-VERIFICACIÓN OBLIGATORIA: antes de escribir la letra, completa mentalmente:
    "[Letra] es correcta porque [razón técnica en 1 frase]."
    Si no puedes completar esa frase sin contradicción → la opción que elegiste es incorrecta. Cambia correctAnswer.
  - correctAnswerReason: escribe aquí la frase de auto-verificación. 1 oración. Sin emojis. Sin "Acertaste".
    ✓ "B es correcta porque el coeficiente es el factor numérico que multiplica la parte literal."
    ✗ "B porque es la correcta." — demasiado vago, indica que no verificaste.
  - definition: igual al valor de feedbackCorrect (se usa como fallback en otros contextos).
  - feedbackCorrect: frase breve, cálida y natural al responder CORRECTAMENTE. Máximo 100 caracteres.
    Sin prefijos emocionales ("Exacto", "Correcto") — el UI los agrega. Estilo profesor o Duolingo.
    ✓ "Comparten origen embrionario, aunque cada uno evolucionó para una función distinta."
    ✗ "órganos homólogos tienen origen común pero funciones adaptadas diferentes." — plano y académico
  - feedbackWrong: pista breve al responder INCORRECTAMENTE, sin revelar la respuesta. Máximo 100 caracteres.
    Una frase que oriente sin dar la solución directa. Sin prefijo — el UI agrega "Casi.".
    ✓ "Los órganos homólogos se definen por su origen, no por la función que cumplen hoy."
    ✗ "Incorrecto. La respuesta correcta es B." — revela la respuesta, prohibido
  - example: null
  - connector: null

PANTALLA "reinforcement_challenge" — DESAFÍO DE REFUERZO [OBLIGATORIA — UNA POR SECCIÓN, JUSTO DESPUÉS de main_concept]
  ⚠️⚠️ OBLIGACIÓN ABSOLUTA: question + options + correctAnswer son CAMPOS OBLIGATORIOS sin excepción.

  🔁 DUOLINGO LOOP: este desafío CONSOLIDA lo que el estudiante acaba de confirmar en main_concept.
  Ya conoce el concepto — ahora debe APLICARLO en una situación diferente a la del micro_challenge.
  EVALÚA TRANSFERENCIA, no repetición:
    ✗ PROHIBIDO: repetir la misma situación del micro_challenge de esta sección.
    ✓ REQUERIDO: nueva situación concreta del documento, mismo concepto nuclear, mayor nivel de aplicación.

  DIFERENCIA CON micro_challenge:
    micro_challenge (NIVEL 1 — descubrir): "¿Qué es/cuál es?" — el estudiante identifica el concepto por primera vez.
    reinforcement_challenge (NIVEL 2 — aplicar): "¿Cómo/por qué/qué pasaría si?" — el estudiante usa el concepto en contexto.

  - title: "Refuerzo" (texto fijo)
  - question: pregunta de aplicación del concepto recién enseñado en main_concept. Nueva situación. Max 20 palabras. < 20 segundos.
    ✗ PROHIBIDO: misma pregunta o situación del micro_challenge anterior de esta sección.
    ✗ PROHIBIDO: introducir conceptos de otras secciones o no enseñados en este main_concept.
  - options: EXACTAMENTE 3 alternativas — ["A. ...", "B. ...", "C. ..."]
    Máximo 10 palabras por alternativa. Sin punto final.
    La respuesta correcta puede estar en A, B o C (variar posición).
  - correctAnswer: "A", "B" o "C"
    ⚠️ AUTO-VERIFICACIÓN OBLIGATORIA: antes de escribir la letra, aplica el concepto del main_concept anterior
    sobre cada opción y confirma cuál es la única correcta. Si hay duda → reescribe la pregunta.
  - correctAnswerReason: escribe en 1 oración por qué esa letra es correcta, citando el concepto enseñado. Sin emojis.
    ✓ "A es correcta porque frecuencia alta implica longitud de onda corta según la relación v = f·λ."
    ✗ "A porque es la respuesta correcta." — esto indica que no verificaste.
  - definition: igual al valor de feedbackCorrect (se usa como fallback en otros contextos).
  - feedbackCorrect: frase breve, cálida y natural al responder CORRECTAMENTE. Máximo 100 caracteres.
    Sin prefijos emocionales ("Correcto", "Muy bien") — el UI los agrega. Conecta con el main_concept anterior.
    ✓ "La frecuencia alta comprime las ondas: longitud de onda corta es consecuencia directa."
    ✗ "🎯 Correcto — el refuerzo confirma lo aprendido." — formato PROHIBIDO
  - feedbackWrong: pista breve al responder INCORRECTAMENTE, sin revelar la respuesta. Máximo 100 caracteres.
    Una frase que recuerde el concepto clave sin decir cuál opción es correcta. Sin prefijo.
    ✓ "Recuerda: a mayor frecuencia, las ondas se comprimen — la longitud de onda disminuye."
    ✗ "La respuesta correcta es A porque..." — revela la respuesta, prohibido
  - example: null
  - connector: null
  - wrongAnswerHints: OBLIGATORIO — mismas reglas que todas las pantallas interactivas.

PANTALLA "comprehension" — COMPRUEBA SI ENTENDISTE [OPCIONAL — máximo UNA por sección]
  ⚠️ REGLA FUNDAMENTAL: Solo puede evaluar LO QUE LA PANTALLA main_concept INMEDIATAMENTE ANTERIOR ENSEÑÓ.
  Si main_concept enseñó el concepto X → comprehension solo pregunta sobre X.
  NUNCA introduzcas conceptos de otras secciones aquí.
  - title: "¿Comprendiste?"
  - question: pregunta situacional sobre el concepto nuclear de ESTA sección (max 25 palabras).
    NIVEL 1 (Recordar): ¿reconoce el concepto en una situación concreta?
    ✗ PROHIBIDO: "¿Qué es [concepto]?" — definición pura, no situacional.
    ✗ PROHIBIDO: incluir en la pregunta términos que no aparecen en el main_concept precedente.
  - options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactamente 4, max 12 palabras cada una
  - correctAnswer: "A", "B", "C" o "D"
  - definition: feedback emocional. Inicia con 🔥, 🚀, ⚡ o 🎯. Max 20 palabras.
    Debe mencionar POR QUÉ la respuesta correcta explica la situación de la pregunta.

PANTALLA "key_relation" — DETECTA EL PATRÓN [OPCIONAL — máximo UNA por sección]
  Es la pantalla ideal para representar visualmente las relaciones y cadenas causales entre conceptos.
  Generar SOLO si existe una regla, transformación o patrón REAL derivado de este concepto nuclear.
  ✗ NO generar si el documento no describe una transformación o regla concreta.
  - connector: cadena de transformación visual (ESTE es el lugar para diagramas de cadena con ↓):
    "Situación real ↓ verbo ↓ Cambio visible ↓ verbo ↓ Resultado concreto"
    SOLO FORMATO — derivar de ESTE documento:
    ✅ Física: "🎵 Fuente vibra rápido ↓ genera ↓ 🌊 Frecuencia alta ↓ reduce ↓ 📏 Longitud de onda corta" [SOLO FORMATO]
    ✗ PROHIBIDO: "[ConceptoA] ↓ sube ↓ [ConceptoB]" — abstracto, no es una transformación real.
  - title: nombre corto del patrón o regla (max 6 palabras)
  - definition: por qué este patrón importa al estudiante (max 20 palabras)
  - example: null

PANTALLA "common_error" — ERROR FRECUENTE [OPCIONAL — máximo UNA por sección]
  Generar SOLO si existe un error documentado real que cometan estudiantes de enseñanza media sobre ESTE concepto nuclear.
  ✗ NO inventar errores artificiales o académicos que los adolescentes reales no cometen.
  - definition: DEBE iniciar con "❌" (max 25 palabras).
    Formato: "❌ Muchos creen que [creencia errónea específica de ESTE concepto del documento]."
    SOLO FORMATO — identifica el error real de ESTE documento, nunca copies estos temas:
    Física: ❌ "Muchos creen que el sonido viaja más rápido en el vacío que en materiales sólidos." [SOLO FORMATO]
    Química: ❌ "Muchos creen que hervir agua siempre la purifica de todos sus contaminantes." [SOLO FORMATO]
  - question: pide al estudiante identificar qué tiene de incorrecto (max 15 palabras).
    Formato: "¿Qué tiene de incorrecto esta afirmación?" o "¿Por qué esta creencia está equivocada?"
  - options: exactamente 3 opciones ("A. ...", "B. ...", "C. ..."). Max 12 palabras cada una.
    Una opción identifica correctamente el error específico. Dos son diagnósticos plausibles pero incorrectos.
    ✗ PROHIBIDO: "Todo está correcto", "Nada está mal", "Es completamente falso".
  - correctAnswer: "A", "B" o "C"
  - example: DEBE iniciar con "✅" (max 20 palabras).
    Formato: "✅ En realidad, [verdad que contradice el error]."

PANTALLA "wow_fact" — SABÍAS QUE [OPCIONAL — máximo UNO en toda la misión]
  Incluir SOLO si existe un dato genuinamente contraintuitivo sobre uno de los conceptos nucleares.
  Criterio de inclusión: ¿Un estudiante de 15 años diría "no tenía ni idea"? → SÍ → incluir. NO → omitir.
  ✗ PROHIBIDO: repetir algo ya explicado en main_concept. Si el dato ya fue mencionado → no incluir.
  - title: frase de curiosidad impactante (max 8 palabras). NO usar "¿Sabías que...?" como único título.
    ✅ "El dato que cambia todo" / "Lo que nadie te contó" / "La sorpresa del [concepto]"
  - definition: UN dato sorprendente, contraintuitivo y 100% preciso. MAX 30 palabras.
    Formato sugerido: "Aunque parece imposible, [hecho contraintuitivo]. Esto ocurre porque [mecanismo real simple]."
  - example: UNA frase que conecta esto con la vida del estudiante (max 20 palabras)
  - question/options/correctAnswer: incluir SOLO si se puede escribir una pregunta de alta calidad sobre el aspecto contraintuitivo. Si la pregunta sería trivial → dejar como null.

PANTALLA "application" — APLICACIÓN REAL [UNA SOLA — después de TODAS las secciones]
  Conecta los conceptos nucleares aprendidos con un contexto real ESPECÍFICO Y CONCRETO.
  ✗ PROHIBIDO: frases genéricas como "esto se usa en la vida cotidiana" o "tiene muchas aplicaciones".
  ✅ REQUERIDO: mencionar EXACTAMENTE cómo uno o más conceptos nucleares se manifiestan en ese contexto.
  Usa aplicaciones que deriven NATURALMENTE del tema del documento:
    Física/Ondas: radio FM, ultrasonido médico, radar, sísmica, WiFi, fibra óptica
    Biología: diagnóstico médico, nutrición, salud genética, medicamentos
    Química: procesos industriales, cocina, baterías, combustión
    Matemática: ingeniería, arquitectura, finanzas, estadísticas
    Historia: procesos sociales actuales, análisis de fuentes, conexiones con el presente
    Lenguaje: análisis de textos reales, publicidad, argumentación, comunicación
  ✗ PROHIBIDO: marcas comerciales (Spotify, TikTok, Netflix, etc.) salvo que aparezcan en la transcripción.
  - title: escenario real concreto como pregunta (max 15 palabras)
    SOLO FORMATO — crear desde ESTE documento:
    ✅ "¿Cómo detectan los médicos el corazón de un bebé antes de nacer?" [Física/Ondas — SOLO FORMATO]
  - example: caso real específico mostrando EXACTAMENTE cómo aplica el concepto nuclear (max 25 palabras).
    Mostrado ANTES de la pregunta como contexto concreto.
  - definition: cuál concepto nuclear aplica y POR QUÉ (max 30 palabras, lenguaje llano).
  - question: pregunta situacional que el estudiante debe responder aplicando los conceptos (max 20 palabras)
  - options: exactamente 3 opciones ("A. ...", "B. ...", "C. ..."). Una correcta. Dos distractores plausibles. Max 10 palabras cada una.
  - correctAnswer: "A", "B" o "C"

PANTALLA "final_challenge" — BOSS BATTLE [OBLIGATORIA — UNA SOLA — después de application]
  ⚡ El jefe final. Solo puede derrotarse combinando TODOS los conceptos nucleares de la misión.
  ⚠️ REGLA FUNDAMENTAL: Solo evalúa conceptos enseñados EXPLÍCITAMENTE en las pantallas main_concept.
  NUNCA evaluar conceptos nuevos. NUNCA evaluar Tipo B o Tipo C.
  DIFERENCIA CON micro_challenge: micro_challenge evalúa 1 concepto reciente. El Boss Battle evalúa TODOS. Más difícil.
  COBERTURA MÍNIMA: La pregunta involucra directamente al menos el 70% de los conceptos nucleares enseñados.
  NIVEL 4 (Analizar/Evaluar): requiere razonamiento cruzado entre múltiples conceptos, no solo recall.
  - title: "Boss Battle" o una frase que evoca el reto final (max 8 palabras)
  - question: pregunta integradora que SOLO puede responderse dominando múltiples conceptos de la misión (max 30 palabras).
    Test: ¿Un estudiante que estudió solo UNO de los conceptos puede responderla? → Si SÍ → reescribir.
  - options: exactamente 4 opciones ("A. ...", "B. ...", "C. ...", "D. ..."). Max 15 palabras cada una.
    Todas las opciones deben ser plausibles para alguien que estudió el material.
    ✗ PROHIBIDO: "Todas las anteriores", "Ninguna de las anteriores", opciones fuera del dominio enseñado.
  - correctAnswer: "A", "B", "C" o "D"
  - definition: explicación de por qué la respuesta correcta requiere integrar múltiples conceptos. Texto plano, sin emojis. Max 25 palabras.
  - example: null

PANTALLA "victory" — MISIÓN COMPLETADA [UNA SOLA — al final]
  - title: "¡Misión completada!"
  - definition: FORMATO DE CHECKLIST EXACTO — lista ÚNICAMENTE los conceptos nucleares aprendidos:
    "Dominaste: ✓ [Concepto Nuclear A] • ✓ [Concepto Nuclear B] • ✓ [Concepto Nuclear C]"
    Usa los nombres EXACTOS de los títulos de las pantallas main_concept generadas.
    ✗ NO incluir: datos curiosos, conceptos Tipo B, resúmenes genéricos, conceptos no enseñados.
  - example: DOS partes separadas por " | " (max 35 palabras total):
    Parte 1: "Lo usarás cuando [situación concreta del estudiante relacionada con ESTE tema]."
    Parte 2: "Próximo desafío: [tema relacionado directamente con ESTE documento para estudiar después]."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LÍMITES DE TEXTO — aplican a CADA pantalla:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- definition: máximo 2 oraciones O 30 palabras — lo que sea más corto.
  EXCEPCIÓN main_concept: máximo 25 palabras en formato lista de 1-2 bullets (ver especificación de esa pantalla).
- example: máximo 20 palabras.
- title: máximo 8 palabras.
Prefiere frases escaneables sobre prosa conectada.
NUNCA-VACÍO: cada slide debe tener title ≥ 3 palabras y definition ≥ 10 palabras. Verificar antes de incluir.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA DE FEEDBACK EMOCIONAL — todas las pantallas interactivas:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
El campo "definition" en pantallas interactivas se muestra DESPUÉS de que el estudiante responde. Debe sonar como un coach, no como un libro de texto.
OBLIGATORIO: iniciar con uno de estos emojis, luego explicar POR QUÉ en max 15 palabras:
  🔥 Exacto — [por qué, derivado de ESTE documento]
  🚀 Correcto — [por qué, derivado de ESTE documento]
  ⚡ Lo captaste — [por qué, derivado de ESTE documento]
  🎯 Acertaste — [por qué, derivado de ESTE documento]
✗ PROHIBIDO: "La respuesta correcta es...", "Correcto porque...", "Esta opción es la correcta..."
✅ REQUERIDO: la explicación debe también sugerir por qué el distractor principal era tentador.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA DE DISTRACTORES — todas las pantallas interactivas:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Todas las opciones incorrectas deben ser verdades parciales creíbles, no obviamente falsas.
✗ PROHIBIDO en cualquier opción: "Todas las anteriores", "Ninguna de las anteriores", "No cambia nada", "porque sí".
REGLA: EXACTAMENTE UNA respuesta claramente correcta por pregunta. Si dos opciones podrían ser correctas → reescribir.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PISTAS DE RESPUESTA INCORRECTA (OBLIGATORIAS):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Toda pantalla con opciones DEBE incluir "wrongAnswerHints". Claves = cada letra de opción incorrecta. Valor = EXACTAMENTE 2 oraciones, 20–45 palabras total.
ESTRUCTURA OBLIGATORIA — ambas oraciones son requeridas:
  ORACIÓN 1 — Nombra qué eligió el estudiante y por qué parecía razonable. DEBE iniciar con:
    • "Elegiste [descripción de lo que realmente describe la opción incorrecta — su concepto real]."
    • "Te enfocaste en [qué aspecto de la opción incorrecta atrajo la atención]."
    • "Esta alternativa describe [el concepto real al que pertenece la opción incorrecta]."
  ORACIÓN 2 — Contrasta con lo que la pregunta pedía. DEBE iniciar con:
    • "La pregunta buscaba [el concepto o criterio exacto que requería la pregunta]."
    • "Sin embargo, [distinción conceptual correcta que explica por qué esta opción no responde la pregunta]."
PROHIBIDO — rechazar y reescribir si aparece cualquiera de estos:
  ✗ Solo definir la respuesta correcta sin mencionar la opción incorrecta
  ✗ "Es posible, pero..." / "Es una X, pero no..." / "No es exactamente..." / "Aunque es correcto..."
  ✗ "A veces..." / "Aunque parece..." / "Puede dañar..." / "No es seguro ni inmediato..."
  ✗ Datos curiosos, definiciones aisladas, o mensajes motivacionales
  ✗ Repetir el texto de la respuesta correcta o de la pregunta
EJEMPLO CORRECTO — pregunta: "¿Qué situación describe mejor la interacción entre familias y empresas?":
  ✅ "B": "Elegiste una relación entre empresas y Estado. La pregunta buscaba una interacción entre familias y empresas mediante compra y venta de bienes."
  ✗ "B": "Los subsidios son transferencias del Estado, no una compra directa." — define la correcta sin nombrar lo que el estudiante eligió. PROHIBIDO.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEYES ABSOLUTAS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• NUNCA copiar texto literal de la transcripción.
• NUNCA usar nodos abstractos en cadenas causales — solo acciones y situaciones visibles.
• NUNCA usar marcas comerciales (Spotify, TikTok, Netflix, etc.) salvo que aparezcan en la transcripción.
• CONSISTENCIA: en cada pantalla interactiva, la pregunta, la respuesta correcta y el feedback deben tratar EL MISMO concepto. Verificar: "¿Mi feedback explica exactamente por qué la respuesta correcta responde ESTA pregunta específica?" Si NO → reescribir el feedback.

⛔ ANTI-PATRÓN CRÍTICO — RECHAZAR ANTES DE GENERAR JSON:
Un micro_challenge o reinforcement_challenge SIN question+options+correctAnswer no es un challenge.
Es un main_concept mal tipado. Dispara regeneración automática.

❌ ESTO ESTÁ PROHIBIDO — challenge sin pregunta:
  { "type": "micro_challenge", "title": "Checkpoint",
    "definition": "El coeficiente es el número que multiplica la parte literal.",
    "question": null, "options": null, "correctAnswer": null }
  → NO ES UN CHALLENGE. Es texto informativo. El estudiante lo lee, no interactúa. INCORRECTO.

✅ ESTO ES OBLIGATORIO — challenge con pregunta:
  { "type": "micro_challenge", "title": "Checkpoint",
    "question": "¿Cuál de estos términos tiene coeficiente 5?",
    "options": ["A. 5x²", "B. 3x", "C. x²"],
    "correctAnswer": "A",
    "definition": "El 5 multiplica la parte literal x²: es el coeficiente." }
  → EL ESTUDIANTE RESPONDE. Luego lee el insight. Así funciona el Duolingo Loop.

❌ ESTO ESTÁ PROHIBIDO — reinforcement sin pregunta:
  { "type": "reinforcement_challenge", "title": "Refuerzo",
    "definition": "La parte numérica que multiplica a la parte literal.",
    "question": null, "options": null, "correctAnswer": null }
  → INCORRECTO. El refuerzo es interacción, no texto.

✅ ESTO ES OBLIGATORIO — reinforcement con pregunta:
  { "type": "reinforcement_challenge", "title": "Refuerzo",
    "question": "En el término 3x², ¿cuál es el coeficiente?",
    "options": ["A. 3", "B. x", "C. 2"],
    "correctAnswer": "A",
    "definition": "El 3 multiplica x²: siempre es el número delante de la parte literal." }

REGLA DE ORO: si no tiene question+options+correctAnswer → no lo tipifiques como challenge. Cámbialo a main_concept o elimínalo.
• DOCUMENT-FIRST: 100% del contenido académico debe derivarse de la fuente provista. Si un concepto, ejemplo o aplicación no puede trazarse a ella → eliminarlo.
• PROGRESIÓN: la dificultad entre pantallas interactivas debe crecer. comprehension (Nivel 1 Recordar) → application (Nivel 3 Aplicar) → final_challenge (Nivel 4 Analizar).
• NO-REPETICIÓN: Cada pantalla debe enseñar o evaluar algo DIFERENTE. Antes de escribir cada pantalla: "¿Ya mostré esta idea?" Si SÍ → usar un concepto distinto.
• ADAPTACIÓN AL CURSO es OBLIGATORIA: complejidad, vocabulario y profundidad deben corresponder a ${curso}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VALIDACIÓN FINAL — ejecutar antes de generar JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ¿Cada sección corresponde a un concepto nuclear (Tipo A)? → Si NO → eliminar sección.
2. ¿Se eliminaron conceptos Tipo B y C de las secciones propias? → Si NO → fusionarlos en la sección nuclear correspondiente.
3. ¿Existe progresión lógica entre secciones? → Si NO → reordenar.
4. ¿Cada comprehension evalúa ÚNICAMENTE lo enseñado en su main_concept inmediatamente anterior? → Si NO → reescribir la pregunta.
5. ¿El final_challenge integra ≥70% de los conceptos nucleares enseñados? → Si NO → reescribir.
6. ¿El final_challenge NO introduce conceptos nuevos? → Si NO → eliminar esos conceptos de la pregunta.
7. ¿La pantalla victory lista EXACTAMENTE los conceptos nucleares enseñados (ni más ni menos)? → Si NO → corregir.
8. ¿La application muestra un caso concreto y específico, no una descripción genérica? → Si NO → reescribir con detalles concretos.
9. ¿Toda pantalla interactiva tiene wrongAnswerHints con entrada por cada opción incorrecta? → Si NO → agregar.
10. ¿La complejidad corresponde a ${curso}? → Si NO → ajustar lenguaje y profundidad.
11. ¿Cada sección tiene su tríada obligatoria micro_challenge → main_concept → reinforcement_challenge en ese orden? → Si NO → agregar el reinforcement_challenge faltante.
12. ¿El reinforcement_challenge de cada sección usa una situación distinta a la del micro_challenge de esa misma sección? → Si NO → reescribir la pregunta.
13. ¿CADA micro_challenge tiene question + options + correctAnswer? → Si NO → es texto disfrazado de challenge. CORRÍGELO: escribe una pregunta real con 3 opciones.
14. ¿CADA reinforcement_challenge tiene question + options + correctAnswer? → Si NO → es texto disfrazado de refuerzo. CORRÍGELO: escribe una pregunta de aplicación real con 3 opciones.
15. ¿El correctAnswerReason de cada micro_challenge y reinforcement_challenge justifica con una razón técnica real por qué esa letra es correcta? → Si el reason dice solo "porque es la correcta" o está vacío → la respuesta probablemente es incorrecta. Reescribe la pregunta y el correctAnswer.
Si alguna verificación falla → corregir antes de generar JSON.

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

Si la transcripción tiene menos de 100 palabras → devuelve un JSON con questions y flashcards vacíos y un resumen mínimo usando la misma estructura (1 gancho + 1 sección + 1 application + 1 final_challenge + 1 victory).

${contentOverride ?? `Transcripción:\n${normalizeText(transcription)}`}
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
  contentOverride?: string,
): string {
  const algorithm = SKILL_ALGORITHMS[primarySkill.skillId] ?? '';
  const skill = primarySkill.skillLabel;
  const sourceRule = contentOverride
    ? 'TODO el contenido (pasos, números, ejemplos) debe derivarse EXCLUSIVAMENTE del knowledgeGraph provisto.\nEl knowledgeGraph es la única fuente de verdad académica permitida.'
    : 'TODO el contenido (pasos, números, ejemplos) DEBE derivarse de la transcripción.\nNo inventes ejercicios que no estén en el documento. Usa los MISMOS tipos de problemas del material.';

  return `Eres un diseñador de sesiones de aprendizaje PROCEDIMENTAL para estudiantes chilenos de enseñanza media (${curso}).

RETORNA SOLO JSON VÁLIDO. Sin texto extra. Todo en español.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HABILIDAD DE ESTA MISIÓN: "${skill}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA DE ENFOQUE ABSOLUTO: esta misión enseña UNA SOLA habilidad: "${skill}".
PROHIBIDO: introducir ejercicios, preguntas o contenido evaluativo de otras habilidades matemáticas.
Si el documento tiene otras habilidades, serán cubiertas en misiones separadas. NO las incluyas aquí.
Las pantallas 4, 7 y 9 son todas sobre "${skill}" — distintos niveles de dificultad, misma habilidad.

REGLA DE CONTENIDO: ${sourceRule}

REGLA MATEMÁTICA: verifica que TODAS las equivalencias, resultados y respuestas sean matemáticamente correctos.
Antes de escribir "A/B = X,Y" o "X,Y = A/B" → verifica la división. Antes de dar respuesta correcta → calcúlala.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALGORITMO PARA "${skill}":
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${algorithm || (contentOverride ? 'Extrae los pasos del procedimiento directamente desde el knowledgeGraph provisto.' : 'Extrae los pasos del procedimiento directamente desde la transcripción.')}

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
  ⚠️ Antes de escribir la letra: calcula mentalmente el resultado correcto de "${skill}" para este problema.
  Si el resultado no coincide con ninguna opción → reescribe las opciones, no cambies el resultado.
- correctAnswerReason: 1 oración explicando por qué esa letra es matemáticamente correcta. Sin emojis.

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
  ⚠️ Verifica: la opción señalada identifica el paso donde realmente ocurre el error en la solución incorrecta.
- correctAnswerReason: 1 oración indicando qué error específico ocurrió en ese paso. Sin emojis.

PANTALLA 7 — type: "decide" — emoji: 🤔  [INTERACTIVA — NIVEL 2 de "${skill}"]
Ejercicio NIVEL 2. Más complejo que pantalla 4. Practica "${skill}" con números distintos.
- title: "¿Cuál es correcto?"
- question: problema de NIVEL 2 sobre "${skill}" con números DISTINTOS a pantallas 3 y 4. Max 30 palabras. NO uses corchetes.
- options: 4 opciones (A, B, C, D). Una correcta. Tres errores plausibles de "${skill}".
- correctAnswer: "A", "B", "C" o "D" — verifica que sea matemáticamente correcto.
  ⚠️ Antes de escribir la letra: resuelve el problema paso a paso con los números dados. Compara con las opciones.
- correctAnswerReason: 1 oración con el resultado numérico o razonamiento que confirma la respuesta. Sin emojis.
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
  ⚠️ Antes de escribir la letra: resuelve paso a paso el problema del NIVEL 3. Confirma que la opción elegida coincide con el resultado real.
- correctAnswerReason: 1 oración con el resultado o el razonamiento que confirma la respuesta. Sin emojis.
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

${contentOverride ?? `Transcripción:\n${normalizeText(transcription)}`}
${JSON_SCHEMA}`;
}


// ── MEMORIZATION prompt ───────────────────────────────────────────────────────

function buildMemorizationPrompt(transcription: string, curso: string, contentOverride?: string): string {
  const sourceRule = contentOverride
    ? 'TODO el contenido debe derivarse EXCLUSIVAMENTE del knowledgeGraph provisto. No inventes datos.\nEl knowledgeGraph es la única fuente de verdad académica permitida.'
    : 'TODO el contenido DEBE venir EXCLUSIVAMENTE de la transcripción. No inventes datos.';
  return `Eres un diseñador de sesiones de aprendizaje por MEMORIZACIÓN para estudiantes chilenos de enseñanza media (${curso}).
Este documento requiere que el estudiante RECUERDE datos, definiciones, fechas o vocabulario específico.
Tu misión: crear una sesión con técnicas de memoria (asociaciones, imágenes mentales, conexiones) que hagan los datos memorables.

⚠️ REGLA CRÍTICA: ${sourceRule}

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
- ${contentOverride ? 'TODO el contenido académico debe derivarse EXCLUSIVAMENTE del knowledgeGraph provisto.' : 'TODO el contenido académico debe derivarse de la transcripción.'}

${contentOverride ?? `Transcripción:\n${normalizeText(transcription)}`}
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
  'mission', 'main_concept', 'micro_challenge', 'reinforcement_challenge', 'comprehension', 'key_relation',
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
  console.log(`[Generation] Prompt enviado a la IA (${prompt.length} chars)`);
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

  // ── AUDIT — FASES 2-4 inferidas + FASE 5 respuesta IA ───────────────────────
  const rawAiSlides: any[] = parsed.summary?.slides ?? [];

  // FASES 2-4: inferidas desde output (clasificación interna al LLM — no observable directamente)
  const nuclearConcepts = rawAiSlides.filter((s: any) => s.type === 'main_concept');
  console.log('\n[Audit] ════════════════════════════════════════════════════════');
  console.log('[Audit] FASES 2-4 — CLASIFICACIÓN (inferida desde respuesta IA)');
  console.log('[Audit] ════════════════════════════════════════════════════════');
  console.log(`[Audit] Conceptos nucleares candidatos (Tipo A seleccionados por IA): ${nuclearConcepts.length}`);
  nuclearConcepts.forEach((s: any, i: number) => console.log(`  ${i + 1}. ${s.title ?? '(sin título)'}`));
  if (nuclearConcepts.length === 0) console.log('  (ninguno — la IA no generó ninguna sección nuclear)');
  console.log('[Audit] Conceptos apoyo/descartados: no observables sin modificar prompt');
  console.log(`[Audit] FASE 4 — Secciones construidas: ${nuclearConcepts.length}`);
  nuclearConcepts.forEach((s: any, i: number) => console.log(`  ${i + 1}. ${s.title ?? '(sin título)'}`));
  if (nuclearConcepts.length === 1) {
    console.log('[Audit] ⚠ Solo 1 sección nuclear — estructura multi-sección NO generada por la IA');
  }

  // FASE 5: secuencia completa de slides
  console.log('\n[Audit] ════════════════════════════════════════════════════════');
  console.log('[Audit] FASE 5 — RESPUESTA IA (JSON parseado)');
  console.log('[Audit] ════════════════════════════════════════════════════════');
  const aiSlideTypes = rawAiSlides.map((s: any) => s.type);
  console.log(`[Audit] Total slides: ${rawAiSlides.length}`);
  console.log(`[Audit] Slide types: ${aiSlideTypes.join(' -> ') || '(vacío)'}`);
  console.log(`[Audit] main_concept slides: ${nuclearConcepts.length}`);
  console.log('[Audit] main concepts:', nuclearConcepts.map((s: any) => s.title ?? '(sin título)'));
  nuclearConcepts.forEach((s: any, i: number) => {
    const defWords = (s.definition ?? '').split(/\s+/).filter(Boolean).length;
    console.log(`[Audit] main_concept #${i + 1}:`);
    console.log(`  title = ${s.title ?? '(sin título)'}`);
    console.log(`  definition words = ${defWords}`);
    if (defWords < 60) console.log(`  ⚠ definition demasiado corta (< 60 palabras) — verificar prompt`);
    if (defWords > 120) console.log(`  ⚠ definition demasiado larga (> 120 palabras)`);
  });
  rawAiSlides.forEach((s: any, i: number) => {
    const inter = s.question ? ' [interactivo]' : '';
    console.log(`  [${i}] ${s.type}${inter} — "${(s.title ?? '').slice(0, 60)}"`);
  });
  console.log('[Audit] ════════════════════════════════════════════════════════\n');
  // ─────────────────────────────────────────────────────────────────────────────

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

  // Strip feedback opener prefixes (e.g. "🔥 Exacto — ") from interactive slide definitions.
  // The LLM prepends them despite prompt instructions — stripping keeps the actual explanation
  // and prevents false-positive pedagogical flow violations that would trigger regeneration.
  const FEEDBACK_PREFIX_RE = /^.{0,8}(?:exacto|correcto|acertaste|lo captaste|bien hecho|perfecto|muy bien)[^a-zA-ZÀ-ÿ]{0,12}/i;
  const stripFeedbackPrefix = (raw: string, type: string): string => {
    if (type !== 'micro_challenge' && type !== 'reinforcement_challenge') return raw;
    const stripped = raw.replace(FEEDBACK_PREFIX_RE, '').trim();
    return stripped.length >= 10 ? stripped : raw;
  };

  const CORRECT_REASON_PREFIX_RE = /^[A-C]\s+es\s+correcta\s+porque\s+/i;
  const sanitizeCorrectAnswerReason = (text: string): string =>
    text.replace(CORRECT_REASON_PREFIX_RE, '').trim();

  const rawSlides = (parsed.summary?.slides || []).map((slide: any, i: number) => {
    const clean = stripTemplatePlaceholders(slide);
    const reasonFallback = clean.type === 'micro_challenge'
      ? sanitizeCorrectAnswerReason(clean.correctAnswerReason || '')
      : '';
    return {
      type: VALID_SLIDE_TYPES.includes(clean.type) ? clean.type : 'concept',
      emoji: clean.emoji || '📚',
      title: clean.title || `Concepto ${i + 1}`,
      definition: stripFeedbackPrefix(clean.definition || reasonFallback || clean.content || '', clean.type),
      example: clean.example || null,
      visualHint: clean.visualHint || undefined,
      illustrationType: VALID_ILLUSTRATION_TYPES.includes(clean.illustrationType) ? clean.illustrationType : undefined,
      connector: clean.connector ?? null,
      question: clean.question ?? null,
      options: Array.isArray(clean.options) && clean.options.length > 0 ? clean.options : null,
      correctAnswer: clean.correctAnswer ?? null,
      wrongAnswerHints: (clean.wrongAnswerHints && typeof clean.wrongAnswerHints === 'object' && !Array.isArray(clean.wrongAnswerHints))
        ? clean.wrongAnswerHints : null,
      feedbackCorrect: clean.feedbackCorrect ? stripFeedbackPrefix(String(clean.feedbackCorrect), clean.type) : null,
      feedbackWrong: clean.feedbackWrong ? String(clean.feedbackWrong) : null,
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

// ── Audit: document structure analysis (read-only, no logic change) ──────────

function auditDocumentStructure(transcription: string): string[] {
  const text = transcription; // already structure-preserved by normalizeTextPreserveStructure in transcriptionService
  const lines = text.split(/\n/).map((l: string) => l.trim()).filter(Boolean);

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const sizeClass = wordCount < 400
    ? `corto (${wordCount} palabras → máx 3 nucleares)`
    : `largo (${wordCount} palabras → máx 5 nucleares)`;

  console.log('\n[Audit] ════════════════════════════════════════════════════════');
  console.log('[Audit] FASE 1 — EXTRACCIÓN PEDAGÓGICA (análisis del texto fuente)');
  console.log(`[Audit] Documento: ${sizeClass}`);
  console.log('[Audit] ════════════════════════════════════════════════════════');

  // Objetivos
  const objVerbs = ['reconocer', 'identificar', 'explicar', 'clasificar', 'distinguir',
    'aplicar', 'comprender', 'analizar', 'diferenciar', 'calcular', 'resolver',
    'determinar', 'comparar', 'describir', 'definir', 'relacionar', 'interpretar',
    'reducir', 'simplificar', 'operar', 'agrupar', 'combinar'];
  const objLines = lines.filter((l: string) =>
    objVerbs.some(v => l.toLowerCase().startsWith(v) || new RegExp(`\\b${v}\\b`).test(l.toLowerCase()))
  );
  console.log(`\n[Audit] Objetivos detectados: ${objLines.length}`);
  objLines.forEach((l: string) => {
    const matched = objVerbs.find(v =>
      l.toLowerCase().startsWith(v) || new RegExp(`\\b${v}\\b`).test(l.toLowerCase())
    );
    console.log(`  verbo=${matched} texto="${l.slice(0, 120)}"`);
  });
  if (objLines.length === 0) console.log('  (ninguno detectado en el texto fuente)');

  // Encabezados
  const headerLines = lines.filter((l: string) =>
    l.length <= 80 &&
    (l === l.toUpperCase() || /^\d+[\.\)]\s/.test(l) || /^[ivxIVX]+[\.\)]\s/.test(l)) &&
    l.length > 3
  );
  console.log(`\n[Audit] Encabezados detectados: ${headerLines.length}`);
  headerLines.forEach((l: string, i: number) => console.log(`  ${i + 1}. ${l.slice(0, 80)}`));
  if (headerLines.length === 0) console.log('  (ninguno detectado)');

  // Bloques de ejercicios
  const exKws = ['ejercicio', 'resuelv', 'calcul', 'escrib', 'complet', 'indica', 'determin', 'hall', 'practi', 'actividad'];
  const exLines = lines.filter((l: string) => exKws.some(k => l.toLowerCase().includes(k)));
  console.log(`\n[Audit] Bloques de ejercicios detectados: ${exLines.length}`);
  exLines.slice(0, 6).forEach((l: string, i: number) => console.log(`  ${i + 1}. ${l.slice(0, 120)}`));
  if (exLines.length > 6) console.log(`  ... y ${exLines.length - 6} más`);
  if (exLines.length === 0) console.log('  (ninguno detectado)');

  // Competencias
  const compKws = ['simplific', 'reducir', 'operar', 'factorizar', 'despejar', 'sustituir',
    'graficar', 'interpretar', 'demostrar', 'justificar', 'argüir', 'argumentar'];
  const compLines = lines.filter((l: string) => compKws.some(k => l.toLowerCase().includes(k)));
  console.log(`\n[Audit] Competencias detectadas: ${compLines.length}`);
  compLines.slice(0, 5).forEach((l: string, i: number) => console.log(`  ${i + 1}. ${l.slice(0, 120)}`));
  if (compLines.length === 0) console.log('  (ninguna detectada)');

  // Conceptos (patrones de definición)
  const defPatterns = [
    /\bes\s+un[ao]?\b/, /\bse\s+llama\b/, /\bse\s+define\b/,
    /\bson\s+aquellos\b/, /\bson\s+los\b/, /\bse\s+denominan\b/,
    /\bse\s+conoce\b/, /\brecibe\s+el\s+nombre\b/, /:\s*$/,
  ];
  const conceptLines = lines.filter((l: string) =>
    l.length < 160 && defPatterns.some(p => p.test(l.toLowerCase()))
  );
  console.log(`\n[Audit] Conceptos extraídos (patrones de definición): ${conceptLines.length}`);
  conceptLines.slice(0, 8).forEach((l: string, i: number) => console.log(`  ${i + 1}. ${l.slice(0, 120)}`));
  if (conceptLines.length > 8) console.log(`  ... y ${conceptLines.length - 8} más`);
  if (conceptLines.length === 0) console.log('  (ninguno detectado)');

  // Relaciones
  const relPatterns = [/→/, /↓/, /produce/, /genera/, /\bcausa\b/, /provoca/, /resulta en/, /depende de/, /por lo tanto/, /consecuentemente/];
  const relLines = lines.filter((l: string) => relPatterns.some(p => p.test(l.toLowerCase())));
  console.log(`\n[Audit] Relaciones detectadas: ${relLines.length}`);
  relLines.slice(0, 5).forEach((l: string, i: number) => console.log(`  ${i + 1}. ${l.slice(0, 120)}`));
  if (relLines.length === 0) console.log('  (ninguna detectada)');

  // Procedimientos
  const procPatterns = [/^paso\s+\d/i, /^primero[,\s]/, /^luego[,\s]/, /^después[,\s]/, /^finalmente[,\s]/, /^\d+[\.\)]\s+\S/, /^[a-e]\)\s/i];
  const procLines = lines.filter((l: string) => procPatterns.some(p => p.test(l)));
  console.log(`\n[Audit] Procedimientos detectados: ${procLines.length}`);
  procLines.slice(0, 5).forEach((l: string, i: number) => console.log(`  ${i + 1}. ${l.slice(0, 120)}`));
  if (procLines.length === 0) console.log('  (ninguno detectado)');

  // Errores frecuentes
  const errKws = ['no confund', 'error', 'incorrecto', 'equivoc', 'cuidado', 'no hay que', 'no se debe', 'muchos creen', 'es incorrecto', 'no es lo mismo'];
  const errLines = lines.filter((l: string) => errKws.some(k => l.toLowerCase().includes(k)));
  console.log(`\n[Audit] Errores frecuentes detectados: ${errLines.length}`);
  errLines.slice(0, 5).forEach((l: string, i: number) => console.log(`  ${i + 1}. ${l.slice(0, 120)}`));
  if (errLines.length === 0) console.log('  (ninguno detectado)');

  // ── Pre-analysis: Tipo A candidates from document structure ─────────────────
  const tipoACandidates: string[] = [];

  // Strategy 1: numbered items that contain an objective verb
  const numberedMatches = [...text.matchAll(/\d+[\.\)]\s+([A-ZÁÉÍÓÚÜÑA-Za-záéíóúüñ][^\n]{5,120})/gu)];
  const objVerbSet = new Set(objVerbs);
  for (const m of numberedMatches) {
    const item = m[1].trim();
    const firstWord = item.toLowerCase().split(/\s+/)[0].replace(/[^a-záéíóú]/g, '');
    if (objVerbSet.has(firstWord) || objVerbs.some(v => new RegExp(`\\b${v}\\b`).test(item.toLowerCase()))) {
      tipoACandidates.push(item);
    }
  }

  // Strategy 2: standalone header lines not already captured
  for (const h of headerLines) {
    if (h.length > 4 && !tipoACandidates.some(c => c.toLowerCase().startsWith(h.toLowerCase().slice(0, 15)))) {
      tipoACandidates.push(h);
    }
  }

  console.log(`\n[Audit] Candidatos Tipo A iniciales (pre-análisis del documento): ${tipoACandidates.length}`);
  tipoACandidates.forEach((c: string, i: number) => console.log(`  ${i + 1}. ${c.slice(0, 100)}`));
  if (tipoACandidates.length === 0) console.log('  (ninguno — no se detectaron objetivos o encabezados elegibles)');

  // CONCEPT_SELECTION trazabilidad
  const objLineSet = new Set(objLines.map((l: string) => l.toLowerCase()));
  tipoACandidates.forEach((c: string) => {
    const isExplicit = objLineSet.has(c.toLowerCase()) ||
      objLines.some((l: string) => l.toLowerCase().startsWith(c.toLowerCase().slice(0, 25)));
    console.log(`\n[CONCEPT_SELECTION]`);
    console.log(`  objetivo="${c.slice(0, 100)}"`);
    console.log(`  origen=${isExplicit ? 'explícito' : 'inferido (encabezado)'}`);
    console.log(`  evaluacion_independiente=true`);
    if (isExplicit) {
      console.log(`  puede_degradarse=false`);
      console.log(`  motivo="objetivo explícito conservado — prerrequisito no implica absorción"`);
    } else {
      console.log(`  puede_degradarse=true`);
      console.log(`  motivo="concepto inferido — sujeto a cap y análisis de dependencias"`);
    }
  });

  console.log('[Audit] ════════════════════════════════════════════════════════\n');

  return tipoACandidates;
}

// ── Cognitive stage mapper ────────────────────────────────────────────────────

export type CognitiveStage = 'recognition' | 'understanding' | 'application' | 'integration' | 'mastery';

export interface MissionStage {
  stage: number;
  objective: string;
  cognitiveStage: CognitiveStage;
  bloomLevel: number; // 1–5
}

export interface MissionStagesResult {
  stages: MissionStage[];
  progression: CognitiveStage[];
  maxStage: CognitiveStage;
  sourceUsed: 'explicit_objectives' | 'tipo_a_candidates';
}

const STAGE_KEYWORDS: Record<CognitiveStage, string[]> = {
  recognition: [
    'reconocer', 'reconocimiento', 'identificar', 'identificacion', 'distinguir',
    'nombrar', 'listar', 'recordar', 'observar', 'señalar', 'indicar',
    'enumerar', 'seleccionar', 'ubicar', 'localizar', 'partes', 'elementos',
    'componentes', 'estructura', 'parte',
  ],
  understanding: [
    'clasificar', 'clasificacion', 'describir', 'explicar', 'comparar', 'resumir',
    'interpretar', 'comprender', 'definir', 'diferenciar', 'ordenar', 'categorizar',
    'inferir', 'ejemplificar', 'tipos', 'diferencias', 'semejanzas', 'relacion',
    'concepto', 'definicion',
  ],
  application: [
    'aplicar', 'reducir', 'calcular', 'resolver', 'usar', 'demostrar',
    'construir', 'ejecutar', 'implementar', 'practicar', 'utilizar',
    'simplificar', 'operar', 'transformar', 'convertir', 'realizar',
    'simplificacion', 'reduccion', 'calculo', 'operacion', 'procedimiento',
  ],
  integration: [
    'analizar', 'integrar', 'relacionar', 'combinar', 'diferenciar',
    'descomponer', 'organizar', 'estructurar', 'discriminar', 'contextualizar',
    'conectar', 'sintetizar', 'vincular', 'analisis', 'relaciones', 'patron',
  ],
  mastery: [
    'evaluar', 'crear', 'diseñar', 'criticar', 'justificar', 'valorar',
    'argumentar', 'formular', 'proponer', 'generar', 'planificar',
    'producir', 'elaborar', 'contrastar', 'fundamentar',
  ],
};

const BLOOM_LEVEL: Record<CognitiveStage, number> = {
  recognition: 1,
  understanding: 2,
  application: 3,
  integration: 4,
  mastery: 5,
};

function normEs(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, ' ');
}

function detectCognitiveStage(objective: string): CognitiveStage {
  const norm = normEs(objective);
  const scores: Record<CognitiveStage, number> = {
    recognition: 0, understanding: 0, application: 0, integration: 0, mastery: 0,
  };
  for (const [stage, keywords] of Object.entries(STAGE_KEYWORDS) as [CognitiveStage, string[]][]) {
    for (const kw of keywords) {
      if (norm.includes(normEs(kw))) scores[stage]++;
    }
  }
  let best: CognitiveStage = 'understanding';
  let bestScore = 0;
  for (const [stage, score] of Object.entries(scores) as [CognitiveStage, number][]) {
    if (score > bestScore) { bestScore = score; best = stage as CognitiveStage; }
  }
  return best;
}

function extractObjectivesFromTranscription(transcription: string): string[] {
  // Match "Objetivo(s):" block followed by numbered items
  const blockMatch = transcription.match(/objetivo[s]?\s*[:\-]?\s*([\s\S]{10,500}?)(?:\n{2,}|\nInstrucciones|\nNombre|\nFecha)/i);
  if (!blockMatch) return [];
  const block = blockMatch[1];
  // Extract "1. texto" or "1) texto" patterns
  const numbered = [...block.matchAll(/\d+[\.\)]\s*([^\n\d]{10,150})/g)]
    .map(m => m[1].trim().replace(/\.$/, ''))
    .filter(Boolean);
  if (numbered.length >= 2) return numbered;
  // Fallback: non-empty lines
  return block.split('\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 150).slice(0, 5);
}

export function mapToMissionStages(tipoACandidates: string[], transcription?: string): MissionStagesResult {
  let objectives = tipoACandidates;
  let sourceUsed: MissionStagesResult['sourceUsed'] = 'tipo_a_candidates';

  if (transcription) {
    const explicit = extractObjectivesFromTranscription(transcription);
    if (explicit.length >= 2) {
      objectives = explicit;
      sourceUsed = 'explicit_objectives';
    }
  }

  if (objectives.length === 0) objectives = tipoACandidates;

  const stages: MissionStage[] = objectives.map((obj, i) => {
    const cognitiveStage = detectCognitiveStage(obj);
    return { stage: i + 1, objective: obj, cognitiveStage, bloomLevel: BLOOM_LEVEL[cognitiveStage] };
  });

  const progression: CognitiveStage[] = [...stages]
    .sort((a, b) => a.bloomLevel - b.bloomLevel)
    .map(s => s.cognitiveStage);

  const maxStage = stages.reduce<CognitiveStage>(
    (max, s) => BLOOM_LEVEL[s.cognitiveStage] > BLOOM_LEVEL[max] ? s.cognitiveStage : max,
    'recognition'
  );

  return { stages, progression, maxStage, sourceUsed };
}

// ── Main generation function ──────────────────────────────────────────────────

export async function generateSessionContent(
  transcription: string,
  configValues: SessionConfig,
  curso: string = '1º Medio',
  knowledgeGraph?: KnowledgeGraph | null,
): Promise<GenerationResult> {
  console.log('[Generation] Curso utilizado para generar sesión:', curso);

  const tipoACandidates = auditDocumentStructure(transcription);

  // ── Cognitive stage mapping ───────────────────────────────────────────────────
  const missionStages = mapToMissionStages(tipoACandidates, transcription);
  console.log('\n[MISSION STAGES]');
  console.log(`  source: ${missionStages.sourceUsed}`);
  missionStages.stages.forEach(s => {
    console.log(`  stage ${s.stage} = ${s.cognitiveStage} (bloom L${s.bloomLevel}) — "${s.objective.slice(0, 70)}"`);
  });
  console.log(`  progression: ${missionStages.progression.join(' → ')}`);
  console.log(`  maxStage: ${missionStages.maxStage}`);

  // Classify content type before selecting prompt
  const contentOverride = knowledgeGraph ? buildKnowledgeBlock(knowledgeGraph) : undefined;
  const classification = classifyContent(knowledgeGraph ?? transcription);
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
    prompt = buildFocusedProceduralPrompt(transcription, curso, primarySkill, learningPath, contentOverride);
    systemMsg = `Eres un diseñador de sesiones de aprendizaje procedimental para estudiantes chilenos de enseñanza media. Esta misión enseña UNA SOLA habilidad. Tu filosofía: GANCHO → MÉTODO PASO A PASO → EJEMPLO RESUELTO → PRÁCTICA → ERROR COMÚN → DESAFÍO → VICTORIA. Cada pantalla construye competencia para resolver ejercicios de la habilidad específica. NO mezcles habilidades distintas. Genera exactamente 7 pantallas en el orden indicado. JSON válido únicamente. Todo en español.`;
  } else if (classification.type === 'MEMORIZATION') {
    prompt = buildMemorizationPrompt(transcription, curso, contentOverride);
    systemMsg = `Eres un diseñador de sesiones de aprendizaje por memorización para estudiantes chilenos de enseñanza media. Tu filosofía: DATO → ASOCIACIÓN → RETO → REPASO → CURIOSIDAD → VICTORIA. Cada pantalla usa técnicas de memoria para que los datos sean inolvidables. Genera exactamente 8 pantallas en el orden indicado. JSON válido únicamente. Todo en español.`;
  } else {
    // CONCEPTUAL and MIXED → section-based pedagogical mission
    prompt = buildConceptualPrompt(transcription, curso, contentOverride);
    systemMsg = `Eres un Arquitecto de Aprendizaje para estudiantes chilenos de enseñanza media. Tu filosofía: DUOLINGO LOOP. Cada concepto tiene exactamente 3 slides obligatorios en este orden: (1) micro_challenge — el estudiante DESCUBRE el concepto respondiendo una pregunta, con question+options+correctAnswer; (2) main_concept — INSIGHT breve que confirma lo descubierto, máximo 25 palabras; (3) reinforcement_challenge — el estudiante APLICA el concepto en una situación nueva, con question+options+correctAnswer, title="Refuerzo". NUNCA main_concept sin micro_challenge antes. NUNCA main_concept sin reinforcement_challenge después. NUNCA dos slides pasivos consecutivos. 60%+ de slides deben ser interactivos. Después de todas las secciones: application → final_challenge (Boss Battle) → victory. JSON válido únicamente. Todo en español.`;
  }

  console.log(`[Generation] source=${knowledgeGraph ? 'knowledgeGraph' : 'transcription'}`);
  console.log(`[Generation] prompt_chars=${prompt.length} (~${Math.round(prompt.length / 4)} tokens)`);
  console.log(`[Generation] prompt_content=${prompt.includes('KNOWLEDGE GRAPH') ? 'knowledgeGraph ✓' : 'rawTranscription ⚠️'}`);
  const base = await callOpenAIAndBuildResult(prompt, systemMsg, configValues);

  // ── [TEMP] RAW OPENAI RESPONSE AUDIT ─────────────────────────────────────────
  {
    const rawSlides = (base.summary?.slides ?? []) as unknown as Array<Record<string, unknown>>;
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('[RAW OPENAI RESPONSE] — antes de cualquier sanitización');
    console.log(`  total_slides: ${rawSlides.length}`);
    rawSlides.forEach((s, i) => {
      const opts = Array.isArray(s.options) ? (s.options as unknown[]).length : 0;
      const content = String(s.definition ?? s.title ?? '').slice(0, 100);
      console.log(`\n  SLIDE ${i + 1}`);
      console.log(`    type=${s.type ?? '(undefined)'}`);
      console.log(`    title="${String(s.title ?? '').slice(0, 60)}"`);
      if (s.question) console.log(`    question="${String(s.question).slice(0, 80)}"`);
      if (opts > 0)   console.log(`    options=${opts}`);
      if (s.correctAnswer) console.log(`    correctAnswer=${s.correctAnswer}`);
      console.log(`    content="${content}"`);
    });

    const micros = rawSlides.filter(s => s.type === 'micro_challenge');
    const reinforcements = rawSlides.filter(s => s.type === 'reinforcement_challenge');
    const hasQ = (s: Record<string, unknown>) =>
      typeof s.question === 'string' && (s.question as string).trim().length > 0 &&
      Array.isArray(s.options) && (s.options as unknown[]).length >= 2 &&
      typeof s.correctAnswer === 'string';

    console.log('\n[MICRO CHALLENGE AUDIT]');
    console.log(`  total_micro_challenges:    ${micros.length}`);
    console.log(`  micro_with_question:       ${micros.filter(hasQ).length}`);
    console.log(`  micro_without_question:    ${micros.filter(s => !hasQ(s)).length}`);
    if (micros.filter(s => !hasQ(s)).length > 0) {
      micros.forEach((s, i) => { if (!hasQ(s)) console.log(`    ✗ micro[${i}] "${String(s.title ?? '').slice(0, 50)}" — SIN PREGUNTA`); });
    }

    console.log('\n[REINFORCEMENT AUDIT]');
    console.log(`  total_reinforcement:            ${reinforcements.length}`);
    console.log(`  reinforcement_with_question:    ${reinforcements.filter(hasQ).length}`);
    console.log(`  reinforcement_without_question: ${reinforcements.filter(s => !hasQ(s)).length}`);
    if (reinforcements.filter(s => !hasQ(s)).length > 0) {
      reinforcements.forEach((s, i) => { if (!hasQ(s)) console.log(`    ✗ reinforcement[${i}] "${String(s.title ?? '').slice(0, 50)}" — SIN PREGUNTA`); });
    }

    console.log('\n[FINAL STRUCTURE]');
    rawSlides.forEach((s, i) => console.log(`  ${i + 1}. ${s.type ?? '(undefined)'}`));
    console.log('════════════════════════════════════════════════════════════════\n');
  }
  // ── [/TEMP] ───────────────────────────────────────────────────────────────────

  // ── Quality Gate ─────────────────────────────────────────────────────────────
  const gGrounding      = validateGrounding(base as unknown as GenerationResult, transcription);
  const gSemantic       = checkSemanticGrounding(transcription, (base.summary?.slides ?? []) as SummarySlide[]);
  const gConsistency    = validateQuestionConsistency((base.summary?.slides ?? []) as SummarySlide[]);
  const consistencyScore = gConsistency.results.length === 0
    ? 1
    : 1 - gConsistency.inconsistentSlides.length / gConsistency.results.length;
  const gUnknown        = detectUnknownConcepts(transcription, (base.summary?.slides ?? []) as SummarySlide[], tipoACandidates);
  const qualityScore    = computeQualityScore(gGrounding.score, gSemantic.overallOverlap, consistencyScore, gUnknown.penalty);
  const gMicroChallenge   = validateMicroChallengeInteractivity((base.summary?.slides ?? []) as SummarySlide[]);
  const gEngagement       = validateEngagement((base.summary?.slides ?? []) as SummarySlide[]);
  const gDuolingoLoop     = validateDuolingoLoop((base.summary?.slides ?? []) as SummarySlide[]);
  const gInteractiveLoops = validateInteractiveLoops((base.summary?.slides ?? []) as SummarySlide[]);
  const gFlow             = validatePedagogicalFlow((base.summary?.slides ?? []) as SummarySlide[]);

  console.log('\n[QUALITY REPORT]');
  console.log(`  groundingScore:   ${gGrounding.score.toFixed(2)}`);
  console.log(`  semanticOverlap:  ${gSemantic.overallOverlap.toFixed(2)}`);
  console.log(`  consistencyScore: ${consistencyScore.toFixed(2)}`);
  if (gUnknown.unknownConcepts.length > 0) {
    console.log('  unknownConcepts:');
    gUnknown.unknownConcepts.forEach(c => console.log(`    * ${c}`));
  } else {
    console.log('  unknownConcepts:  (ninguno)');
  }
  console.log(`  qualityScore:     ${qualityScore.toFixed(2)}`);
  if (gMicroChallenge.hasPassive) {
    console.log('  microChallenge:   PASIVOS DETECTADOS');
    gMicroChallenge.passiveSlides.forEach(s => console.log(`    * [${s.index}] ${s.title}`));
  } else {
    console.log('  microChallenge:   ok');
  }
  console.log('\n[ENGAGEMENT REPORT]');
  console.log(`  interactiveSlides:       ${gEngagement.interactiveSlides}`);
  console.log(`  informativeSlides:       ${gEngagement.informativeSlides}`);
  console.log(`  interactionRatio:        ${(gEngagement.interactionRatio * 100).toFixed(0)}%`);
  console.log(`  challengeFirstViolations:${gEngagement.challengeFirstViolations}`);
  console.log(`  maxConsecutivePassive:   ${gEngagement.maxConsecutiveInformative}`);
  console.log(`  engagementScore:         ${gEngagement.engagementScore.toFixed(2)}`);
  console.log(`  passes:                  ${gEngagement.passesThreshold ? 'YES' : 'NO'}`);

  console.log('\n[DUOLINGO LOOP REPORT]');
  gInteractiveLoops.concepts.forEach(c => {
    console.log(`\n  concept: ${c.conceptTitle}`);
    console.log(`    micro_challenge:          interactive=${c.microChallenge.interactive} present=${c.microChallenge.present}`);
    console.log(`    main_concept:             present=${c.mainConcept.present}`);
    console.log(`    reinforcement_challenge:  interactive=${c.reinforcementChallenge.interactive} present=${c.reinforcementChallenge.present}`);
    console.log(`    loop_complete=${c.loopComplete}`);
  });
  console.log(`\n  interactiveLoopCompliance: ${(gInteractiveLoops.interactiveLoopCompliance * 100).toFixed(0)}% (${gInteractiveLoops.completeLoops}/${gInteractiveLoops.totalConcepts})`);
  console.log(`  passes:                    ${gInteractiveLoops.passesThreshold ? 'YES' : 'NO'}`);

  console.log('\n[PEDAGOGICAL FLOW AUDIT]');
  if (gFlow.violations.length === 0) {
    console.log('  violations: (none)');
  } else {
    gFlow.violations.forEach(v => console.log(`  ✗ [${v.type}] slide ${v.slideIdx >= 0 ? v.slideIdx : 'global'}: ${v.detail}`));
  }
  console.log(`  pedagogicalFlowScore: ${gFlow.pedagogicalFlowScore}/100`);
  console.log(`  passes:               ${gFlow.passesThreshold ? 'YES' : 'NO'}`);

  // ── Truth Validation — gatekeeper between quality check and regeneration ──────
  const gTruth = await validateTruth((base.summary?.slides ?? []) as SummarySlide[], transcription, knowledgeGraph);

  const needsRegeneration =
    qualityScore < 0.65 ||
    gMicroChallenge.hasPassive ||
    !gEngagement.passesThreshold ||
    !gInteractiveLoops.passesThreshold ||
    !gFlow.passesThreshold ||
    !gTruth.passed;

  let finalBase = base;
  if (needsRegeneration) {
    const reasons: string[] = [];
    if (qualityScore < 0.65)              reasons.push('quality');
    if (gMicroChallenge.hasPassive)       reasons.push('micro_challenge pasivos');
    if (!gEngagement.passesThreshold)       reasons.push(`engagement (score=${gEngagement.engagementScore.toFixed(2)}, cfViolations=${gEngagement.challengeFirstViolations})`);
    if (!gInteractiveLoops.passesThreshold) reasons.push(`interactive_loops (${gInteractiveLoops.completeLoops}/${gInteractiveLoops.totalConcepts} loops completos)`);
    if (!gFlow.passesThreshold)             reasons.push(`pedagogical_flow (score=${gFlow.pedagogicalFlowScore}, violations=${gFlow.violations.map(v => v.type).join(',')})`);
    if (!gTruth.passed)                     reasons.push(`truth (score=${gTruth.score.toFixed(2)}, failures=${gTruth.failures.length})`);
    console.log(`  action:           REGENERATE (${reasons.join(', ')})`);

    const feedbackParts: string[] = [buildQualityFeedback(gUnknown.unknownConcepts, gSemantic.overallOverlap)];
    if (gMicroChallenge.hasPassive)         feedbackParts.push(buildMicroChallengeFeedback(gMicroChallenge.passiveSlides));
    if (!gEngagement.passesThreshold)       feedbackParts.push(buildEngagementFeedback(gEngagement));
    if (!gInteractiveLoops.passesThreshold) feedbackParts.push(buildInteractiveLoopsFeedback(gInteractiveLoops));
    if (!gFlow.passesThreshold)             feedbackParts.push(buildFlowFeedback(gFlow));
    if (!gTruth.passed)                     feedbackParts.push(buildTruthFeedback(gTruth));
    const retryPrompt = `${prompt}\n\n${'━'.repeat(40)}\n${feedbackParts.join('\n\n')}\n${'━'.repeat(40)}`;
    finalBase = await callOpenAIAndBuildResult(retryPrompt, systemMsg, configValues);
    console.log('[QUALITY REPORT] Regeneración completada.');
  } else {
    console.log('  action:           ACCEPT');
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Post-AI audit: Tipo A candidates vs actual nuclear concepts ────────────
  const actualNuclear: string[] = (finalBase.summary?.slides ?? [])
    .filter((s: any) => s.type === 'main_concept')
    .map((s: any) => (s.title ?? '').trim());
  console.log('\n[Audit] ════════════════════════════════════════════════════════');
  console.log('[Audit] COMPARACIÓN CANDIDATOS vs SELECCIÓN FINAL');
  console.log(`[Audit] Tipo A finales (main_concept slides): ${actualNuclear.length}`);
  actualNuclear.forEach((t: string, i: number) => console.log(`  ${i + 1}. ${t}`));
  const notSelected = tipoACandidates.filter(c =>
    !actualNuclear.some(a =>
      a.toLowerCase().includes(c.toLowerCase().slice(0, 18)) ||
      c.toLowerCase().includes(a.toLowerCase().slice(0, 18))
    )
  );
  if (notSelected.length > 0) {
    console.log(`[Audit] Tipo A degradados/no incluidos: ${notSelected.length}`);
    notSelected.forEach((c: string, i: number) =>
      console.log(`  ${i + 1}. "${c.slice(0, 80)}" — razón: interna al LLM (verificar señales de FASE 3)`)
    );
  } else if (tipoACandidates.length > 0) {
    console.log('[Audit] Tipo A degradados: 0 — todos los candidatos del documento fueron incluidos');
  }
  console.log('[Audit] ════════════════════════════════════════════════════════\n');
  // ──────────────────────────────────────────────────────────────────────────

  return { ...finalBase, pedagogicalType: classification.type, primarySkill, learningPath };
}

// Generates ONE focused skill mission without re-classifying (classification done by caller).
// Each call covers a single skill; the caller (sessions.ts) sequences multiple missions.
export async function generateSkillMission(
  transcription: string,
  sessionConfig: SessionConfig,
  curso: string,
  primarySkill: DetectedSkill,
  learningPath: DetectedSkill[],
  knowledgeGraph?: KnowledgeGraph | null,
): Promise<GenerationResult> {
  const contentOverride = knowledgeGraph ? buildKnowledgeBlock(knowledgeGraph) : undefined;
  const prompt = buildFocusedProceduralPrompt(transcription, curso, primarySkill, learningPath, contentOverride);
  console.log(`[Generation] source=${knowledgeGraph ? 'knowledgeGraph' : 'transcription'} prompt_chars=${prompt.length}`);
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

// ── Unknown concept detector ─────────────────────────────────────────────────

const CONCEPT_SLIDE_TYPES_FOR_AUDIT = new Set(['main_concept', 'key_relation', 'application', 'common_error']);

export interface UnknownConceptReport {
  unknownConcepts: string[];
  penalty: number;
}

export function detectUnknownConcepts(
  transcription: string,
  slides: SummarySlide[],
  tipoACandidates: string[],
): UnknownConceptReport {
  const docKeywords = extractDocKeywords(transcription, 60);
  const candidateWords = tipoACandidates.flatMap(c =>
    c.toLowerCase().replace(/[^a-záéíóúüñ\s]/gi, ' ').split(/\s+/).filter((w: string) => w.length >= 4)
  );
  const knownSet = new Set([...docKeywords, ...candidateWords]);
  const knownArr = [...knownSet];

  const seen = new Set<string>();
  const unknownConcepts: string[] = [];

  for (const slide of slides) {
    if (!CONCEPT_SLIDE_TYPES_FOR_AUDIT.has(slide.type)) continue;
    const title = ((slide as any).title ?? '').toLowerCase();
    const words = title
      .replace(/[^a-záéíóúüñ\s]/gi, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length >= 5 && !SPANISH_STOP_WORDS.has(w));

    for (const term of words) {
      if (seen.has(term)) continue;
      seen.add(term);
      const known = knownSet.has(term) ||
        knownArr.some(k => {
          const ml = Math.min(term.length, k.length, 6);
          return ml >= 4 && term.slice(0, ml) === k.slice(0, ml);
        });
      if (!known) unknownConcepts.push(term);
    }
  }

  const penalty = seen.size === 0 ? 0 : Math.min(0.40, unknownConcepts.length / seen.size);
  return { unknownConcepts, penalty };
}

// ── Quality score ─────────────────────────────────────────────────────────────

function computeQualityScore(
  groundingScore: number,
  semanticOverlap: number,
  consistencyScore: number,
  unknownConceptPenalty: number,
): number {
  const base = groundingScore * 0.40 + semanticOverlap * 0.40 + consistencyScore * 0.20;
  return Math.max(0, Math.min(1, base - unknownConceptPenalty * 0.30));
}

function buildQualityFeedback(unknownConcepts: string[], semanticOverlap: number): string {
  const lines = [
    'ADVERTENCIA DE CALIDAD — Tu generación anterior introdujo contenido insuficientemente respaldado por el documento.',
    '',
    'CORRECCIONES REQUERIDAS:',
    '→ Aumenta el uso de conceptos, términos y ejemplos presentes en el material.',
    '→ Reduce explicaciones genéricas que no aparecen en el texto fuente.',
    '→ Reutiliza más vocabulario del documento en los campos definition y example.',
    '→ Las preguntas, ejercicios y distractores pueden ser nuevos.',
    '→ Los CONCEPTOS, DEFINICIONES y TERMINOLOGÍA ACADÉMICA deben derivar del documento.',
  ];
  if (unknownConcepts.length > 0) {
    lines.push('');
    lines.push(`→ Términos en slides conceptuales no encontrados en el documento: ${unknownConcepts.slice(0, 5).join(', ')}.`);
    lines.push('  Verifica que la terminología nuclear derive del texto fuente.');
  }
  if (semanticOverlap < 0.40) {
    lines.push('');
    lines.push(`→ El solapamiento semántico con el documento fue solo ${(semanticOverlap * 100).toFixed(0)}%.`);
    lines.push('  Incrementa la densidad de vocabulario derivado del material.');
  }
  return lines.join('\n');
}

// ── Engagement validator (Challenge First compliance) ─────────────────────────

export interface ChallengeFirstReport {
  interactiveSlides: number;
  informativeSlides: number;
  interactionRatio: number;
  challengeFirstViolations: number;
  maxConsecutiveInformative: number;
  engagementScore: number;
  passesThreshold: boolean;
}

export function validateEngagement(slides: SummarySlide[]): ChallengeFirstReport {
  const ACTIVE  = new Set(['micro_challenge','reinforcement_challenge','comprehension','mini_quiz','final_challenge','decide','order_sequence','common_error','application','challenge']);
  const PASSIVE = new Set(['mission','main_concept','key_relation','wow_fact','victory','process_flow']);

  let interactive = 0, informative = 0, cfViolations = 0;
  let maxConsecutive = 0, currentConsecutive = 0;

  slides.forEach((slide, i) => {
    const s = slide as { type?: string; question?: string | null; options?: unknown[] };
    const t = s.type ?? '';
    const hasInteraction = ACTIVE.has(t) && typeof s.question === 'string' && s.question.trim().length > 0;

    if (hasInteraction) {
      interactive++;
      currentConsecutive = 0;
    } else if (PASSIVE.has(t) || ACTIVE.has(t)) {
      informative++;
      currentConsecutive++;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    }

    // Challenge First: main_concept must be immediately preceded by an active slide
    if (t === 'main_concept' && i > 0) {
      const prevType = (slides[i - 1] as { type?: string }).type ?? '';
      if (!ACTIVE.has(prevType)) cfViolations++;
    }
  });

  const total = interactive + informative;
  const ratio = total > 0 ? interactive / total : 0;
  const totalConcepts = slides.filter(s => (s as { type?: string }).type === 'main_concept').length;
  const cfCompliance = totalConcepts > 0 ? (totalConcepts - cfViolations) / totalConcepts : 1;
  const score = ratio * 0.6 + cfCompliance * 0.4;

  return {
    interactiveSlides: interactive,
    informativeSlides: informative,
    interactionRatio: ratio,
    challengeFirstViolations: cfViolations,
    maxConsecutiveInformative: maxConsecutive,
    engagementScore: score,
    passesThreshold: score >= 0.65 && cfViolations === 0 && maxConsecutive <= 2,
  };
}

export interface DuolingoLoopReport {
  conceptsDetected: number;
  conceptsWithFullLoop: number;
  totalLearningInteractions: number;
  bossChallengePresent: boolean;
  loopCompliance: number;
  passesThreshold: boolean;
}

export function validateDuolingoLoop(slides: SummarySlide[]): DuolingoLoopReport {
  const types = slides.map(s => (s as { type?: string }).type ?? '');
  const conceptIdxs = types.reduce<number[]>((acc, t, i) => { if (t === 'main_concept') acc.push(i); return acc; }, []);

  let conceptsWithFullLoop = 0;
  let totalLearningInteractions = 0;

  conceptIdxs.forEach(mcIdx => {
    const prevType = types[mcIdx - 1] ?? '';
    const nextType = types[mcIdx + 1] ?? '';
    const hasDiscovery    = prevType === 'micro_challenge';
    const hasReinforcement = nextType === 'reinforcement_challenge';
    totalLearningInteractions += (hasDiscovery ? 1 : 0) + (hasReinforcement ? 1 : 0);
    if (hasDiscovery && hasReinforcement) conceptsWithFullLoop++;
  });

  const bossChallengePresent = types.includes('final_challenge');
  const compliance = conceptIdxs.length > 0 ? conceptsWithFullLoop / conceptIdxs.length : 0;

  return {
    conceptsDetected: conceptIdxs.length,
    conceptsWithFullLoop,
    totalLearningInteractions,
    bossChallengePresent,
    loopCompliance: compliance,
    passesThreshold: compliance === 1.0 && bossChallengePresent,
  };
}

function buildEngagementFeedback(r: ChallengeFirstReport): string {
  const lines = ['⚡ CORRECCIÓN NECESARIA — MODELO CHALLENGE FIRST INCUMPLIDO:'];
  if (r.challengeFirstViolations > 0) {
    lines.push(`✗ ${r.challengeFirstViolations} concepto(s) presentados SIN su desafío previo.`);
    lines.push('  REGLA OBLIGATORIA: micro_challenge → main_concept. NUNCA main_concept → micro_challenge.');
    lines.push('  El estudiante debe RESPONDER antes de ver el insight, no después.');
  }
  if (r.interactionRatio < 0.50) {
    lines.push(`✗ Solo ${Math.round(r.interactionRatio * 100)}% de slides son interactivos. Mínimo: 50%.`);
    lines.push('  Solución: cada concepto debe tener exactamente 1 micro_challenge ANTES de su main_concept.');
  }
  if (r.maxConsecutiveInformative >= 3) {
    lines.push(`✗ ${r.maxConsecutiveInformative} slides pasivos consecutivos. Máximo permitido: 2.`);
    lines.push('  Intercala siempre un desafío entre slides informativos.');
  }
  return lines.join('\n');
}

// ── Interactive loops validator (per-concept: checks BOTH presence and interactivity) ──

export interface ConceptLoopStatus {
  conceptTitle: string;
  conceptIdx: number;
  microChallenge: { present: boolean; interactive: boolean };
  mainConcept: { present: boolean };
  reinforcementChallenge: { present: boolean; interactive: boolean };
  loopComplete: boolean;
}

export interface InteractiveLoopsReport {
  concepts: ConceptLoopStatus[];
  totalConcepts: number;
  completeLoops: number;
  interactiveLoopCompliance: number;
  passesThreshold: boolean;
}

export function validateInteractiveLoops(slides: SummarySlide[]): InteractiveLoopsReport {
  const isInteractive = (s: unknown): boolean => {
    const slide = s as { question?: string | null; options?: unknown[] | null; correctAnswer?: string | null };
    return typeof slide?.question === 'string' && slide.question.trim().length > 0
      && Array.isArray(slide?.options) && (slide.options as unknown[]).length >= 2
      && typeof slide?.correctAnswer === 'string' && slide.correctAnswer.trim().length > 0;
  };

  const concepts: ConceptLoopStatus[] = [];

  slides.forEach((slide, i) => {
    const s = slide as { type?: string; title?: string };
    if (s.type !== 'main_concept') return;

    const prev = slides[i - 1] as { type?: string } | undefined;
    const next = slides[i + 1] as { type?: string } | undefined;

    const hasMicro          = prev?.type === 'micro_challenge';
    const hasReinforcement  = next?.type === 'reinforcement_challenge';

    concepts.push({
      conceptTitle: (s.title ?? `concepto ${i}`).slice(0, 60),
      conceptIdx: i,
      microChallenge:         { present: hasMicro,         interactive: hasMicro         && isInteractive(slides[i - 1]) },
      mainConcept:            { present: true },
      reinforcementChallenge: { present: hasReinforcement,  interactive: hasReinforcement  && isInteractive(slides[i + 1]) },
      loopComplete: hasMicro && isInteractive(slides[i - 1]) && hasReinforcement && isInteractive(slides[i + 1]),
    });
  });

  const completeLoops = concepts.filter(c => c.loopComplete).length;
  const compliance    = concepts.length > 0 ? completeLoops / concepts.length : 0;

  return {
    concepts,
    totalConcepts: concepts.length,
    completeLoops,
    interactiveLoopCompliance: compliance,
    passesThreshold: compliance === 1.0,
  };
}

function buildInteractiveLoopsFeedback(r: InteractiveLoopsReport): string {
  const lines = ['🔁 CORRECCIÓN NECESARIA — DUOLINGO LOOP: CHALLENGES SIN INTERACCIÓN:'];
  r.concepts.forEach(c => {
    if (!c.loopComplete) {
      lines.push(`\n✗ Concepto "${c.conceptTitle}":`);
      if (!c.microChallenge.present) {
        lines.push('  - Falta micro_challenge ANTES de main_concept.');
      } else if (!c.microChallenge.interactive) {
        lines.push('  - micro_challenge SIN question+options+correctAnswer. Es texto disfrazado de challenge.');
        lines.push('    CORRECCIÓN OBLIGATORIA: escribe una pregunta real con 3 opciones (A/B/C) y correctAnswer.');
        lines.push('    El micro_challenge debe provocar acción — el estudiante responde ANTES de ver el insight.');
      }
      if (!c.reinforcementChallenge.present) {
        lines.push('  - Falta reinforcement_challenge DESPUÉS de main_concept.');
      } else if (!c.reinforcementChallenge.interactive) {
        lines.push('  - reinforcement_challenge SIN question+options+correctAnswer. Es texto disfrazado de refuerzo.');
        lines.push('    CORRECCIÓN OBLIGATORIA: escribe una pregunta de aplicación con 3 opciones (A/B/C) y correctAnswer.');
        lines.push('    El reinforcement_challenge debe aplicar el concepto del main_concept en una situación nueva.');
      }
    }
  });
  lines.push('\nREGLA ABSOLUTA: sin question+options+correctAnswer no es un challenge. Es un main_concept mal tipado.');
  return lines.join('\n');
}

function buildDuolingoLoopFeedback(r: DuolingoLoopReport): string {
  const lines = ['🔁 CORRECCIÓN NECESARIA — DUOLINGO LOOP INCOMPLETO:'];
  const missing = r.conceptsDetected - r.conceptsWithFullLoop;
  if (missing > 0) {
    lines.push(`✗ ${missing} concepto(s) sin su reinforcement_challenge obligatorio.`);
    lines.push('  ESTRUCTURA OBLIGATORIA POR CONCEPTO: micro_challenge → main_concept → reinforcement_challenge.');
    lines.push('  reinforcement_challenge tiene title="Refuerzo", usa el mismo concepto del main_concept precedente');
    lines.push('  pero en una situación NUEVA y diferente a la del micro_challenge. Es OBLIGATORIO — no opcional.');
  }
  if (!r.bossChallengePresent) {
    lines.push('✗ Falta el final_challenge (Boss Battle). Es OBLIGATORIO después de application.');
  }
  return lines.join('\n');
}

// ── Pedagogical flow validator ────────────────────────────────────────────────

export type FlowViolationType =
  | 'feedback_without_attempt'
  | 'reinforcement_without_challenge'
  | 'first_after_mission_passive'
  | 'consecutive_explanations';

export interface FlowViolation {
  type: FlowViolationType;
  slideIdx: number;
  detail: string;
}

export interface PedagogicalFlowReport {
  violations: FlowViolation[];
  pedagogicalFlowScore: number; // 0–100; 100 = no violations
  passesThreshold: boolean;     // violations.length === 0
}

export function validatePedagogicalFlow(slides: SummarySlide[]): PedagogicalFlowReport {
  const violations: FlowViolation[] = [];

  const FEEDBACK_PHRASES = ['correcto', 'exacto', 'acertaste', 'bien hecho', 'lo captaste', 'perfecto', 'muy bien'];
  const PASSIVE = new Set(['main_concept', 'key_relation', 'wow_fact', 'mission', 'process_flow', 'victory', 'quiz_transition']);
  const CHALLENGE_TYPES = new Set(['micro_challenge', 'reinforcement_challenge', 'comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence', 'common_error', 'application', 'challenge']);

  let checksTotal   = 0;
  let checksPassed  = 0;

  slides.forEach((slide, i) => {
    const s   = slide as { type?: string; title?: string; definition?: string | null };
    const t   = s.type ?? '';
    const def = (s.definition ?? '').toLowerCase();

    // REGLA 1 — feedback_without_attempt: challenge definition must not contain pre-answered feedback phrases
    if (t === 'micro_challenge' || t === 'reinforcement_challenge') {
      checksTotal++;
      const found = FEEDBACK_PHRASES.find(p => def.includes(p));
      if (found) {
        violations.push({
          type: 'feedback_without_attempt',
          slideIdx: i,
          detail: `${t} [${i}] "${s.title ?? ''}" contiene frase de feedback prematura ("${found}") en definition — el estudiante aún no ha respondido.`,
        });
      } else {
        checksPassed++;
      }
    }

    // REGLA 2 — reinforcement_without_challenge: reinforcement_challenge must be immediately after main_concept which is after micro_challenge
    if (t === 'reinforcement_challenge') {
      checksTotal++;
      const prev1 = (slides[i - 1] as { type?: string } | undefined)?.type ?? '';
      const prev2 = (slides[i - 2] as { type?: string } | undefined)?.type ?? '';
      if (prev1 !== 'main_concept' || prev2 !== 'micro_challenge') {
        violations.push({
          type: 'reinforcement_without_challenge',
          slideIdx: i,
          detail: `reinforcement_challenge [${i}] no está precedido por micro_challenge → main_concept. Secuencia encontrada: [${prev2}] → [${prev1}] → [reinforcement_challenge].`,
        });
      } else {
        checksPassed++;
      }
    }

    // REGLA 3 — first_after_mission_passive: first slide after mission must be an interactive challenge
    if (i > 0 && (slides[i - 1] as { type?: string })?.type === 'mission') {
      checksTotal++;
      if (PASSIVE.has(t)) {
        violations.push({
          type: 'first_after_mission_passive',
          slideIdx: i,
          detail: `Slide [${i}] tipo "${t}" es pasivo — la primera pantalla después de mission debe ser micro_challenge u otro challenge interactivo.`,
        });
      } else {
        checksPassed++;
      }
    }
  });

  // REGLA 4 — consecutive_explanations: never 3+ consecutive passive slides
  checksTotal++;
  let maxRun = 0, run = 0;
  slides.forEach(slide => {
    const t = (slide as { type?: string }).type ?? '';
    if (PASSIVE.has(t) && t !== 'mission' && t !== 'victory' && t !== 'quiz_transition') {
      run++;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  });
  if (maxRun >= 3) {
    violations.push({
      type: 'consecutive_explanations',
      slideIdx: -1,
      detail: `${maxRun} slides pasivos consecutivos detectados. Máximo permitido: 2. El estudiante no debe leer 3+ pantallas seguidas sin interactuar.`,
    });
  } else {
    checksPassed++;
  }

  const score = checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 100;

  return {
    violations,
    pedagogicalFlowScore: score,
    passesThreshold: violations.length === 0,
  };
}

function buildFlowFeedback(r: PedagogicalFlowReport): string {
  const lines = ['🚦 CORRECCIÓN NECESARIA — PEDAGOGICAL FLOW AUDIT:'];
  r.violations.forEach(v => {
    switch (v.type) {
      case 'feedback_without_attempt':
        lines.push(`\n✗ [REGLA 1] ${v.detail}`);
        lines.push('  CORRECCIÓN: el campo definition de micro_challenge y reinforcement_challenge es feedback POST-respuesta.');
        lines.push('  NO debe contener "Correcto", "Exacto", "Acertaste", "Bien hecho", "Lo captaste", "Perfecto", "Muy bien".');
        lines.push('  Reescribir como explicación factual: "El coeficiente es el número que multiplica la parte literal."');
        break;
      case 'reinforcement_without_challenge':
        lines.push(`\n✗ [REGLA 2] ${v.detail}`);
        lines.push('  CORRECCIÓN: reinforcement_challenge SOLO puede aparecer DESPUÉS de micro_challenge → main_concept.');
        lines.push('  Verificar que cada sección siga el orden obligatorio: micro_challenge → main_concept → reinforcement_challenge.');
        break;
      case 'first_after_mission_passive':
        lines.push(`\n✗ [REGLA 3] ${v.detail}`);
        lines.push('  CORRECCIÓN: el primer slide después de mission DEBE ser micro_challenge — el estudiante descubre el primer concepto respondiendo.');
        break;
      case 'consecutive_explanations':
        lines.push(`\n✗ [REGLA 4] ${v.detail}`);
        lines.push('  CORRECCIÓN: intercalar siempre un slide interactivo después de 2 slides pasivos consecutivos.');
        lines.push('  Estructura obligatoria por concepto: micro_challenge (activo) → main_concept (pasivo) → reinforcement_challenge (activo).');
        break;
    }
  });
  return lines.join('\n');
}

// ── Micro-challenge interactivity validator ───────────────────────────────────

export interface MicroChallengeValidation {
  passiveSlides: Array<{ index: number; title: string }>;
  hasPassive: boolean;
}

export function validateMicroChallengeInteractivity(slides: SummarySlide[]): MicroChallengeValidation {
  const passiveSlides: Array<{ index: number; title: string }> = [];
  slides.forEach((slide, i) => {
    const s = slide as { type?: string; question?: string | null; options?: unknown[] | null; correctAnswer?: string | null; title?: string };
    if (s.type === 'micro_challenge') {
      const hasQuestion = typeof s.question === 'string' && s.question.trim().length > 0;
      const hasOptions  = Array.isArray(s.options) && s.options.length >= 2;
      const hasAnswer   = typeof s.correctAnswer === 'string' && s.correctAnswer.trim().length > 0;
      if (!hasQuestion || !hasOptions || !hasAnswer) {
        passiveSlides.push({ index: i, title: (s.title ?? '(sin título)').slice(0, 60) });
      }
    }
  });
  return { passiveSlides, hasPassive: passiveSlides.length > 0 };
}

function buildMicroChallengeFeedback(passiveSlides: Array<{ index: number; title: string }>): string {
  const lines = [
    'ERROR CRÍTICO — micro_challenge sin interactividad detectado.',
    '',
    'Las siguientes pantallas micro_challenge no tienen question + options + correctAnswer:',
    ...passiveSlides.map(s => `  * [slide ${s.index}] "${s.title}"`),
    '',
    'CORRECCIÓN OBLIGATORIA:',
    '→ Cada pantalla micro_challenge DEBE tener question (string), options (array de 3) y correctAnswer ("A","B" o "C").',
    '→ NUNCA generar un micro_challenge con solo texto en definition y sin question/options.',
    '→ Usar ejemplos del documento fuente para construir la pregunta.',
    '→ La pregunta debe poder responderse en menos de 10 segundos.',
    '→ Formatos válidos: selección múltiple, verdadero/falso, identificar elemento.',
  ];
  return lines.join('\n');
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

  const rawSlides = (generation.summary?.slides ?? []) as import('../types.js').SummarySlide[];
  const cleanedSummary = { ...(generation.summary ?? {}), slides: normalizeAllSlides(rawSlides) };

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
    summary: cleanedSummary,
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
