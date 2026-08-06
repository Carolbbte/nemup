/**
 * Adaptador puro: KnowledgeObject + DistractorSet (lo que la generación v2
 * YA produce) → la forma del "banco de contenido" que el Motor Pedagógico
 * del front consume (experience/content/rellenar.ts). CERO llamadas a IA
 * nuevas, cero heurística de generación — solo reordena/renombra datos que
 * ya existen.
 *
 * Los tipos de abajo (`MotorTipoEscalera`, `MotorTipoObjetivo`,
 * `MotorTipoBloque`, `MotorContenido`, `MotorOpcion`) son un espejo
 * estructural de `motor/tipos.ts` y `experience/contracts/contratos.ts` del
 * front — el backend no puede importar esos archivos (proyectos TS
 * separados, mismo motivo por el que `KnowledgeConcept`/`SummarySlide`
 * también se espejan a mano hacia el front). Si esos contratos cambian de
 * forma, este archivo hay que actualizarlo a mano.
 */

import type { KnowledgeConcept, KnowledgeObject, WorkedExample } from './types.js';
import type { DistractorSet } from './distractors.js';

export type MotorTipoEscalera = 'procedimental' | 'cientifica' | 'declarativa' | 'comunicacion' | 'creativa';
export type MotorTipoObjetivo = 'comprender' | 'reconocer' | 'aplicar' | 'transferir' | 'repasar' | 'fluidez';
export type MotorTipoBloque = 'contexto' | 'ejemplo' | 'pregunta' | 'ejercicio' | 'insight' | 'memoria' | 'celebracion';

export interface MotorOpcion {
  id: string;
  texto: string;
  correcta: boolean;
}

export interface MotorContenidoPregunta {
  enunciado: string;
  opciones: MotorOpcion[];
}

export interface MotorContenidoTexto {
  titulo?: string;
  cuerpo: string;
  pasos?: string[];
}

export type MotorContenido = MotorContenidoPregunta | MotorContenidoTexto;

export type MotorBancoConcepto = Partial<Record<MotorTipoObjetivo, Partial<Record<MotorTipoBloque, MotorContenido[]>>>>;

/** conceptoId → banco de ese concepto. */
export type MotorBanco = Record<string, MotorBancoConcepto>;

export interface MotorConceptoSeed {
  id: string;
  nombre: string;
  escalera: MotorTipoEscalera;
}

export interface MotorContent {
  conceptos: MotorConceptoSeed[];
  banco: MotorBanco;
}

/**
 * `pedagogicalType` (el `classification.type` de pedagogicalClassifier.ts —
 * CONCEPTUAL/PROCEDURAL/MEMORIZATION/MIXED) → `TipoEscalera` del motor. Ver
 * el comentario de `TipoEscalera` en motor/tipos.ts: "se elige por el TIPO
 * DE DEMANDA del material... mapea a metadata.pedagogicalType del backend"
 * — este es exactamente ese mapeo, pendiente hasta ahora. Aproximado a
 * propósito (no hay señal de asignatura real acá, solo el tipo de
 * clasificación): PROCEDURAL/MIXED piden ejecutar un procedimiento →
 * procedimental; CONCEPTUAL/MEMORIZATION son más "saber qué es" →
 * declarativa. Fallback 'procedimental' para cualquier valor no mapeado.
 */
const ESCALERA_POR_PEDAGOGICAL_TYPE: Record<string, MotorTipoEscalera> = {
  PROCEDURAL: 'procedimental',
  MIXED: 'procedimental',
  CONCEPTUAL: 'declarativa',
  MEMORIZATION: 'declarativa',
};

function escaleraDePedagogicalType(pedagogicalType: string): MotorTipoEscalera {
  return ESCALERA_POR_PEDAGOGICAL_TYPE[pedagogicalType] ?? 'procedimental';
}

function contenidoPreguntaDeDistractorSet(ds: DistractorSet): MotorContenidoPregunta {
  return {
    enunciado: ds.question,
    // `tipoError` de cada opción queda SIN DEFINIR a propósito — el
    // backend no etiqueta hoy el error categórico de un distractor (ver
    // DistractorSet.explanation, que es texto libre, no una categoría de
    // motor/tipos.ts). ExperienceRunner ya cae a `inferirTipoError` como
    // fallback por rol de misión cuando una opción no trae `tipoError` —
    // exactamente el mecanismo pensado para este caso.
    opciones: [
      { id: 'correcta', texto: ds.correctText, correcta: true },
      ...ds.distractors.map((d, i) => ({ id: `distractor-${i}`, texto: d.text, correcta: false })),
    ],
  };
}

