import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import { knowledgeObjectSchema } from './schemas.js';
import type { KnowledgeObject } from './types.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

const SYSTEM_PROMPT = `Eres un extractor de conocimiento pedagógico para estudiantes chilenos de enseñanza media.
Tu única tarea es identificar los conceptos nucleares de un material y devolverlos en el JSON solicitado.
No generes preguntas, ejercicios ni pantallas — eso lo resuelve otra etapa. Solo extrae conocimiento.`;

function buildUserPrompt(transcription: string, curso: string): string {
  return `CURSO: ${curso}

MATERIAL A ANALIZAR:
"""
${transcription}
"""

INSTRUCCIONES:
1. Extrae entre 3 y 6 conceptos NUCLEARES del material (los indispensables para entenderlo, no cualquier mención de paso).
2. simpleExplanation: máximo 25 palabras, en lenguaje natural para un adolescente de 14-18 años.
3. definition: formal y precisa, tomada del material — no inventes contenido ajeno a él.
4. example: un ejemplo concreto tomado o inferido del material, o null si no aplica.
5. tips: 1-3 frases cortas de estudio o mnemotecnia.
6. difficulty: 1 (más fácil) a 5 (más difícil), relativo a los demás conceptos de esta lista.
7. distinctiveTrait: un rasgo VERDADERO para este concepto y FALSO para TODOS los demás conceptos de la lista.
   Se usa para armar ejercicios de completar y relacionar sin otra llamada a la IA — si el rasgo también
   es cierto para otro concepto, el ejercicio queda ambiguo.
   ✗ VAGO: "Es importante en el tema" (no distingue nada de los demás conceptos).
   ✓ BUENO: "Es el único de los listados que libera oxígeno como subproducto."
8. categories: SOLO si el material presenta una clasificación clara con 3 o más ejemplos concretos
   (ej. tipos de X con ≥3 casos). Si no existe esa clasificación, devuelve [].
9. sourceQuote: un fragmento COPIADO PALABRA POR PALABRA del material (idealmente una oración completa,
   entre 8 y 30 palabras), del que se extrajo este concepto. Debe poder encontrarse LITERALMENTE en el
   texto original — no cambies, resumas ni parafrasees ninguna palabra. Esto se usa para verificar que
   el concepto realmente proviene del material, no de conocimiento externo.
   ✗ PARAFRASEADO (inválido): material dice "La mitocondria es la organela que produce energía celular
     mediante la respiración." → sourceQuote="Las mitocondrias generan energía para la célula" (son
     palabras distintas, no se puede encontrar textual en el material).
   ✓ LITERAL (válido): sourceQuote="La mitocondria es la organela que produce energía celular mediante
     la respiración." (copiado exacto, carácter por carácter, del material).
10. workedExamples: extrae SOLO los ejercicios del material que tengan A LA VEZ enunciado Y respuesta
    explícita ya escrita en el texto (ejercicios resueltos, no propuestos). Copia AMBOS literalmente,
    palabra por palabra — mismo criterio que sourceQuote, nunca los recalcules ni los corrijas.
    Si un ejercicio solo tiene enunciado sin respuesta visible en el material, NO lo incluyas.
    Si el material no contiene ningún ejercicio resuelto, devuelve workedExamples: [].
    Ejemplo del material real: statement="2m − 5n + 6m − m + 11n", answer="7m + 6n".

Usa el material como única fuente. No agregues conceptos que no estén en él.`;
}

/** Chunks + flattens newlines before logging so an embedded-newline-heavy prompt can't burst a log-rate limit. */
function logPrompt(label: string, text: string): void {
  const flat = text.replace(/\r?\n/g, ' ⏎ ');
  const CHUNK = 3500;
  const total = Math.max(1, Math.ceil(flat.length / CHUNK));
  console.log(`[${label}] ── INICIO (${text.length} chars, ${total} partes) ──`);
  for (let i = 0; i < total; i++) {
    console.log(`[${label}][${i + 1}/${total}] ${flat.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  }
  console.log(`[${label}] ── FIN ──`);
}

/**
 * Extracts a structured `KnowledgeObject` from a document's transcription —
 * the v2 engine's comprehension stage. Uses Structured Outputs
 * (`response_format: json_schema`, strict) so the response is guaranteed to
 * match `KnowledgeObject` without any fallback JSON parsing.
 */
export async function buildKnowledgeObject(
  transcription: string,
  curso: string,
): Promise<KnowledgeObject> {
  const userPrompt = buildUserPrompt(transcription, curso);

  logPrompt('Comprehension-System', SYSTEM_PROMPT);
  logPrompt('Comprehension-User', userPrompt);

  const raw = await withOpenAIRetry(async () => {
    const response = await openai.chat.completions.create({
      model: config.openai_model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4200, // bumped from 3500 to fit workedExamples (statement+answer pairs, up to a handful per document)
      response_format: knowledgeObjectSchema,
    });
    recordUsage('Comprehension', response.usage);
    return response.choices?.[0]?.message?.content ?? '';
  }, 'Comprehension', 2);

  if (!raw) {
    throw new Error('[Comprehension] empty response from model');
  }

  return JSON.parse(raw) as KnowledgeObject;
}
