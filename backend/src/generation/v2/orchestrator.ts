import { randomUUID } from 'crypto';
// Aliased — this module's own `config` parameter (a SessionConfig, below)
// would otherwise shadow the app-wide config import.
import { config as appConfig } from '../../config.js';
import { classifyContent } from '../../services/pedagogicalClassifier.js';
import { buildGeneratedSession, validateGrounding, type GenerationResult } from '../../services/generationService.js';
import type { GeneratedSession, SessionConfig } from '../../types.js';
import { buildKnowledgeObject } from './comprehension.js';
import { generateDistractors } from './distractors.js';
import { buildWorkedExampleSteps } from './procedural.js';
import { generateFindError, selectPoolCandidatesForFindError, removeConsumedPoolExercise, type FindErrorResult } from './findError.js';
import { generateExercises, isExercisableSubject } from './exerciseGenerator.js';
import { buildFlashcards, buildQuestions, buildDesafio, buildSummarySlides, partitionWorkedExamplesForFindError } from './assemble.js';
import { CAPABILITIES, resolveContentType, type ContentCapabilities } from '../../services/contentType.js';

/**
 * v2 generation entry point — a fixed, 2-AI-call pipeline for every document,
 * regardless of pedagogical type:
 *   1. `buildKnowledgeObject` — one AI call, extracts structured concepts.
 *   2. `generateDistractors`  — one AI call, one question per concept.
 *   3. `assemble.ts`          — pure code, builds every frontend-facing shape.
 *
 * Unlike the legacy PROCEDURAL path in `generationService.ts` (up to 4
 * separate skill-mission AI calls), this NEVER branches the number of AI
 * calls based on content. `classifyContent` is reused ONLY to label
 * `metadata.pedagogicalType` for analytics/display — its result never
 * changes how many calls are made or which functions run.
 *
 * `userId`/`documentId` are not inputs here on purpose — this function only
 * knows how to turn a transcription into content. The caller (the queue
 * worker) owns request/job identity and must overwrite
 * `session.id`/`session.userId`/`session.documentId` before persisting.
 */
