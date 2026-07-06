/**
 * Sessions route for generating study sessions.
 *
 * POST /generate branches on config.use_generation_v2 (env var
 * USE_GENERATION_V2, default false — no redeploy needed to toggle):
 *   - v1 (default): legacy synchronous SSE flow, unchanged from before the
 *     v2 migration — generateSessionContent/generateSkillMission run inline
 *     in the request, streaming progress events, ending in a 'complete' event.
 *   - v2 (flag on): uploads to Storage, records a 'pending' job, enqueues it
 *     on the 'generation' BullMQ queue, and responds 202 {jobId} immediately.
 *     The actual generation (generateSessionV2) runs in
 *     workers/generationWorker.ts.
 *
 * GET /:jobId exists regardless of the flag — only the v2 branch produces
 * jobs for it to poll, but it doesn't interfere with v1.
 */

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { uploadFileToStorage } from '../services/firebaseAdmin.js';
import { transcribeDocumentFromBuffer } from '../services/transcriptionService.js';
import {
  generateSessionContent,
  generateSkillMission,
  validateGrounding,
  buildGeneratedSession,
  validateSessionEngagement,
  checkSemanticGrounding,
  validateQuestionConsistency,
} from '../services/generationService.js';
import {
  saveDocumentMetadata,
  saveGeneratedSession,
  saveSkillPath,
  getGeneratedSession,
  applyUserRewards,
} from '../repository/sessionRepository.js';
import { classifyContent } from '../services/pedagogicalClassifier.js';
import { buildDesafioFromMission } from '../services/desafioAdapter.js';
import { generateDesafioFormats } from '../services/desafioGenerationService.js';
import { extractKnowledge, type KnowledgeGraph } from '../services/knowledgeExtractor.js';
import { enqueueGenerationJob } from '../queue/generationQueue.js';
import { getGenerationJobStatus, setGenerationJobStatus } from '../queue/generationJobStatus.js';
import type { SessionConfig } from '../types.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── v1 (legacy SSE) helpers ───────────────────────────────────────────────────

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
  if (config.use_generation_v2) {
    return handleGenerateV2(req, res);
  }
  return handleGenerateV1(req, res);
});

// ── v1 — legacy synchronous SSE pipeline (unchanged behavior) ────────────────

