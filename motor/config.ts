/**
 * Motor Pedagógico NEMUP — Parámetros calibrados
 * =================================================================
 * TODOS los números viven aquí para que se ajusten en un solo lugar.
 * Son apuestas iniciales: se calibran observando estudiantes reales.
 */

import type { TipoError, Banda } from './tipos';

/** Umbral a partir del cual un eje se considera "Dominado". */
export const DOMINADO = 85;

/** Bandas de confianza (límites inferiores). */
export const BANDAS: { limite: number; banda: Banda }[] = [
  { limite: 85, banda: 'dominado' },
  { limite: 70, banda: 'casi_dominado' },
  { limite: 40, banda: 'en_desarrollo' },
  { limite: 0, banda: 'no_adquirido' },
];

/** Dos umbrales de refuerzo (punto 2 de la calibración):
 *  - por debajo de OBSERVAR: el motor "mira con atención" pero no interrumpe.
 *  - por debajo de REFORZAR: inserta una micro misión de refuerzo. */
export const UMBRAL_OBSERVAR = 75;
export const UMBRAL_REFORZAR = 55;

/** Estabilidad por debajo de esto dispara un repaso (si el concepto se necesita). */
export const UMBRAL_REPASO = 60;

/** Cuánto BAJA la confianza según el tipo de error (negativo). */
export const PESO_ERROR: Record<TipoError, number> = {
  distraccion: -2,
  procedimiento: -8,
  transferencia: -12,
  reconocimiento: -15,
  conceptual: -25,
};

/** Cuánto SUBE la confianza según la calidad del acierto.
 *  No todo acierto vale igual: premia la autonomía y la transferencia. */
export const GANANCIA = {
  conAyuda: 4,
  sinAyuda: 7,
  rapida: 10,
  contextoNuevo: 12,
};

/** Un acierto refuerza un poco la Estabilidad (retención). */
export const GANANCIA_ESTABILIDAD = 3;

/** Desgaste temporal de la Estabilidad. El conocimiento no desaparece,
 *  solo pierde solidez. Nunca baja del piso. */
export const ESTABILIDAD_PISO = 40;

/**
 * Desgaste TOTAL de Estabilidad acumulado tras `semanas` completas sin actividad.
 * Curva calibrada: sem 1 → 0, sem 2 → −5, sem 3 → −5, sem 4 → −10, luego −5/sem.
 */
export function desgasteEstabilidad(semanas: number): number {
  if (semanas <= 1) return 0;
  let total = 0;
  for (let w = 2; w <= semanas; w++) {
    if (w === 2 || w === 3) total += 5;
    else if (w === 4) total += 10;
    else total += 5;
  }
  return total;
}

/** Devuelve la banda de un valor de confianza. */
export function bandaDe(confianza: number): Banda {
  for (const b of BANDAS) {
    if (confianza >= b.limite) return b.banda;
  }
  return 'no_adquirido';
}
