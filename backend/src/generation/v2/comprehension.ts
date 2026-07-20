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
0. ANTES de extraer nada, evalúa si el material corresponde a una asignatura escolar (cualquiera:
   matemáticas, historia, biología, lenguaje, física, etc.). Completa isSchoolContent con ese
   resultado.
   - Si SÍ corresponde (isSchoolContent=true): rejectionReason=null, y continúa con las
     instrucciones 1-10 normalmente.
   - Si NO corresponde (isSchoolContent=false) — ej. una boleta, una foto sin relación académica,
     una conversación personal, un documento administrativo sin contenido educativo — NO inventes
     conceptos para rellenar el formato. Completa: topic="", subject="", concepts=[], categories=[],
     workedExamples=[], y rejectionReason con una explicación breve (una frase) de por qué no es
     contenido escolar.
   Ante la duda (material ambiguo pero con ALGÚN contenido educativo real, aunque sea breve o de baja
   calidad), clasifícalo como escolar (isSchoolContent=true) — este chequeo es para descartar
   documentos que evidentemente no tienen nada que ver con una asignatura, no para exigir un mínimo
   de calidad pedagógica.
1. Extrae entre 3 y 6 conceptos NUCLEARES del material (los indispensables para entenderlo, no cualquier mención de paso).
2. simpleExplanation: máximo 15 palabras (~2 líneas en la tarjeta). Voz conversacional y cercana, como
   si un amigo mayor se lo explicara a alguien de 14-18 años — con energía y ritmo natural, nunca en
   registro de libro de texto ni acartonado. Es el texto que el estudiante ve primero, el "héroe" de la
   tarjeta — pero la energía nunca se paga con exactitud: sigue siendo fiel al material. Apretado no es
   incompleto: una idea clara y bien dicha, sin cláusulas de más — no una versión cortada de una frase
   más larga.
   ✗ ACARTONADO: "Proceso mediante el cual las especies cambian a lo largo del tiempo."
   ✗ DEMASIADO LARGO (más de 15 palabras): "Cómo tu especie va cambiando de generación en generación,
     poco a poco, para adaptarse mejor y sobrevivir en su ambiente."
   ✓ CERCANO Y BREVE: "Cómo tu especie cambia de generación en generación para sobrevivir mejor."
2b. hook: un gancho o analogía cotidiana (máximo 20 palabras), en el mismo tono cercano, que conecte
    el concepto con algo de la vida de un adolescente (ej. para "evolución": una receta familiar que
    cada generación ajusta un poco). Debe ser CORRECTA — nunca distorsiones el concepto para que suene
    más entretenido. Si no se te ocurre una analogía honesta y precisa para este concepto en particular,
    devuelve null en vez de forzar una mala. Nunca reemplaza a definition/example como fuente de verdad.
2c. emoji: UN solo emoji que represente el TEMA de este concepto en particular — temático y claro,
    NUNCA genérico ni repetido entre conceptos (nada de 💡/✅/📚 igual para todos). Ej.: 🧬 para
    "Evolución", 🦴 para "Registro fósil", 🧪 para "Bioquímica y Biología Molecular". Si no hay un
    emoji temático claro para este concepto, devuelve null en vez de forzar uno genérico.
2d. keyPhrase: un fragmento CORTO (2-5 palabras) que sea la idea más importante de simpleExplanation,
    para resaltarlo en color en la tarjeta. CRÍTICO: debe ser un substring LITERAL de simpleExplanation
    — copiado carácter por carácter, sin parafrasear ni ajustar — porque el frontend lo busca dentro
    de simpleExplanation para colorearlo; si no aparece tal cual, no se resalta nada. Si simpleExplanation
    no tiene un fragmento claro que valga la pena resaltar, devuelve null.
    ✓ simpleExplanation="Cómo tu especie cambia de generación en generación para sobrevivir mejor."
      → keyPhrase="cambia de generación en generación" (substring literal, presente palabra por palabra).
    ✗ keyPhrase="cambio generacional" (no es substring literal — está parafraseado, INVÁLIDO).
3. definition: formal y precisa, tomada del material — no inventes contenido ajeno a él.
4. example: un ejemplo concreto tomado o inferido del material, o null si no aplica. Máximo ~15
   palabras, UNA sola frase — concreto y directo, no una explicación adicional del concepto.
4a. exampleShort: una etiqueta breve (3-6 palabras) que identifique ese mismo ejemplo, concreta y
    COMPLETA (nunca una frase cortada a mitad), y distinta entre los conceptos de esta lista — se usa
    donde el example largo no cabe (tarjetas de relacionar). Ej.: para el ejemplo "El brazo humano y
    el ala de murciélago son huesos homólogos, con el mismo origen evolutivo pero funciones distintas."
    → exampleShort="Mano humana vs. ala de murciélago". Si no se te ocurre una etiqueta breve honesta
    para este ejemplo en particular, devuelve null en vez de forzar una mala o trunca.
4b. advancedExamples: si el material presenta el MISMO concepto en uno o más niveles de dificultad
    mayores (ej. una sección "Desafío"), incluye AQUÍ CADA VARIANTE DISTINTA por separado — no
    elijas solo una si el material muestra varias. Dos ejercicios "avanzados" que agregan cosas
    DIFERENTES (uno con paréntesis, otro con paréntesis Y fracciones) son variantes distintas y
    van los DOS, cada uno en su propio elemento del arreglo — nunca descartes una variante porque
    ya elegiste otra para este concepto.
    Si el material solo muestra un nivel de dificultad para este concepto, devuelve [].
    No inventes ejemplos avanzados que el material no sugiera.
