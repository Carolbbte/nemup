/**
 * Tipos compartidos entre backend (Node.js) y frontend (React Native)
 * Estructura de sesiones, contenido generado, progreso y errores
 */
// ============================================================================
// 8. CONSTANTS
// ============================================================================
export const PIPELINE_STAGES = [
    'uploading',
    'transcribing',
    'extracting',
    'generating',
    'validating_grounding',
    'done',
];
export const PIPELINE_LABELS = {
    uploading: 'Subiendo documento',
    transcribing: 'Transcribiendo material',
    extracting: 'Extrayendo conceptos clave',
    generating: 'Generando preguntas y flashcards',
    validating_grounding: 'Validando anclaje al documento',
    done: 'Sesión lista',
};
export const ESTIMATED_TIMES = {
    uploading: 5, // seconds
    transcribing: 30,
    extracting: 20,
    generating: 60,
    validating_grounding: 10,
    done: 0,
};
