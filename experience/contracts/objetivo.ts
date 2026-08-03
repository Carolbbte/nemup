/**
 * Experience Layer NEMUP — Traductor Mision → Objetivo
 * =================================================================
 * El motor (`motor/`) devuelve un `Mision` en su propio vocabulario interno
 * (rol cognitivo, eje, tipo de misión). El `Objetivo` es su proyección
 * limpia para el Builder/la UI. Este archivo es el ÚNICO puente
 * `Mision ↔ Objetivo` — el motor nunca se toca ni conoce este tipo.
 */

import type { Mision, PerfilConcepto } from '../../motor';
import type { Objetivo, TipoObjetivo } from './contratos';

/** Minutos estimados de una micro-misión, por TipoObjetivo (2–4). */
const MINUTOS_ESTIMADOS: Record<TipoObjetivo, number> = {
  comprender: 2,
  reconocer: 2,
  aplicar: 3,
  transferir: 4,
  repasar: 2,
  fluidez: 3,
};

/**
 * Mapea `rolObjetivo`/`ejeObjetivo` del motor a un `TipoObjetivo` de
 * producto:
 *   comprension→comprender, reconocimiento→reconocer, aplicacion→aplicar,
 *   transferencia→transferir; rolObjetivo 'cualidad' se resuelve mirando
 *   CUÁL eje es: 'estabilidad'→repasar, 'fluidez'→fluidez.
 *
 * `rolObjetivo === 'global'` (solo ocurre con `mision.tipo === 'simulacion'`,
 * el diagnóstico final sobre un concepto YA dominado en todos sus
 * peldaños — ver `decidir.ts`) no tiene un eje real al que apuntar
 * (`ejeObjetivo` es el propio `conceptoId`, no un eje de `perfil.ejes`).
 * No está en la tabla que especifica el prompt, así que se resuelve acá
 * como el `TipoObjetivo` más cercano: `transferir` — un chequeo integral
 * sobre todo el concepto, no la revisión de un eje puntual.
 */
function tipoObjetivoDeMision(mision: Mision): TipoObjetivo {
  if (mision.rolObjetivo === 'cualidad') {
    return mision.ejeObjetivo === 'fluidez' ? 'fluidez' : 'repasar';
  }
  switch (mision.rolObjetivo) {
    case 'comprension':
      return 'comprender';
    case 'reconocimiento':
      return 'reconocer';
    case 'aplicacion':
      return 'aplicar';
    case 'transferencia':
      return 'transferir';
    case 'global':
    default:
      return 'transferir';
  }
}

/**
 * Traduce la decisión del motor (`Mision`) a la proyección de producto
 * (`Objetivo`) que consumen el Builder y la UI. Pura — no muta `mision` ni
 * `perfil`, no llama al motor, no tiene efectos secundarios.
 */
export function objetivoDeMision(mision: Mision, perfil: PerfilConcepto): Objetivo {
  const tipo = tipoObjetivoDeMision(mision);

  return {
    conceptoId: mision.conceptoId,
    conceptoNombre: perfil.conceptoNombre,
    tipo,
    // `mision.ejeObjetivo` no es una clave real de `perfil.ejes` para el
    // caso 'global' (es el conceptoId) — cae a 0, ver el comentario de
    // tipoObjetivoDeMision sobre ese caso.
    confianza: perfil.ejes[mision.ejeObjetivo] ?? 0,
    minutosEstimados: MINUTOS_ESTIMADOS[tipo],
  };
}
