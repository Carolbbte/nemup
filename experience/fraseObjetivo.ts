/**
 * Experience Layer NEMUP — Copy de UI para el Objetivo
 * =================================================================
 * `Objetivo` trae `tipo` + `conceptoNombre`; esto es COPY, no pedagogía —
 * un mapa determinista TipoObjetivo → verbo, para la frase que ve el
 * estudiante ("Tu siguiente objetivo: ...").
 */

import type { Objetivo, TipoObjetivo } from './contracts/contratos';

const FRASE_POR_TIPO: Record<TipoObjetivo, (nombre: string) => string> = {
  comprender: (nombre) => `Entender ${nombre}`,
  reconocer: (nombre) => `Reconocer cuándo usar ${nombre}`,
  aplicar: (nombre) => `Aplicar ${nombre}`,
  transferir: (nombre) => `Llevar ${nombre} a casos nuevos`,
  repasar: (nombre) => `Repasar ${nombre}`,
  fluidez: (nombre) => `Ganar soltura en ${nombre}`,
};

export function fraseObjetivo(objetivo: Objetivo): string {
  return FRASE_POR_TIPO[objetivo.tipo](objetivo.conceptoNombre);
}
