/**
 * Compares real OpenAI token cost between the v1 (legacy) and v2 pipelines,
 * running both against the same test document with real API calls.
 *
 * Usage:
 *   npx tsx scripts/estimateCost.ts [--file path/to/document.txt] [--curso "1º Medio"]
 *
 * Without --file, runs against a short built-in sample document.
 *
 * Requires the SAME env vars as the backend server (OPENAI_API_KEY,
 * FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_STORAGE_BUCKET) — config.ts
 * validates all three at import time and exits if any are missing, even
 * though this script never touches Firebase itself.
 *
 * Scope note: the "v1 (legacy)" path compared here is extractKnowledge +
 * generateSessionContent — the CONCEPTUAL/MEMORIZATION single-mission route,
 * which is the common case. It does NOT include the PROCEDURAL multi-skill
 * path (up to 4x generateSkillMission calls) or generateDesafioFormats —
 * both are separate cost multipliers outside what's being compared here.
 * It also does NOT include any regeneration call: that branch was removed
 * from generateSessionContent in an earlier change (it now only logs
 * `wouldHaveRegenerated` instead of firing a second AI call), so today's
 * v1 path is already down to 2 calls, same count as v2 — the difference
 * measured here is prompt/output SIZE per call, not call count.
 */

import { readFileSync } from 'fs';
import { extractKnowledge } from '../src/services/knowledgeExtractor.js';
import { generateSessionContent } from '../src/services/generationService.js';
import { buildKnowledgeObject } from '../src/generation/v2/comprehension.js';
import { generateDistractors } from '../src/generation/v2/distractors.js';
import { getUsageRecords, resetUsageRecords } from '../src/services/usageTracking.js';
import type { SessionConfig } from '../src/types.js';

// gpt-4.1-mini pricing, USD per 1M tokens (platform.openai.com/docs/pricing).
// Hardcoded snapshot, not fetched live — verify against current pricing before
// trusting this output for real budgeting; OpenAI changes prices without notice.
const PRICE_PER_1M_INPUT = 0.40;
const PRICE_PER_1M_OUTPUT = 1.60;

function costUSD(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1_000_000) * PRICE_PER_1M_INPUT + (completionTokens / 1_000_000) * PRICE_PER_1M_OUTPUT;
}

// Short built-in sample so the script is runnable without supplying a file.
const SAMPLE_TRANSCRIPTION = `
Objetivo: 1. Reconocer las partes de un término algebraico.
Un término algebraico está compuesto por un coeficiente numérico y una parte literal formada por una
o más variables elevadas a exponentes. Por ejemplo, en el término 5x², el coeficiente es 5, la variable
es x y el exponente es 2.

2. Clasificar expresiones algebraicas.
Una expresión algebraica se clasifica según su cantidad de términos: un monomio tiene un solo término
(por ejemplo 5x²), un binomio tiene dos términos separados por + o - (por ejemplo 3x + 2), y un
polinomio tiene tres o más términos.

3. Reducir términos que sean semejantes.
Dos términos son semejantes cuando tienen exactamente la misma parte literal (misma variable y mismo
exponente), aunque tengan distinto coeficiente. Para reducir términos semejantes se suman o restan sus
coeficientes y se mantiene la parte literal sin cambios. Por ejemplo, 3x + 5x se reduce a 8x, porque
ambos términos comparten la parte literal x.

Ejercicios:
1) Observa el dibujo y contesta las siguientes preguntas: ¿Podemos sumar todas las frutas? Explica con
tus propias palabras por qué sí o por qué no, usando lo aprendido sobre términos semejantes.
2) Reconoce los elementos de un término algebraico: escribe en el recuadro el elemento que corresponda
al ejemplo dado.
3) Reduce las siguientes expresiones algebraicas: 3(3x-1) + 5(x+4); 2x² + 5x - 8x² - 11x + 6.
4) Desafíos: reduce las siguientes expresiones algebraicas con paréntesis.
`.trim();

function parseArgs(): { file?: string; curso: string } {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const cursoIdx = args.indexOf('--curso');
  return {
    file: fileIdx >= 0 ? args[fileIdx + 1] : undefined,
    curso: cursoIdx >= 0 ? args[cursoIdx + 1] : '1º Medio',
  };
}

interface RunTotals {
  label: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

function summarize(label: string): RunTotals {
  const records = getUsageRecords();
  const promptTokens = records.reduce((sum, r) => sum + r.promptTokens, 0);
  const completionTokens = records.reduce((sum, r) => sum + r.completionTokens, 0);
  const cost = costUSD(promptTokens, completionTokens);

  console.log(`\n=== ${label} ===`);
  records.forEach((r) => console.log(`  ${r.label}: prompt=${r.promptTokens} completion=${r.completionTokens} total=${r.totalTokens}`));
  console.log(`  TOTAL: prompt=${promptTokens} completion=${completionTokens} -> $${cost.toFixed(4)} USD`);

  return { label, calls: records.length, promptTokens, completionTokens, costUsd: cost };
}

async function main() {
  const { file, curso } = parseArgs();
  const transcription = file ? readFileSync(file, 'utf8') : SAMPLE_TRANSCRIPTION;
  const wordCount = transcription.split(/\s+/).filter(Boolean).length;
  console.log(`[estimateCost] documento: ${file ?? '(muestra incorporada)'} — ${wordCount} palabras — curso: ${curso}`);

  const sessionConfig: SessionConfig = {
    documentId: 'estimate-cost-test',
    format: ['quizzes', 'flashcards'],
    difficulty: 'adaptive',
    estimatedDuration: 18,
    curso,
  };

  // ── v1 (legacy): extractKnowledge + generateSessionContent ──────────────────
  resetUsageRecords();
  const knowledgeGraph = await extractKnowledge({ transcription, curso });
  await generateSessionContent(transcription, sessionConfig, curso, knowledgeGraph);
  const v1 = summarize('MOTOR VIEJO (v1: extractKnowledge + generateSessionContent)');

  // ── v2 (nuevo): buildKnowledgeObject + generateDistractors ──────────────────
  resetUsageRecords();
  const ko = await buildKnowledgeObject(transcription, curso);
  await generateDistractors(ko.concepts, ko.concepts.length);
  const v2 = summarize('MOTOR NUEVO (v2: comprehension + distractors)');

  console.log('\n=== COMPARACIÓN ===');
  console.log(`  Llamadas:         v1=${v1.calls}          vs  v2=${v2.calls}`);
  console.log(`  Prompt tokens:    v1=${v1.promptTokens}   vs  v2=${v2.promptTokens}`);
  console.log(`  Completion tok.:  v1=${v1.completionTokens}   vs  v2=${v2.completionTokens}`);
  console.log(`  Costo:            v1=$${v1.costUsd.toFixed(4)}   vs  v2=$${v2.costUsd.toFixed(4)}`);
  if (v1.costUsd > 0) {
    const savingsPct = ((1 - v2.costUsd / v1.costUsd) * 100).toFixed(1);
    console.log(`  Ahorro v2 vs v1:  ${savingsPct}%`);
  }
}

main().catch((err) => {
  console.error('[estimateCost] error:', err);
  process.exit(1);
});
