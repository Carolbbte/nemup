/**
 * Experience Layer NEMUP — Inferencia de tipoError
 * =================================================================
 * Sin distractores etiquetados (hito de contenido futuro) no se puede
 * distinguir un descuido dentro de un ejercicio — solo se infiere el TIPO
 * de error por el `tipo` del Objetivo que se estaba trabajando: la misión
 * ya dice qué peldaño se prueba, así que un fallo ahí es evidencia de ESE
 * peldaño.
 */

import type { TipoError } from '../motor';
import type { Objetivo, TipoObjetivo } from './contracts/contratos';

const TIPO_ERROR_POR_OBJETIVO: Partial<Record<TipoObjetivo, TipoError>> = {
  comprender: 'conceptual',
  reconocer: 'reconocimiento',
  aplicar: 'procedimiento',
  transferir: 'transferencia',
};

/** `undefined` para `repasar`/`fluidez` — un fallo ahí no tiene un tipo de
 *  error de peldaño al que mapear (son cualidades, no peldaños). */
export function inferirTipoError(objetivo: Objetivo): TipoError | undefined {
  return TIPO_ERROR_POR_OBJETIVO[objetivo.tipo];
}
