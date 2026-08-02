/**
 * Motor Pedagógico NEMUP — Perfil de Dominio
 * =================================================================
 * Crea el Perfil de Dominio de un concepto y resuelve el desgaste
 * temporal de Estabilidad al leerlo.
 *
 * Ver la especificación en pedagogia/Reglas_del_Motor_NEMUP.md.
 */

import type { PerfilConcepto, TipoEscalera } from './tipos';
import { escaleraDe } from './escaleras';
import { ESTABILIDAD_PISO, desgasteEstabilidad } from './config';

const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;

/**
 * Crea un Perfil de Dominio nuevo para un concepto: todos los ejes
 * (peldaños de la escalera + estabilidad + fluidez) en 0.
 */
export function crearPerfil(
  conceptoId: string,
  conceptoNombre: string,
  tipo: TipoEscalera,
  ahoraMs: number,
): PerfilConcepto {
  const escalera = escaleraDe(tipo);
  const ejes: Record<string, number> = {};
  for (const peldano of escalera.peldanos) ejes[peldano.id] = 0;
  ejes.estabilidad = 0;
  ejes.fluidez = 0;

  return {
    conceptoId,
    conceptoNombre,
    escalera: tipo,
    ejes,
    ultimaActividadMs: ahoraMs,
  };
}

/**
 * Estabilidad NO se guarda desgastada — se calcula al leer. El conocimiento
 * no desaparece, solo pierde solidez: nunca baja de ESTABILIDAD_PISO.
 * `semanas` son semanas COMPLETAS transcurridas desde la última actividad.
 */
export function estabilidadEfectiva(perfil: PerfilConcepto, ahoraMs: number): number {
  const semanas = Math.floor((ahoraMs - perfil.ultimaActividadMs) / MS_POR_SEMANA);
  const desgaste = desgasteEstabilidad(semanas);
  return Math.max(ESTABILIDAD_PISO, perfil.ejes.estabilidad - desgaste);
}
