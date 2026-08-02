/**
 * Motor Pedagógico NEMUP — Decisión (el corazón)
 * =================================================================
 * `decidirProximaMision` es la única función de este archivo: dado un
 * Perfil de Dominio, elige la próxima misión siguiendo siempre el mismo
 * orden de reglas, sin importar la escalera. La etapa decide la
 * herramienta, no la materia.
 *
 * `motivo` es un string interno para debugging / Mago de Oz — nunca se
 * muestra al estudiante (ver Mision en tipos.ts).
 *
 * Ver la especificación en pedagogia/Reglas_del_Motor_NEMUP.md.
 */

import type { Mision, PerfilConcepto, RolCognitivo, TipoMision } from './tipos';
import { escaleraDe } from './escaleras';
import { estabilidadEfectiva } from './perfil';
import { DOMINADO, UMBRAL_OBSERVAR, UMBRAL_REFORZAR, UMBRAL_REPASO } from './config';

/** Umbral de repaso cuando el alumno tiene una evaluación cercana — el
 * acelerador de la Regla 7: adelanta el repaso aunque el concepto no
 * viniera "necesitado" enseguida. */
const UMBRAL_REPASO_EVALUACION_CERCANA = 75;

function estadoDe(confianza: number): 'reforzar' | 'observar' | 'avanzar' {
  if (confianza < UMBRAL_REFORZAR) return 'reforzar';
  if (confianza < UMBRAL_OBSERVAR) return 'observar';
  return 'avanzar';
}

function tipoMisionDeRol(rol: RolCognitivo, confianza: number): TipoMision {
  switch (rol) {
    case 'comprension':
      return 'pregunta_conceptual';
    case 'reconocimiento':
      return 'pregunta_reconocimiento';
    case 'aplicacion':
      return confianza < 70 ? 'ejercicio_guiado' : 'ejercicio_dificil';
    case 'transferencia':
      return 'ejercicio_dificil';
  }
}

/**
 * Elige la próxima misión para UN concepto. Algoritmo, siempre en este
 * orden:
 *   1. Repaso (Estabilidad) — si está por debajo del umbral, gana siempre,
 *      antes de mirar ningún peldaño.
 *   2. El peldaño más bajo (menor índice) con confianza < DOMINADO — es
 *      prerrequisito: nunca se trabaja un peldaño alto antes de dominar
 *      el anterior.
 *   3. Si todos los peldaños están dominados: Fluidez si falta, si no,
 *      simulación final.
 *
 * TODO: cuando esto se extienda para elegir entre VARIOS conceptos a la
 * vez, usar el `peso` del peldaño (ver escaleras.ts) para priorizar la
 * "misión de mayor impacto" — hoy solo decide dentro de UN perfil.
 */
export function decidirProximaMision(
  perfil: PerfilConcepto,
  ahoraMs: number,
  opts?: { evaluacionCercana?: boolean },
): Mision {
  // 1. Repaso — Estabilidad.
  const umbralRepaso = opts?.evaluacionCercana ? UMBRAL_REPASO_EVALUACION_CERCANA : UMBRAL_REPASO;
  const estabilidad = estabilidadEfectiva(perfil, ahoraMs);
  if (estabilidad < umbralRepaso) {
    return {
      conceptoId: perfil.conceptoId,
      ejeObjetivo: 'estabilidad',
      rolObjetivo: 'cualidad',
      tipo: 'repaso_espaciado',
      motivo: `estabilidad efectiva ${estabilidad} < umbral ${umbralRepaso}`
        + (opts?.evaluacionCercana ? ' (adelantado por evaluación cercana)' : ''),
    };
  }

  // 2. Peldaño objetivo — el más bajo no dominado.
  const escalera = escaleraDe(perfil.escalera);
  for (const peldano of escalera.peldanos) {
    const confianza = perfil.ejes[peldano.id] ?? 0;
    if (confianza < DOMINADO) {
      return {
        conceptoId: perfil.conceptoId,
        ejeObjetivo: peldano.id,
        rolObjetivo: peldano.rol,
        tipo: tipoMisionDeRol(peldano.rol, confianza),
        motivo: `peldaño "${peldano.label}" (${peldano.rol}) en ${confianza} — ${estadoDe(confianza)}`,
      };
    }
  }

  // 3. Todo peldaño dominado.
  const fluidez = perfil.ejes.fluidez ?? 0;
  if (fluidez < DOMINADO) {
    return {
      conceptoId: perfil.conceptoId,
      ejeObjetivo: 'fluidez',
      rolObjetivo: 'cualidad',
      tipo: 'practica_ritmo',
      motivo: `todos los peldaños dominados — fluidez en ${fluidez}`,
    };
  }

  return {
    conceptoId: perfil.conceptoId,
    // No hay un eje "global" real en el perfil — el objetivo es el
    // concepto completo, no un eje puntual (ver rolObjetivo: 'global').
    ejeObjetivo: perfil.conceptoId,
    rolObjetivo: 'global',
    tipo: 'simulacion',
    motivo: 'perfil completamente dominado — diagnóstico final',
  };
}
