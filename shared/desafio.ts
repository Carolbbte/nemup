/**
 * Tipos para el modo Desafío — pipeline aislado, arquitectura estable.
 * Compartido entre backend (Node.js) y frontend (React Native).
 *
 * Secuencia por concepto Tipo A:
 *   discovery_challenge → instant_feedback → insight → reinforcement_challenge
 *
 * Al finalizar todos los conceptos:
 *   boss_loop → mastery_screen
 */

export type DesafioSlideType =
  | 'discovery_challenge'     // pregunta ANTES de ver el concepto
  | 'instant_feedback'        // explicación breve post-respuesta, pre-insight
  | 'insight'                 // definición completa del concepto
  | 'reinforcement_challenge' // nueva pregunta aplicando el mismo concepto
  | 'boss_loop'               // pregunta integradora de TODOS los conceptos
  | 'mastery_screen';         // pantalla final de completado

export interface DesafioChoice {
  letter: 'A' | 'B' | 'C';
  text: string;
}

export interface DesafioSlide {
  type: DesafioSlideType;
  /** 0-based index del grupo de concepto. -1 para boss_loop y mastery_screen. */
  conceptIndex: number;
  conceptName: string;
  emoji?: string;
  // ── Slides interactivas (discovery_challenge, reinforcement_challenge, boss_loop)
  question?: string;
  choices?: DesafioChoice[];
  correctAnswer?: 'A' | 'B' | 'C';
  /** Feedback mostrado después de responder — explica por qué la opción correcta es correcta. */
  explanation?: string;
  /** Pistas por letra incorrecta — mostradas cuando el estudiante elige una opción errónea. */
  wrongHints?: Record<string, string>;
  // ── Slides no interactivas (instant_feedback, insight, mastery_screen)
  title?: string;
  body?: string;
  // ── mastery_screen
  conceptsCovered?: string[];
}

export interface DesafioSession {
  id: string;
  topic: string;
  conceptCount: number;
  slides: DesafioSlide[];
}
