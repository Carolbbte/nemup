/**
 * Sessions route for generating study sessions with SSE progress.
 */

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { uploadFileToStorage } from '../services/firebaseAdmin.js';
import { transcribeDocument } from '../services/transcriptionService.js';
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

  try {
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

    sendSse(res, 'progress', createProgressPayload('uploading', 10, 'Subiendo documento...'));
    const storagePath = await uploadFileToStorage(userId, documentId, file.buffer, file.mimetype, file.originalname);

    await saveDocumentMetadata(userId, documentId, {
      type: file.mimetype.startsWith('image/') ? 'photo' : file.mimetype === 'application/pdf' ? 'pdf' : 'text',
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      storagePath,
      metadata: {
        originalName: file.originalname,
      },
    });

    sendSse(res, 'progress', createProgressPayload('transcribing', 25, 'Transcribiendo contenido...'));
    const { transcription, wordCount } = await transcribeDocument(storagePath, file.mimetype, file.originalname);

    if (wordCount < 100) {
      sendSse(res, 'error', {
        code: 'INSUFFICIENT_CONTENT',
        message: 'El material tiene muy poco texto para generar una sesión efectiva.',
      });
      return res.end();
    }

    sendSse(res, 'progress', createProgressPayload('extracting', 45, 'Analizando conceptos clave...'));
    const generation = await generateSessionContent(transcription, sessionConfig);

    sendSse(res, 'progress', createProgressPayload('generating', 70, 'Generando preguntas y flashcards...'));

    sendSse(res, 'progress', createProgressPayload('validating_grounding', 85, 'Validando anclaje al documento...'));
    const validation = validateGrounding(generation, transcription);
    if (!validation.validated) {
      sendSse(res, 'error', {
        code: 'GROUNDING_VALIDATION_FAILED',
        message: 'No se pudo validar que el contenido generado esté anclado al documento.',
        details: { missingQuotes: validation.missingQuotes },
      });
      return res.end();
    }

    const session = buildGeneratedSession(userId, documentId, transcription, wordCount, sessionConfig, {
      ...generation,
      groundingScore: validation.score,
    });

    await saveGeneratedSession(userId, sessionId, session);
    await applyUserRewards(userId, session.xpReward, session.gemReward);

    sendSse(res, 'progress', createProgressPayload('done', 100, 'Sesión lista.'));
    sendSse(res, 'complete', { sessionId, session });
    return res.end();
  } catch (error: any) {
    console.error('[Sessions] Error generating session:', error);
    sendSse(res, 'error', {
      code: 'GENERATION_FAILED',
      message: 'Hubo un error generando la sesión. Intenta nuevamente más tarde.',
      details: error?.message,
    });
    return res.end();
  }
});

export default router;
