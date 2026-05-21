/**
 * Error messages y mapeos usuario-amigables (en español)
 * Compartido entre backend y frontend
 */
export const ERROR_MESSAGES = {
    UPLOAD_FAILED: 'No pudimos subir el archivo. Verifica tu conexión e intenta nuevamente.',
    UNSUPPORTED_FORMAT: 'Formato de archivo no soportado. Usa JPG, PNG, HEIC, PDF o texto plano.',
    FILE_TOO_LARGE: 'El archivo es muy grande (máx. 50 MB). Intenta con un archivo más pequeño.',
    FILE_TOO_SMALL: 'El archivo es muy pequeño o está vacío. Prueba con otro archivo.',
    TRANSCRIPTION_FAILED: 'No pudimos leer el archivo. Intenta con mejor iluminación o un PDF diferente.',
    INSUFFICIENT_CONTENT: 'Este material tiene muy poco texto para generar una sesión. Prueba con apuntes más completos.',
    EXTRACTION_FAILED: 'No pudimos extraer los conceptos clave. Intenta con material más estructurado.',
    GENERATION_FAILED: 'Error al generar la sesión. Intenta nuevamente en unos momentos.',
    GROUNDING_VALIDATION_FAILED: 'No pudimos validar que el contenido provenga de tu material. Intenta con otro archivo.',
    UNKNOWN_ERROR: 'Algo salió mal. Por favor intenta nuevamente o contacta con soporte.',
};
export const ERROR_DETAILS = {
    UPLOAD_FAILED: 'Upload to Firebase Cloud Storage failed',
    UNSUPPORTED_FORMAT: 'MIME type not in allowed list',
    FILE_TOO_LARGE: 'File size exceeds 50 MB limit',
    FILE_TOO_SMALL: 'File is empty or below minimum size threshold',
    TRANSCRIPTION_FAILED: 'Claude transcription/OCR returned error or empty result',
    INSUFFICIENT_CONTENT: 'Transcription word count < 100 words',
    EXTRACTION_FAILED: 'Concept extraction step failed in Claude',
    GENERATION_FAILED: 'Question/flashcard generation failed in Claude',
    GROUNDING_VALIDATION_FAILED: 'Grounding validation score < 0.5 or quote matching failed',
    UNKNOWN_ERROR: 'Unhandled exception during session generation',
};
export function getErrorMessage(code) {
    return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN_ERROR;
}
export function getErrorDetails(code) {
    return ERROR_DETAILS[code] ?? ERROR_DETAILS.UNKNOWN_ERROR;
}
