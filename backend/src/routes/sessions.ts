/**
 * Sessions route for generating study sessions with SSE progress.
 */

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { uploadFileToStorage } from '../services/firebaseAdmin.js';
import { transcribeDocumentFromBuffer } from '../services/transcriptionService.js';
import {
  generateSessionContent,
  validateGrounding,
  buildGeneratedSession,
} from '../services/generationService.js';
import {
  saveDocumentMetadata,
  saveGeneratedSession,
  applyUserRewards,
} from '../repository/sessionRepository.js';
import type { SessionConfig } from '../types.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function sendSse(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function createProgressPayload(stage: string, progress: number, message: string) {
  return {
    stage,
    status: stage === 'done' ? 'complete' : 'processing',
    progress,
    message,
  };
}

router.post('/generate', upload.single('document'), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const file = (req as express.Request & { file?: Express.Multer.File }).file;
  if (!file) {
    sendSse(res, 'error', { code: 'UPLOAD_FAILED', message: 'No se recibió ningún archivo.' });
    return res.end();
  }

  const configJson = req.body.config;
  if (!configJson) {
    sendSse(res, 'error', { code: 'UNKNOWN_ERROR', message: 'Falta la configuración de la sesión.' });
    return res.end();
  }

  const configValues = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
  const sessionConfig = configValues as SessionConfig;
  const userId = req.body.userId ?? 'anonymous';
  const documentId = randomUUID();
  const sessionId = randomUUID();

  // Step 1: Upload to Storage (non-blocking)
  sendSse(res, 'progress', createProgressPayload('uploading', 10, 'Procesando documento...'));
  uploadFileToStorage(userId, documentId, file.buffer, file.mimetype, file.originalname)
    .catch((err) => console.warn('[Sessions] Storage upload failed (non-fatal):', err?.message));

  // Step 2: Transcribe from buffer directly
  sendSse(res, 'progress', createProgressPayload('transcribing', 25, 'Transcribiendo contenido...'));
  let transcription: string;
  let wordCount: number;
  try {
    ({ transcription, wordCount } = await transcribeDocumentFromBuffer(file.buffer, file.mimetype, file.originalname));
  } catch (err: any) {
    console.error('[Sessions] Transcription error:', err?.message);
    sendSse(res, 'error', { code: 'TRANSCRIPTION_FAILED', message: `Error al leer el documento: ${err?.message}` });
    return res.end();
  }

  if (wordCount < 50) {
    sendSse(res, 'error', {
      code: 'INSUFFICIENT_CONTENT',
      message: 'El material tiene muy poco texto para generar una sesión efectiva.',
    });
    return res.end();
  }

  // Step 3: Generate content with OpenAI
  sendSse(res, 'progress', createProgressPayload('extracting', 45, 'Analizando conceptos clave...'));
  let generation: Awaited<ReturnType<typeof generateSessionContent>>;
  try {
    generation = await generateSessionContent(transcription, sessionConfig);
  } catch (err: any) {
    console.error('[Sessions] Generation error:', err?.message);
    sendSse(res, 'error', { code: 'GENERATION_FAILED', message: `Error al generar con IA: ${err?.message}` });
    return res.end();
  }

  sendSse(res, 'progress', createProgressPayload('generating', 70, 'Generando preguntas y flashcards...'));

  // Step 4: Validate grounding
  sendSse(res, 'progress', createProgressPayload('validating_grounding', 85, 'Validando anclaje al documento...'));
  const validation = validateGrounding(generation, transcription);
  if (!validation.validated) {
    sendSse(res, 'error', {
      code: 'GROUNDING_VALIDATION_FAILED',
      message: 'No se pudo validar que el contenido generado esté anclado al documento.',
    });
    return res.end();
  }

  // Step 5: Build and persist session (best-effort)
  const session = buildGeneratedSession(userId, documentId, transcription, wordCount, sessionConfig, {
    ...generation,
    groundingScore: validation.score,
  });

  Promise.all([
    saveGeneratedSession(userId, sessionId, session),
    applyUserRewards(userId, session.xpReward, session.gemReward),
  ]).catch((err) => console.warn('[Sessions] Persistence error (non-fatal):', err?.message));

  sendSse(res, 'progress', createProgressPayload('done', 100, 'Sesión lista.'));
  sendSse(res, 'complete', { sessionId, session });
  return res.end();
});

export default router;