async function handleGenerateV1(req: express.Request, res: express.Response) {
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
  const curso = configValues.curso || '1º Medio';
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

  // ── Knowledge extraction (incremental integration — fallback-safe) ───────────
  let knowledgeGraph: KnowledgeGraph | null = null;
  try {
    knowledgeGraph = await extractKnowledge({
      transcription,
      subject: (configValues as any).subject ?? undefined,
      curso,
    });
  } catch (err: any) {
    console.warn('[Sessions] KnowledgeExtractor failed (non-fatal), continuing with legacy flow:', err?.message);
  }

  // Step 3: Classify content to decide single-mission vs multi-skill path
  sendSse(res, 'progress', createProgressPayload('extracting', 40, 'Detectando habilidades clave...'));
  const classification = classifyContent(knowledgeGraph ?? transcription);
  const detectedSkills = classification.detectedSkills;
  console.log(`[Sessions] Tipo pedagógico: ${classification.type}, habilidades: ${detectedSkills.length}`);

  // ── MULTI-SKILL PATH (PROCEDURAL with ≥1 skill detected) ─────────────────────
  if (classification.type === 'PROCEDURAL' && detectedSkills.length > 0) {
    const skills = detectedSkills.slice(0, 4); // limit to 4 missions max
    const pathId = randomUUID();
    const allMissions: Array<{ missionIndex: number; skillId: string; skillLabel: string; sessionId: string; session: any }> = [];

    // Keepalive heartbeat — prevents Railway/nginx from timing out the SSE connection
    // during long OpenAI API calls (each call can take 30–90 s with no data flowing)
    const heartbeat = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch {}
    }, 20000);

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const pct = 40 + Math.round((i / skills.length) * 50);
      sendSse(res, 'progress', createProgressPayload(
        `generating_skill_${i + 1}`,
        pct,
        `Misión ${i + 1}/${skills.length}: "${skill.skillLabel}"...`,
      ));
      sendSse(res, 'mission_generating', { missionIndex: i, total: skills.length, skillId: skill.skillId, skillLabel: skill.skillLabel });

      let generation: Awaited<ReturnType<typeof generateSkillMission>>;
      try {
        generation = await generateSkillMission(transcription, sessionConfig, curso, skill, skills, knowledgeGraph);
      } catch (err: any) {
        console.error(`[Sessions] Mission ${i} generation error:`, err?.message);
        continue;
      }

      const validation = validateGrounding(generation, transcription);
      const missionSessionId = randomUUID();
      const missionSession = buildGeneratedSession(userId, documentId, transcription, wordCount, sessionConfig, {
        ...generation,
        groundingScore: validation.score,
      });

      allMissions.push({ missionIndex: i, skillId: skill.skillId, skillLabel: skill.skillLabel, sessionId: missionSessionId, session: missionSession });

      sendSse(res, 'mission_complete', {
        missionIndex: i,
        total: skills.length,
        skillId: skill.skillId,
        skillLabel: skill.skillLabel,
        sessionId: missionSessionId,
        session: missionSession,
      });

      // Persist each mission session (non-blocking)
      saveGeneratedSession(userId, missionSessionId, missionSession)
        .catch(err => console.warn(`[Sessions] Session save error (mission ${i}):`, err?.message));
    }

    clearInterval(heartbeat);

    if (allMissions.length === 0) {
      sendSse(res, 'error', { code: 'GENERATION_FAILED', message: 'No se pudo generar ninguna misión.' });
      return res.end();
    }

    // Save skill path with index-only entries (no embedded sessions)
    const skillPath = {
      pathId,
      userId,
      documentId,
      totalMissions: allMissions.length,
      missions: allMissions.map(m => ({ missionIndex: m.missionIndex, skillId: m.skillId, skillLabel: m.skillLabel, sessionId: m.sessionId })),
      createdAt: new Date().toISOString(),
    };
    saveSkillPath(userId, pathId, skillPath)
      .catch(err => console.warn('[Sessions] Skill path save error:', err?.message));

    applyUserRewards(userId, allMissions[0].session.baseXpReward, 0)
      .catch(err => console.warn('[Sessions] Rewards error:', err?.message));

    // ── Desafío (Mission content + AI format diversification) ───────────────
    sendSse(res, 'progress', createProgressPayload('generating_desafio', 95, 'Preparando modo Desafío...'));
    try {
      const firstMissionSlides = (allMissions[0].session.summary as any).slides ?? [];
      const firstMissionTopic = allMissions[0].skillLabel ?? '';
      let desafioFormats;
      try {
        desafioFormats = await generateDesafioFormats(firstMissionSlides, firstMissionTopic);
      } catch (fmtErr: any) {
        console.warn('[Sessions] Desafío format generation failed (non-fatal):', fmtErr?.message);
      }
      const desafioSession = buildDesafioFromMission(firstMissionSlides, firstMissionTopic, desafioFormats);
      if (desafioSession.conceptCount > 0) {
        (allMissions[0].session as any).desafio = desafioSession;
        console.log(`[Sessions] Desafío construido (PROCEDURAL): ${desafioSession.conceptCount} conceptos`);
      }
    } catch (err: any) {
      console.warn('[Sessions] Desafío build failed (non-fatal):', err?.message);
    }

    sendSse(res, 'progress', createProgressPayload('done', 100, `${allMissions.length} misiones listas.`));
    sendSse(res, 'complete', {
      pathId,
      totalMissions: allMissions.length,
      missions: allMissions,
      // backward-compat: first mission as the primary session
      sessionId: allMissions[0].sessionId,
      session: allMissions[0].session,
    });
    return res.end();
  }

  // ── SINGLE-MISSION PATH (CONCEPTUAL / MEMORIZATION / MIXED) ─────────────────
  sendSse(res, 'progress', createProgressPayload('generating', 60, 'Generando misión...'));
  // Keepalive heartbeat — prevents Railway/nginx from timing out the SSE connection
  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch {}
  }, 20000);
  let generation: Awaited<ReturnType<typeof generateSessionContent>>;
  try {
    generation = await generateSessionContent(transcription, sessionConfig, curso, knowledgeGraph);
  } catch (err: any) {
    clearInterval(heartbeat);
    console.error('[Sessions] Generation error:', err?.message);
    sendSse(res, 'error', { code: 'GENERATION_FAILED', message: `Error al generar con IA: ${err?.message}` });
    return res.end();
  }
  clearInterval(heartbeat);

  sendSse(res, 'progress', createProgressPayload('generating', 75, 'Generando preguntas y flashcards...'));
  generation.questions.forEach((question, index) => {
    sendSse(res, 'question_generated', { question, index, total: generation.questions.length });
  });

  sendSse(res, 'progress', createProgressPayload('validating_grounding', 85, 'Validando anclaje al documento...'));
  const validation = validateGrounding(generation, transcription);
  if (!validation.validated) {
    console.warn('[Sessions] Grounding score low:', validation.score, '— continuing anyway');
  }

  let session = buildGeneratedSession(userId, documentId, transcription, wordCount, sessionConfig, {
    ...generation,
    groundingScore: validation.score,
  });

  // ── Semantic grounding check ─────────────────────────────────────────────────
  let semanticResult = checkSemanticGrounding(transcription, session.summary.slides as any);
  console.log('[Sessions] Doc keywords (top 10):', semanticResult.docKeywords.slice(0, 10).join(', '));
  console.log('[Sessions] Overall semantic overlap:', (semanticResult.overallOverlap * 100).toFixed(1) + '%');
  if (semanticResult.contaminated) {
    console.warn('[Sessions] ⚠️ Contamination detected in slides:', semanticResult.contaminatedSlides);
  } else {
    console.log('[Sessions] Semantic grounding OK');
  }

  // ── Question consistency check ────────────────────────────────────────────────
  const consistencyReport = validateQuestionConsistency(session.summary.slides as any);
  if (!consistencyReport.allConsistent) {
    consistencyReport.results.filter(r => !r.consistent).forEach(r => {
      console.warn(`[Sessions] Inconsistency slide ${r.slideIndex} (${r.slideType}): ${r.issue}`);
    });
  } else {
    console.log('[Sessions] Question consistency OK');
  }

  // ── Engagement check ──────────────────────────────────────────────────────────
  const engagementReport = validateSessionEngagement(session.summary.slides as any, session.questions);
  if (!engagementReport.valid) {
    console.warn('[Sessions] Engagement issues:', engagementReport.issues);
  } else {
    console.log('[Sessions] Engagement OK — interactions:', engagementReport.interactionCount);
  }

  // ── Desafío (Mission content + AI format diversification) ────────────────
  sendSse(res, 'progress', createProgressPayload('generating_desafio', 90, 'Preparando modo Desafío...'));
  try {
    const sessionSlides = session.summary.slides as any[];
    const sessionTopic = (session.summary as any).title ?? '';
    let desafioFormats;
    try {
      desafioFormats = await generateDesafioFormats(sessionSlides, sessionTopic);
    } catch (fmtErr: any) {
      console.warn('[Sessions] Desafío format generation failed (non-fatal):', fmtErr?.message);
    }
    const desafioSession = buildDesafioFromMission(sessionSlides, sessionTopic, desafioFormats);
    if (desafioSession.conceptCount > 0) {
      (session as any).desafio = desafioSession;
      console.log(`[Sessions] Desafío construido: ${desafioSession.conceptCount} conceptos`);
    }
  } catch (err: any) {
    console.warn('[Sessions] Desafío build failed (non-fatal):', err?.message);
  }

  Promise.all([
    saveGeneratedSession(userId, sessionId, session),
    applyUserRewards(userId, session.baseXpReward, 0),
  ]).catch((err) => console.warn('[Sessions] Persistence error (non-fatal):', err?.message));

  sendSse(res, 'progress', createProgressPayload('done', 100, 'Sesión lista.'));
  sendSse(res, 'complete', { pathId: null, totalMissions: 1, missions: [{ missionIndex: 0, skillId: null, skillLabel: null, sessionId, session }], sessionId, session });
  return res.end();
}

