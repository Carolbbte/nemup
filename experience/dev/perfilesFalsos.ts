// TEMP dev — perfiles semilla, SOLO para ver en vivo cómo cambia el
// `Objetivo` según el estado del estudiante, antes de que existan perfiles
// reales persistidos (fases futuras). Usado únicamente desde
// current-objective.tsx, detrás de MOTOR_MODE — desaparece cuando el motor
// decida sobre perfiles de verdad.

import { crearPerfil } from '../../motor';
import type { PerfilConcepto } from '../../motor';

const CONCEPTO_ID = 'factor-comun';
const CONCEPTO_NOMBRE = 'Factor Común';

function perfilConEjes(ejesOverride: Record<string, number>): PerfilConcepto {
  const base = crearPerfil(CONCEPTO_ID, CONCEPTO_NOMBRE, 'procedimental', Date.now());
  return { ...base, ejes: { ...base.ejes, ...ejesOverride } };
}

/** Concepto recién creado — todos los ejes en 0. El motor debe pedir el
 *  peldaño más bajo: `comprender`. */
export const perfilNuevo: PerfilConcepto = perfilConEjes({});

/** `comprender`/`reconocer` ya dominados, el resto en 0. El motor debe
 *  pasar al siguiente peldaño no dominado: `aplicar`. */
export const perfilAplicar: PerfilConcepto = perfilConEjes({
  comprender: 90,
  reconocer: 90,
});

/** Los 5 peldaños de `procedimental` dominados. El motor recién ahí mira
 *  las cualidades (Estabilidad/Fluidez) o, si también están altas, pide
 *  la simulación final. */
export const perfilDominado: PerfilConcepto = perfilConEjes({
  comprender: 90,
  reconocer: 90,
  aplicar: 90,
  automatizar: 90,
  transferir: 90,
});
