/**
 * Experience Layer NEMUP — Copy de la celebración
 * =================================================================
 * DATOS, no componente — el copy se va a iterar muchísimo tras ver
 * estudiantes reales, así que vive separado de `CelebrationBeat.tsx` (que
 * no conoce `avanzo` ni ninguna lógica, solo recibe el texto ya resuelto).
 *
 * Regla de oro del motor, la más visible en toda la experiencia: reforzar,
 * nunca castigar. SIEMPRE positivo — incluso cuando el objetivo no avanzó
 * (pudo haber respuestas falladas), el mensaje es de avance/ayuda, jamás
 * "te equivocaste" ni ningún lenguaje de fracaso.
 */

export interface CopyCelebracion {
  title: string;
  subtitle: string;
}

/** Resultado de la misión, para elegir el tono —siempre positivo:
 *  - `dominado`: avanzó al siguiente objetivo.
 *  - `avance`:   respondió bien, pero el peldaño necesita más práctica.
 *  - `refuerzo`: le costó (hubo errores) — en clave de "reforcemos", nunca
 *    "te equivocaste". */
export type ResultadoMision = 'dominado' | 'avance' | 'refuerzo';

export function copyCelebracion(resultado: ResultadoMision): CopyCelebracion {
  switch (resultado) {
    case 'dominado':
      return { title: '🔥 ¡Lo dominaste!', subtitle: 'Vas avanzando.' };
    case 'avance':
      return { title: '💪 ¡Bien ahí!', subtitle: 'Sigamos un poco más.' };
    case 'refuerzo':
      return { title: '🧠 Casi.', subtitle: 'Reforcemos esto un momento y sigue.' };
  }
}