// ── v2 — async queue-backed pipeline (behind USE_GENERATION_V2) ──────────────

async function handleGenerateV2(req: express.Request, res: express.Response) {
  const files = (req as express.Request & { files?: Express.Multer.File[] }).files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ code: 'UPLOAD_FAILED', message: 'No se recibió ningún archivo.' });
  }
  // Use first file as the primary document reference — same convention as v1.
  const file = files[0];

  const configJson = req.body.config;
  if (!configJson) {
    return res.status(400).json({ code: 'UNKNOWN_ERROR', message: 'Falta la configuración de la sesión.' });
  }

  const configValues = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
  const sessionConfig = configValues as SessionConfig;
  const curso = configValues.curso || '1º Medio';
  const userId = req.body.userId ?? 'anonymous';

  const documentId = randomUUID();
  const sessionId = randomUUID();

  try {
    // Upload must be awaited (not fire-and-forget like v1) — the worker needs
    // a real storagePath to download from once it picks up the job.
    const storagePath = await uploadFileToStorage(userId, documentId, file.buffer, file.mimetype, file.originalname);

    await saveDocumentMetadata(userId, documentId, {
      type: 'document',
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      storagePath,
    });

    await setGenerationJobStatus(documentId, 'pending', { userId, sessionId, fileName: file.originalname });

    await enqueueGenerationJob({
      documentId,
      sessionId,
      userId,
      storagePath,
      mimeType: file.mimetype,
      fileName: file.originalname,
      config: sessionConfig,
      curso,
    });

    console.log(`[Sessions] documentId=${documentId} enqueued — jobId=${documentId}`);
    return res.status(202).json({ jobId: documentId });
  } catch (err: any) {
    console.error('[Sessions] Failed to enqueue generation job:', err?.message);
    return res.status(500).json({ code: 'ENQUEUE_FAILED', message: 'No se pudo iniciar la generación.' });
  }
}

