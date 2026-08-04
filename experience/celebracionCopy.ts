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

export function copyCelebracion(avanzo: boolean): CopyCelebracion {
  return avanzo
    ? { title: '🔥 ¡Lo dominaste!', subtitle: 'Vas avanzando.' }
    : { title: '💪 ¡Buen trabajo!', subtitle: 'Sigamos un poco más.' };
}
