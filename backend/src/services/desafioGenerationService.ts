/**
 * Desafío Format Generation Service
 *
 * Makes a small, focused AI call AFTER Mission generation is complete.
 * Receives concept blocks already produced by the Mission and assigns
 * evaluation formats (fill_blank, match_pairs, classify) without
 * generating new content.
 *
 * Constraints enforced via prompt:
 *   - blankSentence = exact microFeedback text with concept name → ___
 *   - match_pairs pairs use ONLY concept names and definition excerpts
 *   - classify uses ONLY examples already present in the content
 */

import OpenAI from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

// ── Public types (consumed by desafioAdapter.ts and sessions.ts) ─────────────

export interface ConceptFormatEntry {
  interactionType: 'fill_blank' | 'multiple_choice';
  blankSentence?: string;
}

export interface MatchPairsSpec {
  insertAfterConceptIndex: number;
  prompt: string;
  pairs: Array<{ left: string; right: string }>;
  pairsExplanation?: string; // natural sentence for the wrong-answer feedback panel
}

export interface ClassifySpec {
  insertAfterConceptIndex: number;
  prompt: string;
  categories: string[];
  items: Array<{ text: string; category: string }>;
}

export interface DesafioFormatAssignment {
  conceptFormats: Record<number, ConceptFormatEntry>;
  matchPairs: MatchPairsSpec | null;
  classify: ClassifySpec | null;
}

// ── Internal concept block structure ─────────────────────────────────────────

interface ConceptBlock {
  conceptIndex: number;
  name: string;
  definition: string;
  example?: string;
  microFeedback?: string;
  otherConceptNames: string[]; // competing concepts — used to craft a distinctive predicate
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractConceptBlocks(slides: any[]): ConceptBlock[] {
  const blocks: ConceptBlock[] = [];
  let conceptIndex = 0;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide?.type !== 'main_concept') continue;

    // The micro_challenge for this concept is the one immediately before it
    // in the Duolingo Loop order: micro → main → reinforcement
    const preceding = slides.slice(0, i).reverse();
    const micro = preceding.find((s: any) => s?.type === 'micro_challenge');

    blocks.push({
      conceptIndex: conceptIndex++,
      name: String(slide.title ?? '').trim(),
      definition: String(slide.definition ?? '').trim(),
      example: slide.example ? String(slide.example).trim() : undefined,
      microFeedback: micro?.feedbackCorrect ? String(micro.feedbackCorrect).trim() : undefined,
      otherConceptNames: [], // populated in second pass below
    });
  }

  // Second pass: give each block the names of all OTHER concepts in the session
  const allNames = blocks.map(b => b.name);
  for (const block of blocks) {
    block.otherConceptNames = allNames.filter(n => n !== block.name);
  }

  return blocks;
}

function validateBlankSentence(s: unknown): string | undefined {
  if (typeof s !== 'string' || !s.includes('___') || s.trim().length < 10) return undefined;
  return s.trim();
}

// Strips leading articles and truncates to max 5 words — allows verb phrases like
// "Comparten origen evolutivo" or "Conservan restos en rocas"
function shortenPairRight(text: string): string {
  const stripped = text.replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, '').trim();
  const words = stripped.split(/\s+/);
  return words.slice(0, 5).join(' ');
}

function validatePairs(pairs: unknown): Array<{ left: string; right: string }> | null {
  if (!Array.isArray(pairs) || pairs.length < 3) return null;
  const result = pairs
    .slice(0, 3) // max 3 pairs — Duolingo-style: focused, low cognitive load
    .map((p: any) => ({
      left:  String(p?.left  ?? '').trim(),
      right: shortenPairRight(String(p?.right ?? '').trim()),
    }))
    .filter(p => p.left.length > 0 && p.right.length > 0);
  return result.length >= 3 ? result : null;
}

function validateClassify(parsed: any): { categories: string[]; items: Array<{ text: string; category: string }> } | null {
  const cats = Array.isArray(parsed?.categories)
    ? parsed.categories.map(String).filter((c: string) => c.trim().length > 0)
    : [];
  if (cats.length < 2) return null;

  const items = Array.isArray(parsed?.items)
    ? parsed.items
        .map((it: any) => ({ text: String(it?.text ?? '').trim(), category: String(it?.category ?? '').trim() }))
        .filter((it: { text: string; category: string }) => it.text.length > 0 && cats.includes(it.category))
    : [];
  if (items.length < 3) return null;

  return { categories: cats, items };
}

// ── Output schema (embedded in prompt) ───────────────────────────────────────