function contenidoTextoDeWorkedExample(we: WorkedExample): MotorContenidoTexto {
  return { titulo: we.statement, cuerpo: we.answer };
}

/**
 * Banco de UN concepto. Cada casilla (TipoObjetivo × TipoBloque) queda sin
 * definir si no hay fuente real que la respalde — nunca se fabrica
 * contenido; `rellenarContenido` en el front ya sabe degradar una casilla
 * vacía al placeholder de siempre.
 *
 * `aplicar.ejercicio` y `transferir.ejercicio` reutilizan el MISMO
 * DistractorSet que `comprender.pregunta` — es la única pregunta de
 * opción múltiple con distractores reales que el backend produce por
 * concepto hoy. Repetir la pregunta bajo un objetivo distinto es una
 * aproximación deliberada para este hito (ver la nota del prompt): NO se
 * usa `advancedExamples` para armar una opción múltiple porque esos
 * strings son solo el enunciado de un ejercicio más difícil, sin una
 * respuesta correcta conocida — inventarle distractores/respuesta violaría
 * la regla de "nunca fabricar" (ver distractors.ts/exerciseValidator.ts).
 */
function bancoDeConcepto(
  concept: KnowledgeConcept,
  distractorSet: DistractorSet | undefined,
  workedExample: WorkedExample | undefined,
): MotorBancoConcepto {
  const banco: MotorBancoConcepto = {};

  const contenidoPregunta = distractorSet ? contenidoPreguntaDeDistractorSet(distractorSet) : null;
  const insightCuerpo = (concept.teacherExplanation || concept.hook || '').trim();
  const contextoCuerpo = (concept.definition || concept.simpleExplanation || '').trim();
  const contenidoEjemplo = workedExample ? contenidoTextoDeWorkedExample(workedExample) : null;

  if (contenidoPregunta || insightCuerpo) {
    banco.comprender = {};
    if (contenidoPregunta) banco.comprender.pregunta = [contenidoPregunta];
    if (insightCuerpo) banco.comprender.insight = [{ cuerpo: insightCuerpo }];
  }

  if (contextoCuerpo) {
    banco.reconocer = { contexto: [{ cuerpo: contextoCuerpo }] };
  }

  if (contenidoEjemplo || contenidoPregunta) {
    banco.aplicar = {};
    if (contenidoEjemplo) banco.aplicar.ejemplo = [contenidoEjemplo];
    if (contenidoPregunta) banco.aplicar.ejercicio = [contenidoPregunta];
  }

  if (contenidoPregunta) {
    banco.transferir = { ejercicio: [contenidoPregunta] };
  }

  return banco;
}

/**
 * Transforma lo que la generación v2 ya produjo para UN documento a la
 * forma que consume el Motor Pedagógico del front. Pura — no hace
 * llamadas a IA, no muta `ko`/`distractorsByConcept`.
 *
 * `workedExamples` (KnowledgeObject.workedExamples) no trae qué concepto
 * los originó — se asignan por ORDEN a los conceptos con `role ===
 * 'procedure'` (el i-ésimo ejemplo resuelto al i-ésimo concepto de
 * procedimiento), misma aproximación que el resto de este adaptador.
 */
export function adaptarAMotor(
  ko: KnowledgeObject,
  distractorsByConcept: Record<string, DistractorSet>,
  pedagogicalType: string,
): MotorContent {
  const escalera = escaleraDePedagogicalType(pedagogicalType);
  const procedureConcepts = ko.concepts.filter((c) => (c.role ?? 'supporting') === 'procedure');

  // Ordenados por dificultad ascendente — el front elige el PRIMERO de
  // `conceptos` como concepto activo (ver PROMPT_contenido_documento.md,
  // Parte B: "el primer concepto (menor dificultad / orden)"), así no
  // necesita conocer `difficulty` (no expuesto en `MotorConceptoSeed`).
  const conceptos: MotorConceptoSeed[] = [...ko.concepts]
    .sort((a, b) => a.difficulty - b.difficulty)
    .map((c) => ({
      id: c.id,
      nombre: c.name,
      escalera,
    }));

  const banco: MotorBanco = {};
  ko.concepts.forEach((concept) => {
    const distractorSet = distractorsByConcept[concept.id];
    const procedureIndex = procedureConcepts.indexOf(concept);
    const workedExample = procedureIndex >= 0 ? ko.workedExamples[procedureIndex] : undefined;
    const bancoConcepto = bancoDeConcepto(concept, distractorSet, workedExample);
    if (Object.keys(bancoConcepto).length > 0) {
      banco[concept.id] = bancoConcepto;
    }
  });

  return { conceptos, banco };
}
