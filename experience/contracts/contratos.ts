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

import type { Evidencia } from '../../motor';
export type { Evidencia };

// ── 2. Objetivo — el "Goal" que consumen Builder y UI ──────────────────────

/**
 * Proyección limpia de a qué le apunta la próxima misión, en vocabulario
 * de producto (nunca en vocabulario interno del motor — ver
 * `objetivoDeMision` en `objetivo.ts`, el único traductor `Mision → Objetivo`).
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
  /** Confianza 0–100 del eje objetivo (`motor/tipos.ts`'s `Mision.ejeObjetivo`)
   *  — permite que el Builder/las recetas eligan variantes según qué tan
   *  lejos o cerca está el estudiante de dominar ese eje. */
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

export interface ExperienceBlock {
  /** Identificador único del bloque DENTRO de una Experiencia — necesario
   *  porque los bloques van a tener estado (respondido, en progreso…) y
   *  hace falta poder referenciarlos individualmente. */
  id: string;
  tipo: TipoBloque;
  /**
   * Contenido a renderizar, rellenado por el Builder desde el contenido
   * del concepto. `unknown` es intencional y temporal: se tipará por
   * bloque en la Fase 3 (Experience Builder), cuando exista contenido real
   * para tipar contra. Ningún consumidor de esta fase lee `contenido`.
   */
  contenido?: unknown;
}

export interface Experiencia {
  objetivo: Objetivo;
  /**
   * La receta que generó estos bloques. Guardarla acá NO cambia ningún
   * comportamiento — es pura trazabilidad: al depurar una Experiencia se
   * puede ver POR QUÉ se construyó así (qué receta la originó), sin tener
   * que adivinarlo a partir de los bloques resultantes.
   */
  receta: Receta;
  bloques: ExperienceBlock[];
}

// ── 4. Receta — DATA, no código ─────────────────────────────────────────────

/**
 * La receta es un objeto (una secuencia de tipos de bloque), NUNCA una
 * función — mismo principio que `motor/escaleras.ts`: datos, no lógica.
 * Esto permite cambiar la experiencia (agregar/quitar/reordenar un tipo de
 * bloque) sin tocar el Builder que la interpreta.
 */
export interface Receta {
  tipo: TipoObjetivo;
  /**
   * Los PASOS del plan, en orden — tipos de bloque, no bloques concretos.
   * Los `ExperienceBlock` (con `id` y `contenido`) recién existen cuando el
   * Builder rellena estos pasos con contenido real del concepto: la receta
   * es el plan, los bloques son el resultado.
   */
  steps: TipoBloque[];
}
