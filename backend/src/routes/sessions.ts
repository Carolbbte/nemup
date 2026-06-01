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
  validateSessionEngagement,
  checkSemanticGrounding,
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

router.post('/generate', upload.array('documents', 10), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const files = (req as express.Request & { files?: Express.Multer.File[] }).files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    sendSse(res, 'error', { code: 'UPLOAD_FAILED', message: 'No se recibió ningún archivo.' });
    return res.end();
  }
  // Use first file as the primary document reference
  const file = files[0];

  const configJson = req.body.config;
  if (!configJson) {
    sendSse(res, 'error', { code: 'UNKNOWN_ERROR', message: 'Falta la configuración de la sesión.' });
    return res.end();
  }

  const configValues = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
  const sessionConfig = configValues as SessionConfig;
  const curso = configValues.curso ?? '1º Medio';
  const userId = req.body.userId ?? 'anonymous';
  console.log('[Sessions] Curso recibido:', curso);
  const documentId = randomUUID();
  const sessionId = randomUUID();

  // Step 1: Upload to Storage (non-blocking)
  sendSse(res, 'progress', createProgressPayload('uploading', 10, 'Procesando documento...'));
  uploadFileToStorage(userId, documentId, file.buffer, file.mimetype, file.originalname)
    .catch((err) => console.warn('[Sessions] Storage upload failed (non-fatal):', err?.message));

  // Step 2: Transcribe all files and combine
  sendSse(res, 'progress', createProgressPayload('transcribing', 25, 'Transcribiendo contenido...'));
  let transcription: string;
  let wordCount: number;
  try {
    const results = await Promise.all(
      files.map(f => transcribeDocumentFromBuffer(f.buffer, f.mimetype, f.originalname))
    );
    transcription = results.map(r => r.transcription).filter(Boolean).join('\n\n');
    wordCount = results.reduce((sum, r) => sum + r.wordCount, 0);
    console.log('[Sessions] Extraction reports:', JSON.stringify(results.map(r => r.report)));
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

  // Emit transcript chunks — real data, no simulation
  const transcriptWords = transcription.split(' ');
  const CHUNK_SIZE = 35;
  for (let i = 0; i < transcriptWords.length; i += CHUNK_SIZE) {
    sendSse(res, 'transcript_chunk', {
      text: transcriptWords.slice(i, i + CHUNK_SIZE).join(' '),
      index: Math.floor(i / CHUNK_SIZE),
      total: Math.ceil(transcriptWords.length / CHUNK_SIZE),
    });
  }

  // Step 3: Generate content with OpenAI
  sendSse(res, 'progress', createProgressPayload('extracting', 45, 'Analizando conceptos clave...'));
  let generation: Awaited<ReturnType<typeof generateSessionContent>>;
  try {
    generation = await generateSessionContent(transcription, sessionConfig, curso);
  } catch (err: any) {
    console.error('[Sessions] Generation error:', err?.message);
    sendSse(res, 'error', { code: 'GENERATION_FAILED', message: `Error al generar con IA: ${err?.message}` });
    return res.end();
  }

  sendSse(res, 'progress', createProgressPayload('generating', 70, 'Generando preguntas y flashcards...'));

  // Emit each question as it's added — real data, sequential delivery
  generation.questions.forEach((question, index) => {
    sendSse(res, 'question_generated', { question, index, total: generation.questions.length });
  });

  // Step 4: Validate grounding (non-fatal — log score only)
  sendSse(res, 'progress', createProgressPayload('validating_grounding', 85, 'Validando anclaje al documento...'));
  const validation = validateGrounding(generation, transcription);
  if (!validation.validated) {
    console.warn('[Sessions] Grounding score low:', validation.score, '— continuing anyway');
  }

  // Step 5: Build and persist session (best-effort)
  let session = buildGeneratedSession(userId, documentId, transcription, wordCount, sessionConfig, {
    ...generation,
    groundingScore: validation.score,
  });

  // ── Semantic grounding check ─────────────────────────────────────────────────
  let semanticResult = checkSemanticGrounding(transcription, session.summary.slides as any);
  console.log('[Sessions] Doc keywords (top 10):', semanticResult.docKeywords.slice(0, 10).join(', '));
  console.log('[Sessions] Overall semantic overlap:', (semanticResult.overallOverlap * 100).toFixed(1) + '%');
  semanticResult.slideScores.forEach(s => {
    const flag = s.contaminated ? ' ⚠️ CONTAMINATED' : '';
    console.log(`[Sessions] Slide ${s.slideIndex} (${s.slideType}): overlap=${(s.overlap * 100).toFixed(0)}%${flag} keywords=[${s.slideKeywords.slice(0, 6).join(', ')}]`);
  });

  if (semanticResult.contaminated) {
    console.error('[Sessions] 🚨 CONTAMINATION DETECTED in slides:', semanticResult.contaminatedSlides, '— retrying generation');
    try {
      generation = await generateSessionContent(transcription, sessionConfig, curso);
      const retryValidation = validateGrounding(generation, transcription);
      session = buildGeneratedSession(userId, documentId, transcription, wordCount, sessionConfig, {
        ...generation,
        groundingScore: retryValidation.score,
      });
      semanticResult = checkSemanticGrounding(transcription, session.summary.slides as any);
      console.log('[Sessions] After retry — overlap:', (semanticResult.overallOverlap * 100).toFixed(1) + '% contaminated:', semanticResult.contaminated);
    } catch (retryErr: any) {
      console.error('[Sessions] Retry generation failed:', retryErr?.message);
    }
  } else {
    console.log('[Sessions] Semantic grounding OK');
  }

  // ── Engagement check ──────────────────────────────────────────────────────────
  const engagementReport = validateSessionEngagement(session.summary.slides as any, session.questions);
  if (!engagementReport.valid) {
    console.warn('[Sessions] Engagement issues:', engagementReport.issues);
  } else {
    console.log('[Sessions] Engagement OK — interactions:', engagementReport.interactionCount);
  }

  Promise.all([
    saveGeneratedSession(userId, sessionId, session),
    applyUserRewards(userId, session.xpReward, session.gemReward),
  ]).catch((err) => console.warn('[Sessions] Persistence error (non-fatal):', err?.message));

  sendSse(res, 'progress', createProgressPayload('done', 100, 'Sesión lista.'));
  sendSse(res, 'complete', { sessionId, session });
  return res.end();
});

export default router;