const OUTPUT_SCHEMA = `{
  "conceptFormats": [
    { "conceptIndex": 0, "interactionType": "fill_blank", "blankSentence": "La evidencia llamada ___ consiste en restos de organismos conservados en rocas sedimentarias." },
    { "conceptIndex": 1, "interactionType": "multiple_choice" }
  ],
  "matchPairs": {
    "prompt": "Relaciona",
    "pairsExplanation": "Corrección puntual en 8 palabras. Mini regla en 8 palabras.",
    "pairs": [
      { "left": "Nombre exacto del concepto", "right": "Verb phrase 2-5 palabras" }
    ]
  },
  "classify": {
    "prompt": "Clasifica cada elemento según su tipo",
    "categories": ["Categoría A", "Categoría B"],
    "items": [
      { "text": "elemento del contenido", "category": "Categoría A" }
    ]
  }
}`;

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateDesafioFormats(
  missionSlides: any[],
  topic: string,
): Promise<DesafioFormatAssignment> {
  const blocks = extractConceptBlocks(missionSlides);
  const N = blocks.length;

  if (N === 0) return { conceptFormats: {}, matchPairs: null, classify: null };

  // Insertion positions computed here — not delegated to the AI
  const matchPairsInsertAfter = Math.ceil(N / 2) - 1;
  const classifyInsertAfter   = Math.max(N - 2, matchPairsInsertAfter + 1);

  const prompt = `Eres un adaptador de formatos de evaluación pedagógica.
Tu ÚNICA tarea: asignar formatos de presentación a conceptos ya generados.

RESTRICCIÓN ABSOLUTA — NO GENERES CONTENIDO NUEVO:
- Usa SÓLO información de los campos "definition" y "microFeedback" ya provistos
- Para match_pairs: usa el valor exacto de "name" en "left" y una VERB PHRASE en "right" en 3ª PERSONA SINGULAR (2-6 palabras, sin artículos)
  El frontend ajusta automáticamente a plural cuando el concepto lo requiere.

  CALIDAD OBLIGATORIA DEL DESCRIPTOR (right):
  Cada descriptor debe expresar UNO de estos tipos de contenido:
    1. Función específica:  "conserva restos en rocas sedimentarias"
    2. Propiedad clave:     "comparte origen pero difiere en función"
    3. Relación causal:     "revela parentesco por similitud estructural"
    4. Evidencia observable:"muestra cambios en capas de estratos"

  Prioridad: PRECISIÓN CONCEPTUAL > brevedad > naturalidad.

  ✗ DESCRIPTORS VAGOS PROHIBIDOS — evitar frases que describan relaciones entre conceptos en lugar de propiedades del concepto:
    "tiene función similar pero diferente"  → demasiado vago
    "se parece a otro concepto"            → comparativo sin contenido
    "es un tipo de evidencia"              → sin especificidad
    "pertenece a la biología"              → trivial

  ✓ DESCRIPTORS PRECISOS — cada uno ancla a UN rasgo concreto e irrepetible:
    "conserva restos en rocas sedimentarias"     → propiedad de Registro fósil
    "comparte origen pero cumple función distinta" → propiedad de Órganos homólogos
    "cumple función similar con origen distinto"  → propiedad de Órganos análogos
    "muestra similitudes en etapas embrionarias" → propiedad de Embriología

  ⚠️ REGLA DE EXCLUSIVIDAD OBLIGATORIA: cada "right" debe ser verdadero para UN SOLO concepto de la lista.
  Verifica: "¿Esta frase también describe a algún otro concepto de la lista?" Si sí → reemplaza con rasgo más específico.
  Ejemplo de error: "tiene función distinta" → aplica a Homólogos Y Análogos → INVÁLIDO.
  Ejemplo correcto: "cumple función similar con origen distinto" → SOLO aplica a Análogos → VÁLIDO.
- El prompt del ejercicio debe ser "Relaciona" (corto, directo — no "Une cada concepto con su descripción")
- Para matchPairs incluye también "pairsExplanation": DOS frases cortas naturales que forman el feedback de corrección.
  Estructura obligatoria: [Corrección puntual de 1 concepto — máx 8 palabras]. [Mini regla general — máx 8 palabras].
  ✓ Ejemplo: "Registro fósil conserva restos en rocas sedimentarias. Los fósiles revelan la historia de la vida."
  ✓ Ejemplo: "Anatomía comparada estudia estructuras físicas similares. Las estructuras revelan ancestros comunes."
  ✗ No digas que el estudiante se equivocó. No uses "corresponde a".
- Para classify: usa SÓLO ejemplos ya mencionados en "definition" o "example"
- Si no hay contenido suficiente para classify → devuelve null

PATRÓN OBLIGATORIO PARA blankSentence — ANCHOR + ___ + PREDICADO:
Construye una NUEVA oración (no copies microFeedback directamente) siguiendo este patrón:

  ANCHOR (antes del ___):
  - Frase que introduce el blank de forma GRAMATICALMENTE NEUTRAL con CUALQUIER opción
  - ✓ Usa: "La evidencia denominada ___", "El proceso llamado ___", "El concepto conocido como ___",
           "La estructura de tipo ___", "El mecanismo denominado ___", "El fenómeno llamado ___"
  - ✗ NUNCA pongas un artículo solo antes del hueco: "La ___", "El ___", "Los ___", "Las ___"
    (revelaría género/número y el estudiante eliminaría opciones por gramática, no por conocimiento)

  PREDICADO (después del ___):
  - La característica MÁS DISTINTIVA del concepto correcto, extraída de "definition" o "microFeedback"
  - Debe ser: ✓ claramente VERDADERA para el concepto correcto
              ✓ claramente FALSA o IMPRECISA para cada nombre en "otherConceptNames"
  - Si el predicado es verdadero para más de un concepto → es demasiado genérico, elige otro rasgo

  Ejemplo:
    concepto="Registro fósil", otherConceptNames=["Anatomía comparada","Biogeografía"]
    ✗ MAL: "La evidencia llamada ___ revela cambios en los seres vivos." (verdadero para todos)
    ✓ BIEN: "La evidencia llamada ___ consiste en restos de organismos conservados en rocas sedimentarias."
      → "Anatomía comparada" no consiste en restos en rocas ✗
      → "Biogeografía" no consiste en restos en rocas ✗

CONCEPTOS (N=${N}):
${JSON.stringify(blocks, null, 2)}

INSTRUCCIONES:
1. Alterna fill_blank / multiple_choice por concepto, empezando con fill_blank
2. blankSentence DEBE contener exactamente ___ (triple guion bajo)
3. Si N ≥ 3: incluye matchPairs con exactamente 3 pares (los más representativos) — prompt = "Relaciona"
4. Si el contenido tiene categorías claras con ≥ 3 ejemplos específicos: incluye classify — si no, pon null
5. matchPairs y classify son opcionales si el contenido no lo permite — pon null en ese caso

Devuelve SÓLO JSON válido con esta estructura exacta:
${OUTPUT_SCHEMA}`;

  let raw = '';
  try {
    const response = await openai.chat.completions.create({
      model: config.openai_model,
      messages: [
        {
          role: 'system',
          content: 'Eres un adaptador de formatos pedagógicos. Responde ÚNICAMENTE con JSON válido, sin texto adicional.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });
    raw = response.choices?.[0]?.message?.content ?? '';
  } catch (err: any) {
    console.warn('[DesafioFormats] AI call failed:', err?.message);
    return { conceptFormats: {}, matchPairs: null, classify: null };
  }

  let parsed: any;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match?.[0] ?? raw);
  } catch {
    console.warn('[DesafioFormats] Could not parse AI response — falling back to multiple_choice');
    return { conceptFormats: {}, matchPairs: null, classify: null };
  }

  // ── Build conceptFormats record ───────────────────────────────────────────
  const conceptFormats: Record<number, ConceptFormatEntry> = {};
  for (const f of (parsed.conceptFormats ?? [])) {
    if (typeof f?.conceptIndex !== 'number') continue;
    const isFillBlank = f.interactionType === 'fill_blank';
    const blankSentence = isFillBlank ? validateBlankSentence(f.blankSentence) : undefined;
    conceptFormats[f.conceptIndex] = {
      interactionType: isFillBlank && blankSentence ? 'fill_blank' : 'multiple_choice',
      blankSentence,
    };
  }

  // ── Build matchPairs ──────────────────────────────────────────────────────
  let matchPairs: MatchPairsSpec | null = null;
  if (N >= 3 && parsed.matchPairs) {
    const pairs = validatePairs(parsed.matchPairs.pairs);
    if (pairs) {
      const rawExplanation = parsed.matchPairs.pairsExplanation;
      matchPairs = {
        insertAfterConceptIndex: matchPairsInsertAfter,
        prompt: String(parsed.matchPairs.prompt ?? 'Une cada concepto con su descripción'),
        pairs,
        ...(typeof rawExplanation === 'string' && rawExplanation.trim().length > 5
          ? { pairsExplanation: rawExplanation.trim() }
          : {}),
      };
    }
  }

  // ── Build classify ────────────────────────────────────────────────────────
  let classify: ClassifySpec | null = null;
  if (parsed.classify) {
    const validated = validateClassify(parsed.classify);
    if (validated) {
      classify = {
        insertAfterConceptIndex: classifyInsertAfter,
        prompt: String(parsed.classify.prompt ?? 'Clasifica cada elemento'),
        categories: validated.categories,
        items: validated.items,
      };
    }
  }

  const fillBlankCount = Object.values(conceptFormats).filter(f => f.interactionType === 'fill_blank').length;
  console.log(`[DesafioFormats] fill_blank=${fillBlankCount}/${N} | matchPairs=${!!matchPairs} | classify=${!!classify}`);

  return { conceptFormats, matchPairs, classify };
}