5. tips: UN solo tip de estudio o mnemotecnia, máximo 12 palabras — no un arreglo de varios. Si no se
   te ocurre uno útil y honesto, devuelve [] en vez de forzar uno genérico.
6. difficulty: 1 (más fácil) a 5 (más difícil), relativo a los demás conceptos de esta lista.
7. distinctiveTrait: un rasgo VERDADERO para este concepto y FALSO para TODOS los demás conceptos de la lista.
   Se usa para armar ejercicios de completar y relacionar sin otra llamada a la IA — si el rasgo también
   es cierto para otro concepto, el ejercicio queda ambiguo.
   ✗ VAGO: "Es importante en el tema" (no distingue nada de los demás conceptos).
   ✓ BUENO: "Es el único de los listados que libera oxígeno como subproducto."
8. categories: incluye una clasificación SOLO si el material agrupa ejemplos CONCRETOS en
   2 o más clases, con ≥3 ejemplos en total. La forma debe servir para "arrastra cada
   ejemplo a su clase":
     - Cada elemento del arreglo es UNA CLASE, con:
         name: el nombre de la clase.
         items: los EJEMPLOS CONCRETOS del material que pertenecen a esa clase
                (NUNCA los nombres de las clases).
     - Necesitas ≥2 clases y ≥3 items concretos repartidos entre ellas.
     - Cuando un grupo tiene subtipos, emite SOLO los subtipos como clases. NUNCA incluyas
       la clase paraguas/padre (ej. "Tipos de órganos") como una category.
     - Cada ejemplo concreto pertenece a EXACTAMENTE UNA clase. Prohibido repetir el mismo
       item en dos clases.
     - Usa el término correcto del material (ej. "ala de ave", no "aleta de ave").
   ✓ CORRECTO (órganos homólogos: brazo humano/ala de murciélago; análogos: ala de ave/
     ala de insecto; vestigiales: cóccix, muela del juicio):
       [ {"name":"Homólogos","items":["Brazo humano y ala de murciélago"]},
         {"name":"Análogos","items":["Ala de ave","Ala de insecto"]},
         {"name":"Vestigiales","items":["Cóccix","Muela del juicio"]} ]
   ✗ INCORRECTO: incluir "Tipos de órganos en anatomía comparada" como category, o poner
     "Muela del juicio" tanto en el paraguas como en "Vestigiales".
   Si no hay ejemplos concretos que clasificar (solo nombres de tipos), devuelve [].
9. sourceQuote: un fragmento COPIADO PALABRA POR PALABRA del material (idealmente una oración completa,
   entre 8 y 30 palabras), del que se extrajo este concepto. Debe poder encontrarse LITERALMENTE en el
   texto original — no cambies, resumas ni parafrasees ninguna palabra. Esto se usa para verificar que
   el concepto realmente proviene del material, no de conocimiento externo.
   ✗ PARAFRASEADO (inválido): material dice "La mitocondria es la organela que produce energía celular
     mediante la respiración." → sourceQuote="Las mitocondrias generan energía para la célula" (son
     palabras distintas, no se puede encontrar textual en el material).
   ✓ LITERAL (válido): sourceQuote="La mitocondria es la organela que produce energía celular mediante
     la respiración." (copiado exacto, carácter por carácter, del material).
10. workedExamples: extrae los ejercicios del material que tengan A LA VEZ enunciado Y respuesta
    ya escrita en el texto (ejercicios RESUELTOS, no propuestos). Copia AMBOS literalmente, palabra
    por palabra — mismo criterio que sourceQuote, nunca los recalcules, completes ni corrijas.

    La respuesta puede aparecer de MUCHAS formas — considéralas todas:
      • justo al lado o debajo del enunciado (ej. "3x + 2x = 5x")
      • separada por un signo igual, una flecha, o en otra línea
      • marcada con etiquetas como "R:", "R/", "Resp:", "Respuesta:", "Solución:", "Resultado:", "="
      • en un recuadro, al final del ejercicio, o resaltada
    Si el enunciado y su respuesta están AMBOS presentes en el material (aunque separados por líneas
    o formato), es un ejercicio resuelto → inclúyelo.

    Reglas:
    - Si un ejercicio solo tiene enunciado y NO hay respuesta escrita en ninguna parte del material,
      NO lo incluyas.
    - NUNCA inventes ni calcules una respuesta que no esté literalmente en el texto.
    - Si el material no contiene ningún ejercicio resuelto, devuelve workedExamples: [].

    ✓ SÍ capturar: el material dice "Reduce: 2m − 5n + 6m − m + 11n" y más abajo "= 7m + 6n"
      → statement="2m − 5n + 6m − m + 11n", answer="7m + 6n" (ambos están en el texto).
    ✗ NO capturar: el material dice "Ejercicio 3: factoriza x² + 5x + 6" sin ninguna respuesta escrita
      → no se incluye (no hay respuesta en el material, y calcularla sería inventar).

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
      temperature: 0,
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
