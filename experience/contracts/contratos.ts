/**
 * Experience Layer NEMUP — Contratos
 * =================================================================
 * Fase 1 de la integración del Motor (ver PROMPT_motor_integracion.md):
 * SOLO los contratos entre capas. Cero comportamiento, cero UI, cero
 * recetas rellenas — únicamente los tipos que van a fluir en ciclo:
 *
 *   Objetivo → Experiencia → Evidencia → (Motor) → Objetivo → …
 *
 * Este archivo no importa React ni nada de `app/` — es tan "capa pura"
 * como `motor/`, solo que vive un nivel más cerca de la UI (el Builder y
 * los Experience Blocks consumen estos tipos en fases posteriores).
 */

// ── 1. Evidencia — NO se redefine, se reexporta desde el motor ─────────────

import type { Evidencia, TipoError } from '../../motor';
export type { Evidencia };

// ── 2. Objetivo — el "Goal" que consumen Builder y UI ──────────────────────

/**
 * Proyección limpia de a qué le apunta la próxima misión, en vocabulario
 * de producto (nunca en vocabulario interno del motor — ver
 * `objetivoDeDecision` en `objetivo.ts`, el único traductor
 * `DecisionPedagogica → Objetivo`).
 */
export type TipoObjetivo =
  | 'comprender'  // understand
  | 'reconocer'   // recognize
  | 'aplicar'     // apply
  | 'transferir'  // transfer
  | 'repasar'     // review  (cualidad estabilidad)
  | 'fluidez';    // fluency (cualidad fluidez)

export interface Objetivo {
  conceptoId: string;
  conceptoNombre: string;
  tipo: TipoObjetivo;
  /** Confianza 0–100 del eje objetivo (`motor/tipos.ts`'s
   *  `DecisionPedagogica.ejeObjetivo`) — permite que el Builder/las
   *  recetas eligan variantes según qué tan lejos o cerca está el
   *  estudiante de dominar ese eje. */
  confianza: number;
  /** Minutos estimados de la próxima misión (p.ej. 2–4), por TipoObjetivo. */
  minutosEstimados: number;
}

// ── 3. ExperienceBlock + Experiencia — lo que el Builder devuelve ──────────

export type TipoBloque =
  | 'contexto'
  | 'ejemplo'
  | 'pregunta'
  | 'ejercicio'
  | 'insight'
  | 'memoria'
  | 'celebracion';

// ── 3a. Contenido — lo que trae CADA bloque, tipado por forma (no por
// TipoBloque directamente: `pregunta`/`ejercicio` usan ContenidoPregunta,
// `contexto`/`ejemplo`/`insight` usan ContenidoTexto — el runner decide
// cuál renderizar haciendo narrowing sobre la forma real del objeto, ver
// ExperienceRunner.tsx) ──────────────────────────────────────────────────

export interface OpcionPregunta {
  id: string;
  texto: string;
  correcta: boolean;
  /**
   * Si es incorrecta: QUÉ error representa — respuesta con significado
   * (ver Parte C de pedagogia/Reglas_del_Motor_NEMUP.md). Es la fuente
   * REAL del `tipoError` de la `Evidencia` cuando el estudiante elige esta
   * opción — no una inferencia por el tipo de misión (esa,
   * `inferirTipoError` en experience/evidencia.ts, queda solo como
   * fallback defensivo si una opción no trae `tipoError`).
   */
  tipoError?: TipoError;
}

export interface ContenidoPregunta {
  enunciado: string;
  opciones: OpcionPregunta[];
}

export interface ContenidoTexto {
  titulo?: string;
  cuerpo: string;
  pasos?: string[];
}

export type Contenido = ContenidoPregunta | ContenidoTexto;

export interface ExperienceBlock {
  /** Identificador único del bloque DENTRO de una Experiencia — necesario
   *  porque los bloques van a tener estado (respondido, en progreso…) y
   *  hace falta poder referenciarlos individualmente. */
  id: string;
  tipo: TipoBloque;
  /**
   * Contenido a renderizar. El Builder (experience/builder/builder.ts)
   * arma la ESTRUCTURA del bloque sin contenido; un paso aparte
   * (experience/content/rellenar.ts) lo completa desde el banco de
   * contenido del concepto — puede quedar `undefined` si no hay contenido
   * para esa casilla (el runner cae a un placeholder, nunca rompe).
   */
  contenido?: Contenido;
}

export interface Experiencia {
  objetivo: Objetivo;
  bloques: ExperienceBlock[];
  /**
   * Solo para debug/trazabilidad — NO es un objeto de negocio, ningún
   * consumidor debe depender de esto. Guardar la receta que originó estos
   * bloques permite, al depurar una Experiencia, ver POR QUÉ se construyó
   * así sin tener que adivinarlo a partir de los bloques resultantes.
   */
  metadata?: { recipe?: Receta };
}

// ── 4. Receta — DATA, no código ─────────────────────────────────────────────

/**
 * Alias — hoy un paso de la receta es exactamente un tipo de bloque (1:1).
 * Deja espacio para que en el futuro un paso genere más de un
 * `ExperienceBlock` sin tener que romper el contrato — no implementado
 * todavía, `PasoReceta` y `TipoBloque` son intercambiables por ahora.
 */
export type PasoReceta = TipoBloque;

/**
 * La receta es un objeto (una secuencia de tipos de bloque), NUNCA una
 * función — mismo principio que `motor/escaleras.ts`: datos, no lógica.
 * Esto permite cambiar la experiencia (agregar/quitar/reordenar un tipo de
 * bloque) sin tocar el Builder que la interpreta.
 */
export interface Receta {
  /**
   * Identifica la EXPERIENCIA (cómo se vive la misión), nunca la
   * pedagogía — p.ej. `'question-first'`, nunca algo como
   * `'verificacion-conceptual'`. La decisión de qué receta/estrategia usar
   * (guiado vs. directo, etc.) es del motor, no de este id: a futuro el
   * motor devolverá una `estrategia` en el `Objetivo` y el Builder solo la
   * ejecutará — este id solo nombra la forma resultante, no decide nada.
   */
  id: string;
  tipo: TipoObjetivo;
  /**
   * Los PASOS del plan, en orden — tipos de bloque, no bloques concretos.
   * Los `ExperienceBlock` (con `id` y `contenido`) recién existen cuando el
   * Builder rellena estos pasos con contenido real del concepto: la receta
   * es el plan, los bloques son el resultado.
   */
  steps: PasoReceta[];
}

// ── 5. Banco de contenido — la fuente que consume rellenarContenido ────────
//
// conceptoId → TipoObjetivo → TipoBloque → Contenido[] (un pool: se elige
// uno al azar). Vive acá (no en `content/factorComun.ts`, donde nació)
// porque ya no es específico de un concepto a mano — también es la forma
// que produce `motorContent` del backend (ver
// backend/src/generation/v2/motorAdapter.ts, que espeja esta forma a mano
// del lado del backend) y la que persiste `MotorContext`.

export type BancoPorBloque = Partial<Record<TipoBloque, Contenido[]>>;
export type BancoPorObjetivo = Partial<Record<TipoObjetivo, BancoPorBloque>>;
export type Banco = Record<string, BancoPorObjetivo>;
