/**
 * Experience Layer NEMUP — Experience Builder
 * =================================================================
 * El Builder es TONTO a propósito: función pura, sin IA, sin perfiles, sin
 * confianza, sin motor, sin React. No toma NINGUNA decisión pedagógica —
 * toma la única receta disponible del `Objetivo` (`recetaDe`) y la
 * convierte en bloques. Cuál receta/estrategia usar (guiado vs. directo,
 * etc.) será decisión del motor a futuro (una `estrategia` en el
 * `Objetivo`); el Builder solo la ejecutará, nunca la elegirá.
 */

import type { Experiencia, ExperienceBlock, Objetivo } from '../contracts/contratos';
import { recetaDe } from '../recipes/recetas';

/**
 * Única responsable de los ids de bloque — el resto del Builder no se
 * preocupa de ids. `${conceptoId}-${indice}-${tipo}` es único dentro de
 * una Experiencia (el índice ya lo garantiza) y legible para debug.
 */
function asignarIds(bloques: Omit<ExperienceBlock, 'id'>[], objetivo: Objetivo): ExperienceBlock[] {
  return bloques.map((bloque, indice) => ({
    id: `${objetivo.conceptoId}-${indice}-${bloque.tipo}`,
    ...bloque,
  }));
}

/**
 * Compone la Experiencia para un `Objetivo`, sin preocuparse de ids (eso
 * es responsabilidad exclusiva de `asignarIds`). Cada paso de la receta se
 * vuelve un bloque sin contenido (`contenido` queda `undefined` — el
 * contenido real del concepto se conecta en la Fase 4). Pura e inmutable:
 * no muta `objetivo`, siempre devuelve una `Experiencia` nueva.
 */
export function crearExperiencia(objetivo: Objetivo): Experiencia {
  const receta = recetaDe(objetivo.tipo);
  const bloquesSinId = receta.steps.map((paso) => ({ tipo: paso }));

  return {
    objetivo,
    bloques: asignarIds(bloquesSinId, objetivo),
    metadata: { recipe: receta },
  };
}
