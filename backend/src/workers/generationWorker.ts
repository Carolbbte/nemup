/**
 * Generation worker process — a separate Node process from the main Express
 * server (`src/index.ts`), started via `npm run worker`. Consumes the
 * 'generation' BullMQ queue: downloads the uploaded file, transcribes it
 * with the existing extraction logic, runs the v2 generation pipeline, and
 * persists the result.
 */

import { Worker, type Job } from 'bullmq';
import { getRedisConnection, GENERATION_QUEUE_NAME, type GenerationJobData, type GenerationJobResult } from '../queue/generationQueue.js';
import { getGenerationJobStatus, setGenerationJobStatus } from '../queue/generationJobStatus.js';
import { downloadFileFromStorage, initializeFirebase } from '../services/firebaseAdmin.js';
import { transcribeDocumentFromBuffer } from '../services/transcriptionService.js';
import { generateSessionV2 } from '../generation/v2/orchestrator.js';
import { saveGeneratedSession } from '../repository/sessionRepository.js';
import { config } from '../config.js';

async function processGenerationJob(job: Job<GenerationJobData>): Promise<GenerationJobResult> {
  const { documentId, sessionId, userId, storagePath, mimeType, fileName, config: sessionConfig, curso } = job.data;

  // Idempotency guard: if a previous run of this documentId already finished
  // successfully, don't repeat the (paid) AI calls — this covers the case
  // where the original completed job has already been removed from BullMQ
  // (removeOnComplete) and someone re-enqueues the same documentId.
  const existing = await getGenerationJobStatus(documentId);
  if (existing?.status === 'completed') {
    console.log(`[GenerationWorker] documentId=${documentId} already completed — skipping`);
    return { sessionId: existing.sessionId ?? sessionId };
  }

  await setGenerationJobStatus(documentId, 'processing', { sessionId, userId, fileName });

  try {
    console.log(`[GenerationWorker] documentId=${documentId} downloading ${storagePath}`);
    const buffer = await downloadFileFromStorage(storagePath);

    const { transcription, wordCount } = await transcribeDocumentFromBuffer(buffer, mimeType, fileName);
    if (wordCount < 50) {
      throw new Error('El material tiene muy poco texto para generar una sesión efectiva.');
    }

    console.log(`[GenerationWorker] documentId=${documentId} transcribed (${wordCount} words) — generating v2 session`);
    const session = await generateSessionV2(transcription, sessionConfig, curso);

    // generateSessionV2 doesn't know about request/job identity — stamp it here.
    session.id = sessionId;
    session.userId = userId;
    session.documentId = documentId;

    // Temporary diagnostic — dumps the exact options array being persisted for
    // every interactive slide, to settle whether a "blank options" report is a
    // real backend regression or a stale/cached session on the client. Every
    // static/simulated check of this pipeline so far has produced correct,
    // non-empty options — this proves (or disproves) that against the ACTUAL
    // data being saved for a real generation. Safe to remove once resolved.
    (session.summary?.slides ?? []).forEach((s: any, i: number) => {
      if (Array.isArray(s.options) && s.options.length > 0) {
        console.log(`[GenerationWorker][DIAG] slide ${i} (${s.type}) options=${JSON.stringify(s.options)} correctAnswer=${s.correctAnswer}`);
      }
    });

    await saveGeneratedSession(userId, sessionId, session);
    await setGenerationJobStatus(documentId, 'completed', { sessionId, userId });

    console.log(`[GenerationWorker] documentId=${documentId} completed — sessionId=${sessionId}`);
    return { sessionId };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error(`[GenerationWorker] documentId=${documentId} failed:`, message);
    await setGenerationJobStatus(documentId, 'failed', { sessionId, userId, error: message });
    throw err;
  }
}

export function startGenerationWorker(): Worker<GenerationJobData, GenerationJobResult> {
  // getRedisConnection() opens the connection here — the first time the
  // worker process actually starts, not just from importing this module.
  const worker = new Worker<GenerationJobData, GenerationJobResult>(
    GENERATION_QUEUE_NAME,
    processGenerationJob,
    { connection: getRedisConnection(), concurrency: 2 },
  );

  worker.on('completed', (job) => console.log(`[GenerationWorker] job ${job.id} completed`));
  worker.on('failed', (job, err) => console.error(`[GenerationWorker] job ${job?.id} failed:`, err?.message));

  return worker;
}

initializeFirebase()
  .then(() => {
    startGenerationWorker();
    console.log(`[GenerationWorker] listening on queue "${GENERATION_QUEUE_NAME}" (redis: ${config.redis_url})`);
  })
  .catch((err) => {
    console.error('[GenerationWorker] failed to start:', err);
    process.exit(1);
  });