// ── Job status polling (v2 only, but always registered) ──────────────────────
// Returns { status: 'pending' | 'processing' | 'failed' } while the job is in
// flight, or { status: 'completed', session } once the worker has finished.
router.get('/:jobId', async (req, res) => {
  const { jobId } = req.params;

  const job = await getGenerationJobStatus(jobId);
  if (!job) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'No existe un job con ese id.' });
  }

  if (job.status !== 'completed') {
    return res.status(200).json({ status: job.status, ...(job.error ? { error: job.error } : {}) });
  }

  const session = await getGeneratedSession(job.userId, job.sessionId);
  if (!session) {
    return res.status(500).json({ status: 'failed', code: 'SESSION_MISSING', message: 'El job se marcó completo pero no se encontró la sesión.' });
  }

  return res.status(200).json({ status: 'completed', session });
});

// ── Performance-based reward endpoint ────────────────────────────────────────
// Called by frontend when student reaches the victory screen.
// Body: { userId, xp, gems }
router.post('/rewards/apply', async (req, res) => {
  const { userId, xp, gems } = req.body ?? {};
  if (!userId || typeof xp !== 'number' || typeof gems !== 'number') {
    return res.status(400).json({ error: 'userId, xp (number) and gems (number) required.' });
  }
  try {
    await applyUserRewards(userId, Math.max(0, Math.round(xp)), Math.max(0, Math.round(gems)));
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[Sessions] /rewards/apply error:', err?.message);
    res.status(500).json({ error: 'Failed to apply rewards.' });
  }
});

export default router;
