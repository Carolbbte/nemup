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

/**
 * Cuánto BAJA la confianza según el tipo de error (negativo). Calibrado
 * (2ª pasada) para que un error conceptual deshaga aproximadamente UN
 * acierto bueno (-30 vs GANANCIA.sinAyuda +30) — fuerte, pero no un pozo
 * del que haga falta media escalera de aciertos para salir. distraccion
 * se mantiene despreciable frente a cualquier ganancia.
 */
export const PESO_ERROR: Record<TipoError, number> = {
  distraccion: -3,
  procedimiento: -12,
  transferencia: -18,
  reconocimiento: -20,
  conceptual: -30,
};

/**
 * Cuánto SUBE la confianza según la calidad del acierto. Calibrado (2ª
 * pasada) para que un peldaño pase de 0 a DOMINADO (85) en ~3 aciertos
 * sin ayuda (85/30 ≈ 3), con margen para llegar antes si son rápidos o en
 * contexto nuevo — el diseño original ("≈2 aciertos = logrado") tomaba
 * ~10 con los valores anteriores (+7), demasiado para una micro-misión de
 * 2-4 minutos. No todo acierto vale igual: premia la autonomía y la
 * transferencia (conAyuda sigue siendo el más bajo — necesitar ayuda debe
 * costar más pasos que resolver solo).
 */
export const GANANCIA = {
  conAyuda: 18,
  sinAyuda: 30,
  rapida: 35,
  contextoNuevo: 40,
};

/** Un acierto refuerza un poco la Estabilidad (retención). Calibrado (2ª
 *  pasada) en proporción a GANANCIA — con +3 (valor original) hacían falta
 *  ~7 aciertos solo para cruzar UMBRAL_REPASO (60) desde 0. */
export const GANANCIA_ESTABILIDAD = 12;

/** Efecto secundario de un acierto RÁPIDO sobre Fluidez (confianza.ts).
 *  Calibrado (2ª pasada) en proporción a GANANCIA — con +6 (valor original)
 *  hacían falta ~15 aciertos rápidos para que Fluidez llegara a DOMINADO. */
export const GANANCIA_FLUIDEZ_RAPIDA = 20;

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
