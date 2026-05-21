/**
 * Tipos compartidos entre backend (Node.js) y frontend (React Native)
 * Estructura de sesiones, contenido generado, progreso y errores
 */

// ============================================================================
// 1. CONTENIDO GENERADO
// ============================================================================

export interface MultipleChoiceQuestion {
  id: string;
  text: string;
  options: {
    id: string;
    text: string;
  }[];
  correctOptionId: string;
  explanation: string;
  sourceQuote: string; // Fragment from original transcription for grounding
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Flashcard {
  id: string;
  front: string; // Question / term
  back: string; // Answer / definition
  sourceQuote: string; // Fragment from original transcription for grounding
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Summary {
  id: string;
  title: string;
  sections: {
    heading: string;
    content: string;
    keyPoints: string[];
  }[];
  sourceQuotes: string[]; // Fragments validating the summary
}

// ============================================================================
// 2. SESIÓN COMPLETA
// ============================================================================

export interface GeneratedSession {
  id: string;
  userId: string;
  documentId: string; // Reference to uploaded document
  subject: string; // e.g., "Biología", "Matemáticas"
  topic: string; // e.g., "Mitosis y Meiosis"
  wordCount: number;
  difficulty: 'easy' | 'adaptive' | 'hard';
  format: SessionFormat[];
  estimatedDuration: number; // minutes
  transcription: string; // Original OCR/transcription for grounding
  questions: MultipleChoiceQuestion[];
  flashcards: Flashcard[];
  summary: Summary;
  metadata: {
    createdAt: string; // ISO timestamp
    processedAt: string; // ISO timestamp
    groundingValidated: boolean;
    groundingScore: number; // 0–1, fraction of content backed by source
  };
  xpReward: number;
  gemReward: number;
}

export type SessionFormat = 'quizzes' | 'flashcards' | 'summary' | 'mindmap';

// ============================================================================
// 3. DOCUMENTO SUBIDO
// ============================================================================

export type DocumentType = 'photo' | 'pdf' | 'gallery' | 'text';

export interface UploadedDocument {
  id: string;
  userId: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string; // Firebase Cloud Storage path
  uploadedAt: string; // ISO timestamp
  transcription?: string; // OCR result (populated after transcription step)
  metadata: {
    width?: number;
    height?: number;
    pageCount?: number;
    duration?: number; // for video/audio if applicable
  };
}

// ============================================================================
// 4. CONFIGURACIÓN DE SESIÓN (antes de generar)
// ============================================================================

export interface SessionConfig {
  documentId: string;
  format: SessionFormat[];
  difficulty: 'easy' | 'adaptive' | 'hard';
  estimatedDuration: number; // minutes, from slider
  subject?: string; // optional override, else auto-detect
  topic?: string; // optional override, else auto-detect
}

// ============================================================================
// 5. PROGRESO DE GENERACIÓN (para SSE)
// ============================================================================

export type PipelineStage =
  | 'uploading'
  | 'transcribing'
  | 'extracting'
  | 'generating'
  | 'validating_grounding'
  | 'done';

export type TaskStatus = 'done' | 'active' | 'pending';

export interface PipelineTask {
  stage: PipelineStage;
  label: string; // Human-readable label in Spanish
  status: TaskStatus;
  estimatedTimeRemaining?: number; // seconds
}

export interface GenerationProgress {
  stage: PipelineStage;
  status: 'processing' | 'complete' | 'error';
  progress: number; // 0–100, overall percentage
  tasks: PipelineTask[]; // List of all pipeline steps with current status
  timeRemainingSeconds?: number;
  message?: string; // Optional status message
}

// ============================================================================
// 6. ERRORES TIPADOS
// ============================================================================

export type GenerationErrorCode =
  | 'UPLOAD_FAILED'
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'FILE_TOO_SMALL'
  | 'TRANSCRIPTION_FAILED'
  | 'INSUFFICIENT_CONTENT'
  | 'EXTRACTION_FAILED'
  | 'GENERATION_FAILED'
  | 'GROUNDING_VALIDATION_FAILED'
  | 'UNKNOWN_ERROR';

export interface GenerationError {
  code: GenerationErrorCode;
  message: string; // User-facing message in Spanish
  details?: string; // Technical details for logging
  retryable: boolean;
}

// ============================================================================
// 7. RESPUESTA DEL ENDPOINT /sessions/generate
// ============================================================================

export interface GenerateSessionRequest {
  config: SessionConfig;
  // File uploaded separately (multipart/form-data)
}

export interface GenerateSessionResponse {
  sessionId: string;
  session: GeneratedSession;
}

// ============================================================================
// 8. CONSTANTS
// ============================================================================

export const PIPELINE_STAGES: PipelineStage[] = [
  'uploading',
  'transcribing',
  'extracting',
  'generating',
  'validating_grounding',
  'done',
];

export const PIPELINE_LABELS: Record<PipelineStage, string> = {
  uploading: 'Subiendo documento',
  transcribing: 'Transcribiendo material',
  extracting: 'Extrayendo conceptos clave',
  generating: 'Generando preguntas y flashcards',
  validating_grounding: 'Validando anclaje al documento',
  done: 'Sesión lista',
};

export const ESTIMATED_TIMES: Record<PipelineStage, number> = {
  uploading: 5, // seconds
  transcribing: 30,
  extracting: 20,
  generating: 60,
  validating_grounding: 10,
  done: 0,
};
