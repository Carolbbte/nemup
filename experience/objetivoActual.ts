/**
 * Experience Layer NEMUP — Puente motor → objetivo
 * =================================================================
 * Encadena las dos funciones puras que ya existen: el motor decide
 * (`tomarDecisionPedagogica`), el traductor de la Fase 1 proyecta esa
 * decisión a vocabulario de producto (`objetivoDeDecision`). La
 * `DecisionPedagogica` que produce el motor es un detalle interno — nunca
 * llega a la UI ni al Builder, que solo ven el `Objetivo` resultante.
 */

import { tomarDecisionPedagogica } from '../motor';
import type { PerfilConcepto } from '../motor';
import { objetivoDeDecision } from './contracts/objetivo';
import type { Objetivo } from './contracts/contratos';

export function objetivoActual(perfil: PerfilConcepto, ahoraMs: number): Objetivo {
  return objetivoDeDecision(tomarDecisionPedagogica(perfil, ahoraMs), perfil);
}