export async function generateSessionV2(
  transcription: string,
  config: SessionConfig,
  curso: string,
): Promise<GeneratedSession> {
  const ko = await buildKnowledgeObject(transcription, curso);

  // Reject non-academic uploads (a receipt, an unrelated photo) right after
  // the first AI call — before the second, paid call (generateDistractors)
  // and before building any session content. NemUp is a school-support app,
  // so this is unconditional — never gated behind a flag (v2 only; v1 never
  // calls buildKnowledgeObject at all).
  if (!ko.isSchoolContent) {
    console.warn(`[v2][comprehension] Rechazado — no es contenido escolar. Motivo del modelo: ${ko.rejectionReason ?? '(sin especificar)'}`);
    throw new Error('Este material no corresponde a una asignatura escolar. NemUp solo genera sesiones a partir de contenido escolar.');
  }

  const distractors = await generateDistractors(ko.concepts, ko.concepts.length);

  // Procedural mode trigger: SOLELY whether the material gave us solved
  // exercises to explain (statement + answer both present) — deliberately
  // independent of classifyContent's CONCEPTUAL/PROCEDURAL label below, which
  // stays a metadata-only signal. A guide the Audit calls "conceptual" still
  // gets worked-example slides if it happens to include solved exercises.
  const isProceduralMode = ko.workedExamples.length >= 1;
  const workedExampleResults = isProceduralMode
    ? await buildWorkedExampleSteps(ko.workedExamples)
    : [];
  console.log(
    isProceduralMode
      ? `[v2] Modo procedimental activado — ${ko.workedExamples.length} ejemplo(s) resuelto(s) detectado(s).`
      : '[v2] Modo conceptual — sin ejemplos resueltos detectados en el material.',
  );

  // classification/contentType/capabilities are resolved here — right after
  // buildKnowledgeObject/buildWorkedExampleSteps, BEFORE generateExercises —
  // specifically so Paso 3's role-aware exercise weighting (below) can pass
  // `capabilities.roleAware` into it. Safe to compute this early: neither
  // `ko` nor `transcription` is mutated by generateDistractors/
  // buildWorkedExampleSteps above (both only read `ko.concepts`/
  // `ko.workedExamples` and return newly-built results) — confirmed by
  // inspection before reordering, since this is the one place in this
  // function where execution order was ever moved.
  //
  // match_pairs ("Relaciona cada concepto con su ejemplo") fits CONCEPTUAL/
  // MEMORIZATION material well (term↔definition, concept↔example) but is a
  // forced, poorly-legible pairing on PROCEDURAL/math content (procedure
  // name ↔ algebraic expression) — that material is already covered by
  // worked-example/fill_blank/quiz slides, so match_pairs is skipped there
  // instead of degrading it. MIXED content follows whichever score
  // dominates.
  //
  // `classification` (classifyContent's regex-over-transcription label) is
  // kept as metadata (pedagogicalType below) and as resolveContentType's
  // optional tie-break signal — it is NO LONGER the primary source for this
  // gate. See services/contentType.ts's own doc comment for why: a regex
  // count over the raw transcription can score a procedural worksheet as
  // CONCEPTUAL when it has a definitional preamble (diagnosed case:
  // "Términos semejantes"), silently enabling match_pairs on content it was
  // designed to skip.
  const classification = classifyContent(transcription);
  const wordCount = transcription.split(/\s+/).filter(Boolean).length;
  const s = classification.scores;
  const legacyAllowMatchPairs =
    classification.type === 'CONCEPTUAL' ||
    classification.type === 'MEMORIZATION' ||
    (classification.type === 'MIXED' && s.conceptual >= s.procedural);
  console.log('[match_pairs gate] type=%s allow=%s', classification.type, legacyAllowMatchPairs);

  // Always resolved + logged (even with the flag off) so the new signal is
  // auditable against the old one in production before ever flipping the
  // flag on for real traffic.
  const contentType = resolveContentType(ko, classification);

  // FEATURE_CONTENT_TYPE_V2 off (default): capabilities reproduces the
  // exact legacyAllowMatchPairs value above, byte-identical to before this
  // flag existed. On: capabilities comes from the CAPABILITIES table keyed
  // by the newly-resolved contentType — this is the actual behavior change
  // (e.g. "Términos semejantes" now correctly gets allowMatchPairs=false).
  const capabilities: ContentCapabilities = appConfig.content_type_v2
    ? CAPABILITIES[contentType]
    : { ...CAPABILITIES.conceptual, allowMatchPairs: legacyAllowMatchPairs, allowExampleReinforcement: legacyAllowMatchPairs };

  // Generated-exercise trigger: subject-based, not an AI-judged field on the
  // KnowledgeObject — see exerciseGenerator.ts's isExercisableSubject for why
  // (avoids the same run-to-run inconsistency workedExamples had). Independent
  // of isProceduralMode above — generated exercises are ADDED on top of any
  // material-derived worked examples, not a replacement for them.
  //
  // Computed BEFORE find_error (moved up from after it) specifically so
  // find_error's pool-sourcing fallback below can draw from `exercises` —
  // confirmed safe to reorder: generateExercises only reads ko.concepts/
  // ko.subject/capabilities.roleAware (all already resolved above), and
  // nothing between here and the old position depended on execution order,
  // only on the final values (same check this function's own comment above
  // already documents for the classification/capabilities move).
  const shouldGenerateExercises = isExercisableSubject(ko.subject ?? '');
  if (!ko.subject) {
    console.warn(`[v2][exerciseGenerator] ko.subject vino vacío — no se generarán ejercicios aunque el material lo amerite (topic="${ko.topic}").`);
  }
  let exercises = shouldGenerateExercises
    ? await generateExercises(ko.concepts, ko.subject ?? '', capabilities.roleAware)
    : [];

  // ===== PUNTO DE EXTENSIÓN: capa de validación (Fase futura) =====
  // Hoy `exercises` pasa directo, sin verificar que correctAnswer sea
  // matemáticamente correcta — riesgo de producto asumido en esta fase (ver
  // nota en exerciseGenerator.ts). FASE FUTURA: descomentar la línea
  // siguiente cuando exista un verificador (math.js para álgebra, o un
  // segundo LLM) — no requiere tocar el generador ni assemble.ts:
  // exercises = await validateExercises(exercises);
  // ================================================================

  console.log(
    shouldGenerateExercises
      ? `[v2] Ejercicios generados: ${exercises.length} (subject="${ko.subject}")`
      : `[v2] Material no ejercitable (subject="${ko.subject ?? ''}") — Misión con preguntas conceptuales.`,
  );

  // find_error: only ever attempted for concepts the model itself tagged
  // "procedure". `capabilities.findError` is false in every CAPABILITIES
  // profile today (ship-inert-first rollout — see contentType.ts) so this is
  // a no-op today regardless of content type; flipping it on later needs no
  // change here.
  //
  // No-repeat-within-a-session: workedExamples are a SHARED resource between
  // find_error and the worked_example ("paso a paso") slides — both used to
  // pick independently from the full ko.workedExamples list, so they could
  // land on the exact same exercise (find_error deriving its error from the
  // very statement already shown step-by-step). partitionWorkedExamplesForFindError
  // runs the SAME selection buildSummarySlides uses later to decide what's
  // shown as worked_example, computed early so find_error can be restricted
  // to whatever's left over.
  //
  // Two-phase sourcing (fixes find_error starving on a material with too few
  // solved exercises to reserve one for paso-a-paso AND still have one left
  // for find_error — e.g. a 1-worked-example guide):
  //   Fase 1 (material): exactly today's behavior — one AI call over every
  //     procedure concept against the leftover workedExamples pool.
  //   Fase 2 (pool): for whichever procedure concepts fase 1 left uncovered
  //     (no worked example at all, or none the model could turn into a valid
  //     item), selectPoolCandidatesForFindError picks each concept's OWN
  //     validated, multi-term generated exercise (exerciseGenerator.ts's
  //     pool — see that function's own comment for the two hard
  //     requirements) and a second, smaller generateFindError call runs
  //     against just those — the exact same function/prompt/safety gate as
  //     fase 1, never duplicated logic, just a different candidate list.
  // Every pool-sourced result then has its source exercise removed from
  // `exercises` (removeConsumedPoolExercise, math-equivalence match) BEFORE
  // `exercises` is handed to buildSummarySlides below — otherwise that same
  // exercise could also surface as a normal calculation micro_challenge,
  // breaking the "no repeat within a session" guarantee (Cambio 3).
  const workedExamplesForFindError = partitionWorkedExamplesForFindError(ko.workedExamples, workedExampleResults);
  const procedureConcepts = ko.concepts.filter((c) => c.role === 'procedure');
  const findErrorByConcept = new Map<string, FindErrorResult>();

  if (capabilities.findError && procedureConcepts.length > 0) {
    if (workedExamplesForFindError.length > 0) {
      const fromMaterial = await generateFindError(procedureConcepts, workedExamplesForFindError);
      fromMaterial.forEach((result, conceptId) => findErrorByConcept.set(conceptId, result));
    }

    const uncovered = procedureConcepts.filter((c) => !findErrorByConcept.has(c.id));
    const { concepts: poolConcepts, examples: poolExamples } = selectPoolCandidatesForFindError(uncovered, exercises);

    if (poolConcepts.length > 0) {
      const fromPool = await generateFindError(poolConcepts, poolExamples);
      fromPool.forEach((result, conceptId) => {
        findErrorByConcept.set(conceptId, result);
        exercises = removeConsumedPoolExercise(exercises, result);
      });
      console.log(`[v2][FindError] ${fromPool.size}/${poolConcepts.length} concepto(s) adicionales con find_error desde el pool de ejercicios generados (no del material).`);
    }
  }

  const generation: GenerationResult = {
    subject: ko.subject || config.subject || 'Tema del material',
    topic: ko.topic || config.topic || 'Resumen del material',
    questions: buildQuestions(ko, distractors),
    flashcards: buildFlashcards(ko),
    summary: {
      id: randomUUID(),
      title: ko.topic || 'Resumen del material',
      slides: buildSummarySlides(ko, distractors, workedExampleResults, exercises, appConfig.mission_arc_v2, appConfig.mission_shorten, capabilities, findErrorByConcept),
      sourceQuotes: [],
    },
    groundingScore: 0, // placeholder — replaced below with the real validateGrounding() result
    pedagogicalType: classification.type,
  };

  // Each concept now carries a literal sourceQuote (see comprehension.ts), so
  // flashcards/questions built from it have a real quote to verify — this
  // makes validateGrounding meaningful again instead of trivially passing on
  // an empty-quote list.
  const grounding = validateGrounding(generation, transcription);
  generation.groundingScore = grounding.score;
  if (!grounding.validated) {
    console.warn(`[v2][grounding] score bajo: ${grounding.score.toFixed(2)} — posibles citas no ancladas`, grounding.missingQuotes);
  }

  const session = buildGeneratedSession('', '', transcription, wordCount, config, generation);

  // `desafio` is not part of the typed `GeneratedSession` interface today —
  // this mirrors the exact same runtime shape the legacy path already
  // produces in routes/sessions.ts (`(session as any).desafio = ...`).
  (session as any).desafio = buildDesafio(ko, distractors, workedExampleResults, capabilities);

  return session;
}
