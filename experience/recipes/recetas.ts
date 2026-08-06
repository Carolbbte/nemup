/**
 * Experience Layer NEMUP — Biblioteca de recetas
 * =================================================================
 * DATOS, no lógica — mismo principio que `motor/escaleras.ts`. Una receta
 * describe la EXPERIENCIA (cómo se vive la misión: qué bloques, en qué
 * orden), nunca la pedagogía — sus `id` se leen como "esto se ve/se siente
 * así", nunca como una regla de enseñanza.
 *
 * Un `TipoObjetivo` puede tener VARIAS recetas (aunque hoy solo exista una
 * por tipo) — la selección entre varias será del motor a futuro (una
 * `estrategia` en el `Objetivo`), nunca del Builder. `recetaDe` hoy
 * siempre devuelve la primera.
 *
 * `celebracion` NO aparece en ninguna receta — es un beat de FLUJO (Fase
 * 6: Celebración → ¿Continuamos?), no un paso dentro de la experiencia de
 * una misión. El feedback de una respuesta vive DENTRO del bloque
 * `pregunta`/`ejercicio` mismo, no como un paso separado.
 */

import type { Receta, TipoObjetivo } from '../contracts/contratos';

export const RECETAS: Record<TipoObjetivo, Receta[]> = {
  comprender: [
    // En mate, comprender se aterriza HACIENDO: pregunta (chequeo) → insight
    // (la idea) → ejercicio (aplícala). Si prefieres sin explicación, borra
    // 'insight'. (Nota: hoy las recetas son globales; esto aplica a todo
    // concepto, pero solo se ve donde hay contenido — Factor Común.)
    { id: 'question-then-apply', tipo: 'comprender', steps: ['pregunta', 'insight', 'ejercicio'] },
  ],
  reconocer: [
    { id: 'context-then-question', tipo: 'reconocer', steps: ['contexto', 'pregunta'] },
  ],
  aplicar: [
    { id: 'example-then-practice', tipo: 'aplicar', steps: ['ejemplo', 'ejercicio'] },
  ],
  transferir: [
    { id: 'direct-challenge', tipo: 'transferir', steps: ['ejercicio'] },
  ],
  repasar: [
    { id: 'memory-refresh', tipo: 'repasar', steps: ['memoria'] },
  ],
  fluidez: [
    { id: 'rapid-practice', tipo: 'fluidez', steps: ['ejercicio'] },
  ],
};

/**
 * Devuelve la receta a usar para un `TipoObjetivo` — hoy siempre la
 * primera de la lista (`RECETAS[tipo][0]`); la selección entre varias
 * recetas para el mismo tipo es del motor a futuro, no de esta función.
 */
export function recetaDe(tipo: TipoObjetivo): Receta {
  return RECETAS[tipo][0];
}
